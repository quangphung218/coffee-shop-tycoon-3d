#!/usr/bin/env node
// Measures how smooth the first seconds after loading are, in headless Chromium.
//
//   node scripts/measure-frames.mjs [--base <git-ref>] [--runs <n>] [--headed]
//
// Headless Chrome hands out frames on whole vsync intervals (about 83 ms
// each here even with no main-thread work), so frame times there only show
// long tasks; --headed opens a real window with real vsync for frame times.
//
// Serves dist/ (run `npm run build` first) and, with --base, a build of
// <git-ref>; loads each with an empty cache, waits for the `cst:world` mark
// (3D scene on screen behind the Main Menu) and records for WINDOW_MS:
// every requestAnimationFrame interval, counted from the mark, and every
// long task (PerformanceObserver 'longtask', main-thread work over 50 ms).
// Prints, per build and profile, the median over <n> runs of the frame time
// p50, p95 and max, the frames over 50 ms, and the count and total time of
// long tasks inside the window. Profiles match scripts/measure-startup.mjs:
// desktop, and mobile (150 ms RTT, 1.6 Mbps, CPU 4x). Runs take turns
// between builds so drift spreads over both. Runs the installed Chrome
// ($CHROME_PATH, else the usual install locations) so WebGL uses the GPU.
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildRef, startPreview, urlFor } from './capture-media.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.MEDIA_PORT ?? 4173);
const PROFILES = [
  { name: 'Desktop, no throttling' },
  // Lighthouse's mobile preset: slow 4G and a 4x slower CPU.
  { name: 'Mobile: 150 ms RTT, 1.6 Mbps, CPU 4x', network: { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 }, cpu: 4 },
];
/** Same window as measure-startup's Chrome. */
const VIEW = { width: 1280, height: 800 };
/** Sampled after the 3D scene appears, ms. */
const WINDOW_MS = 5000;
/** A frame or task longer than this is a visible hitch, ms. */
const JANK_MS = 50;
const TIMEOUT_MS = 90_000;
/** Date.now() inside the page, so the menu shop gets the same seed every run. */
const FIXED_NOW = 1760400000000;

/** Runs in the page before its scripts; resolves window.__frames once WINDOW_MS after cst:world has passed. */
const PROBE = `(() => {
  const tasks = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) tasks.push([e.startTime, e.duration]);
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  window.__frames = new Promise((resolve) => {
    new PerformanceObserver((list, po) => {
      const mark = list.getEntriesByName('cst:world')[0];
      if (!mark) return;
      po.disconnect();
      const t0 = mark.startTime;
      const end = t0 + ${WINDOW_MS};
      const ts = [t0];
      const frame = (t) => {
        ts.push(t);
        if (t < end) return requestAnimationFrame(frame);
        // Long tasks are reported a little after they end.
        setTimeout(() => {
          let total = 0;
          let count = 0;
          for (const [s, d] of tasks) {
            const a = Math.max(s, t0);
            const b = Math.min(s + d, end);
            if (b > a) {
              total += b - a;
              count += 1;
            }
          }
          resolve({ world: t0, ts, longTasks: count, longTaskMs: total });
        }, 200);
      };
      requestAnimationFrame(frame);
    }).observe({ type: 'mark', buffered: true });
  });
})();`;

function parseArgs(argv) {
  const args = { base: null, runs: 3, headed: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') args.base = argv[++i];
    else if (argv[i] === '--headed') args.headed = true;
    else if (argv[i] === '--runs') args.runs = Math.max(1, Number(argv[++i]) || 1);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

/**
 * Installed Chrome, as in measure-startup.mjs: Playwright's own headless
 * Chromium draws WebGL in software (SwiftShader), which makes every frame
 * slow and hides the hitches this script looks for.
 */
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error('Chrome not found; set CHROME_PATH');
  return found;
}

/** WebGL renderer string of a blank page, e.g. "ANGLE (Apple, ANGLE Metal Renderer: Apple M2…)". */
async function gpuName(browser) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return 'no WebGL2';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    });
  } finally {
    await page.close();
  }
}

/** Frame intervals of rAF timestamps (the first one counted from the mark). */
function intervals(ts) {
  const out = [];
  for (let i = 1; i < ts.length; i++) out.push(ts[i] - ts[i - 1]);
  return out;
}

const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : null);
const median = (xs) => {
  const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};
const ms = (x) => (x === null ? 'n/a' : `${Math.round(x)} ms`);

/** One cold load of `url`: frame and long-task stats for WINDOW_MS after cst:world. */
async function measureOnce(browser, url, profile) {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
  try {
    await context.addInitScript(
      `Date.now = () => ${FIXED_NOW};
      localStorage.setItem('cst3d:settings', ${JSON.stringify(JSON.stringify({ musicVolume: 0, sfxVolume: 0 }))});
      ${PROBE}`,
    );
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (profile.network) await cdp.send('Network.emulateNetworkConditions', profile.network);
    if (profile.cpu) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
    await page.goto(url, { waitUntil: 'commit' });
    const r = await page.evaluate((t) => Promise.race([window.__frames, new Promise((res) => setTimeout(() => res(null), t))]), TIMEOUT_MS);
    if (!r) return null;
    const frames = intervals(r.ts).sort((a, b) => a - b);
    return {
      world: r.world,
      frames: frames.length,
      p50: quantile(frames, 0.5),
      p95: quantile(frames, 0.95),
      max: frames.length ? frames[frames.length - 1] : null,
      janky: frames.filter((f) => f > JANK_MS).length,
      longTasks: r.longTasks,
      longTaskMs: r.longTaskMs,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const builds = [];
  const temps = [];
  const servers = [];
  let browser = null;
  try {
    if (args.base) {
      console.error(`Building ${args.base}…`);
      const dir = buildRef(args.base);
      temps.push(dir);
      builds.push({ label: `base (${args.base})`, root: dir });
    }
    builds.push({ label: 'working tree', root: ROOT });
    for (const [i, b] of builds.entries()) {
      servers.push(await startPreview(b.root, PORT + i));
      b.url = urlFor(PORT + i);
    }
    browser = await chromium.launch({
      executablePath: findChrome(),
      headless: !args.headed,
      args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
    });
    const gpu = await gpuName(browser);
    console.log(`Chrome ${browser.version()}${args.headed ? ' (headed)' : ' (headless)'}, WebGL: ${gpu}, ${VIEW.width}×${VIEW.height}, ${WINDOW_MS / 1000} s after cst:world, ${args.runs} runs per cell (median)\n`);
    if (/swiftshader|llvmpipe|software/i.test(gpu)) console.log('!! WebGL runs in software: every frame is CPU-bound, frame times say nothing about hitches.\n');
    console.log(`| Build | Profile | 3D scene | Frames | p50 | p95 | Max | Frames > ${JANK_MS} ms | Long tasks | Long task time |`);
    console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const profile of PROFILES) {
      const cells = builds.map((build) => ({ build, runs: [] }));
      for (let i = 0; i < args.runs; i++) {
        for (const c of cells) {
          const r = await measureOnce(browser, c.build.url, profile);
          console.error(`  ${c.build.label} · ${profile.name} · run ${i + 1}: ${r ? `p95 ${ms(r.p95)}, max ${ms(r.max)}, ${r.janky} frames > ${JANK_MS} ms, long tasks ${ms(r.longTaskMs)}` : 'timed out'}`);
          if (r) c.runs.push(r);
        }
      }
      for (const c of cells) {
        const pick = (k) => median(c.runs.map((r) => r[k]));
        const jankRuns = c.runs.map((r) => r.janky).join('/');
        console.log(
          `| ${c.build.label} | ${profile.name} | ${ms(pick('world'))} | ${pick('frames') ?? 'n/a'} | ${ms(pick('p50'))} | ${ms(pick('p95'))} | ${ms(pick('max'))} | ${pick('janky') ?? 'n/a'} (${jankRuns}) | ${pick('longTasks') ?? 'n/a'} | ${ms(pick('longTaskMs'))} |`,
        );
      }
    }
  } finally {
    await browser?.close();
    for (const s of servers) s.kill();
    for (const t of temps) rmSync(t, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
