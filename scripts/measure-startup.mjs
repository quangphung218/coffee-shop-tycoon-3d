#!/usr/bin/env node
// Measures how fast the production build shows the Main Menu, in headless Chrome.
//
//   node scripts/measure-startup.mjs [--base <git-ref>] [--runs <n>] [--fps | --fps-only] [--quality medium|high]
//
// Builds the working tree (and <git-ref> with --base), serves each build with
// `vite preview`, loads it with an empty cache and prints chunk sizes and the
// median time to first paint, Main Menu on screen and 3D scene on screen for
// each PROFILES entry: desktop unthrottled, mobile network + CPU 4x, and the
// same on a 390×844 @3x touch phone screen. Builds are served from $PORT
// (default 4173) upwards, one port per build.
// --fps also plays day 1 on Easy at 4x up to the peak phase at each FPS_QUALITIES
// graphics setting, <n> times per build taking turns between builds, and prints
// the median over runs of the average frame rate across FPS_SECONDS of play and
// the 5th-percentile frame rate of all those frames. --fps-only skips the
// startup table; --quality limits the FPS pass to one setting. Chrome comes
// from scripts/lib/browser.mjs ($CHROME_PATH, else the usual install
// locations) so WebGL uses the GPU; the run holds the perf lock of
// scripts/lib/perf-lock.mjs, so it never shares the GPU with perf:frames.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, preview } from 'vite';
import { BROWSER_ARGS, findChrome, isSoftwareGl } from './lib/browser.mjs';
import { acquirePerfLock } from './lib/perf-lock.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const PROFILES = [
  { name: 'Desktop, no throttling' },
  // Lighthouse's mobile preset: slow 4G and a 4x slower CPU.
  { name: 'Mobile: 150 ms RTT, 1.6 Mbps, CPU 4x', latency: 150, down: (1.6 * 1024 * 1024) / 8, up: (750 * 1024) / 8, cpu: 4 },
  // The same network and CPU on a phone screen with touch.
  {
    name: 'Phone 390×844 @3x: 150 ms RTT, 1.6 Mbps, CPU 4x',
    latency: 150,
    down: (1.6 * 1024 * 1024) / 8,
    up: (750 * 1024) / 8,
    cpu: 4,
    view: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
  },
];
const TIMEOUT_MS = 60_000;

/** Graphics settings the FPS pass compares (Vừa, Cao). */
const FPS_QUALITIES = ['medium', 'high'];
/** Seconds of frames sampled once the peak phase starts. */
const FPS_SECONDS = 10;
/** A retina laptop screen, so the per-quality pixel-ratio cap matters. */
const FPS_VIEW = { width: 1280, height: 800, deviceScaleFactor: 2 };
/** Window while playing up to the peak. */
const FPS_WAIT_VIEW = { width: 320, height: 240, deviceScaleFactor: 1 };
/** Day 1 at 4x reaches the peak in about a minute; software WebGL is slower. */
const PEAK_TIMEOUT_MS = 8 * 60_000;

/** Runs in the page before any of its scripts; resolves window.__cst with timings in ms since navigation. */
const PROBE = `window.__cst = new Promise((resolve) => {
  const t = { boot: false };
  const painted = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
  const finish = () => {
    if (t.menu === undefined || t.world === undefined) return;
    observer.disconnect();
    // The paint entry can be reported a little after the frame it describes.
    const done = (fcp) => {
      t.fcp = fcp;
      resolve(t);
    };
    const timer = setTimeout(() => done(null), 3000);
    new PerformanceObserver((list, po) => {
      const e = list.getEntriesByName('first-contentful-paint')[0];
      if (!e) return;
      po.disconnect();
      clearTimeout(timer);
      done(e.startTime);
    }).observe({ type: 'paint', buffered: true });
  };
  const observer = new MutationObserver(() => {
    if (document.getElementById('boot')) t.boot = true;
    if (t.menuSeen === undefined && document.querySelector('.ui-screen.is-menu')) {
      t.menuSeen = true;
      painted(() => {
        t.menu = performance.now();
        // Before the boot screen existed, menu and scene appeared in the same frame.
        if (!t.boot) t.world = t.menu;
        finish();
      });
    }
    if (t.worldSeen === undefined && document.querySelector('#scene.is-ready')) {
      t.worldSeen = true;
      painted(() => {
        t.world = performance.now();
        finish();
      });
    }
  });
  observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
});`;

function parseArgs(argv) {
  const args = { base: null, runs: 3, fps: false, qualities: FPS_QUALITIES };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') args.base = argv[++i];
    else if (argv[i] === '--runs') args.runs = Math.max(1, Number(argv[++i]) || 1);
    else if (argv[i] === '--fps') args.fps = true;
    else if (argv[i] === '--fps-only') args.fps = args.fpsOnly = true;
    else if (argv[i] === '--quality') {
      const q = argv[++i];
      if (!FPS_QUALITIES.includes(q)) throw new Error(`--quality must be one of ${FPS_QUALITIES.join(', ')}`);
      args.qualities = [q];
    } else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

/** First port to serve builds from: $PORT, or 4173 when it is not set. Exits on a bad $PORT. */
function basePort() {
  const raw = process.env.PORT;
  if (raw === undefined) return 4173;
  const port = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`PORT must be a whole number from 1 to 65535, got ${JSON.stringify(raw)}`);
    process.exit(1);
  }
  return port;
}

/** Exports <ref> into a temp dir sharing this checkout's node_modules. */
function checkoutRef(ref) {
  // macOS tmpdir() is under the /var -> /private/var symlink; vite needs the real path.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cst-base-')));
  const tar = spawnSync('git', ['archive', '--format=tar', ref], { maxBuffer: 1 << 30 });
  if (tar.status !== 0) throw new Error(`git archive ${ref} failed: ${tar.stderr}`);
  const file = join(dir, 'src.tar');
  writeFileSync(file, tar.stdout);
  const x = spawnSync('tar', ['-xf', file, '-C', dir]);
  if (x.status !== 0) throw new Error(`tar failed: ${x.stderr}`);
  rmSync(file);
  symlinkSync(realpathSync('node_modules'), join(dir, 'node_modules'));
  return dir;
}

function chunkSizes(outDir) {
  const assets = join(outDir, 'assets');
  return readdirSync(assets)
    .filter((f) => /\.(js|css)$/.test(f))
    .map((f) => {
      const buf = readFileSync(join(assets, f));
      return { file: f, raw: statSync(join(assets, f)).size, gzip: gzipSync(buf, { level: 9 }).length };
    })
    .sort((a, b) => b.raw - a.raw);
}

/** Minimal Chrome DevTools Protocol client over the browser WebSocket. */
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    const p = msg.id !== undefined ? pending.get(msg.id) : undefined;
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
  };
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  return {
    send(method, params = {}, sessionId) {
      const id = ++nextId;
      ws.send(JSON.stringify({ id, method, params, sessionId }));
      return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
    },
    close: () => ws.close(),
  };
}

function launchChrome(path, profileDir) {
  const proc = spawn(path, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    ...BROWSER_ARGS,
    '--window-size=1280,800',
    'about:blank',
  ]);
  const wsUrl = new Promise((res, rej) => {
    let log = '';
    proc.stderr.on('data', (d) => {
      log += d;
      const m = /DevTools listening on (ws:\S+)/.exec(log);
      if (m) res(m[1]);
    });
    proc.on('exit', () => rej(new Error(`Chrome exited:\n${log}`)));
  });
  return { proc, wsUrl };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function measureOnce(cdp, url, profile) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (method, params) => cdp.send(method, params, sessionId);
  try {
    await s('Page.enable');
    await s('Network.enable');
    await s('Network.setCacheDisabled', { cacheDisabled: true });
    if (profile.latency) {
      await s('Network.emulateNetworkConditions', {
        offline: false,
        latency: profile.latency,
        downloadThroughput: profile.down,
        uploadThroughput: profile.up,
      });
    }
    if (profile.cpu) await s('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
    if (profile.view) {
      const { width, height, deviceScaleFactor, mobile } = profile.view;
      await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile });
      await s('Emulation.setTouchEmulationEnabled', { enabled: true });
    }
    await s('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
    await s('Page.navigate', { url });
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const { result } = await s('Runtime.evaluate', {
          expression: `location.protocol.startsWith('http') && window.__cst
            ? Promise.race([window.__cst, new Promise((r) => setTimeout(() => r(null), ${TIMEOUT_MS}))])
            : null`,
          awaitPromise: true,
          returnByValue: true,
        });
        if (result.value) return result.value;
      } catch {
        // The page navigated mid-evaluate; try again.
      }
      await sleep(50);
    }
    return null;
  } finally {
    await cdp.send('Target.closeTarget', { targetId });
  }
}

/** Runs in the page: New Game on Easy, open the shop at 4x and wait for the peak phase. */
const PLAY_TO_PEAK = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (what, fn, ms) => {
    const end = performance.now() + ms;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (performance.now() > end) throw new Error('timed out waiting for ' + what);
      await sleep(100);
    }
  };
  const button = (text) => [...document.querySelectorAll('button')].find((b) => b.offsetParent !== null && b.textContent.replace(/\\s+/g, ' ').trim().endsWith(text));
  const ready = () => document.querySelector('#scene.is-ready') && !document.getElementById('boot');
  (await until('Main Menu', () => ready() && button('Ván mới'), ${TIMEOUT_MS})).click();
  (await until('difficulty', () => document.querySelector('label.choice input[value="easy"]')?.closest('label'), 10000)).click();
  (await until('start', () => button('Bắt đầu ngày 1'), 10000)).click();
  (await until('open', () => document.querySelector('[data-action="open"]'), 10000)).click();
  (await until('speed 4', () => document.querySelector('[data-speed="4"]'), 10000)).click();
  await until('peak', () => document.querySelector('.phases li[data-phase="peak"]')?.getAttribute('aria-current') === 'step', ${PEAK_TIMEOUT_MS});
  return true;
})()`;

/** Runs in the page: requestAnimationFrame timestamps over FPS_SECONDS. */
const SAMPLE_FRAMES = `new Promise((resolve) => {
  const ts = [];
  const end = performance.now() + ${FPS_SECONDS * 1000};
  const frame = (t) => {
    ts.push(t);
    if (t < end) requestAnimationFrame(frame);
    else resolve(ts);
  };
  requestAnimationFrame(frame);
})`;

/**
 * Frame rates of rAF timestamps (ms): the average over the whole sample
 * (frames per second of wall time), and each frame's own rate. Headless
 * Chrome hands out frames on whole vsync intervals, so per-frame rates only
 * take a few values (20, 15, 7.5…) and their median jumps between runs; the
 * average does not.
 */
function frameRates(ts) {
  const each = [];
  for (let i = 1; i < ts.length; i++) if (ts[i] > ts[i - 1]) each.push(1000 / (ts[i] - ts[i - 1]));
  const span = ts.length > 1 ? ts[ts.length - 1] - ts[0] : 0;
  return { average: span > 0 ? ((ts.length - 1) * 1000) / span : null, each };
}

/** Plays `url` up to the peak at graphics `quality` and samples the frame rate. */
async function measureFps(cdp, url, quality) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (method, params) => cdp.send(method, params, sessionId);
  try {
    await s('Page.enable');
    // Each frame advances the game by at most 0.1 s, so the day reaches the peak faster in a tiny window.
    await s('Emulation.setDeviceMetricsOverride', { ...FPS_WAIT_VIEW, mobile: false });
    const settings = { musicVolume: 0, sfxVolume: 0, quality, gameSpeed: 1, cameraKeys: 'qe-wasd' };
    await s('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('cst3d:settings', ${JSON.stringify(JSON.stringify(settings))});` });
    await s('Page.navigate', { url });
    // The page may still be on about:blank for a moment; retry until the game page answers.
    const deadline = Date.now() + TIMEOUT_MS;
    for (;;) {
      const { result, exceptionDetails } = await s('Runtime.evaluate', {
        expression: `location.protocol.startsWith('http') && document.readyState !== 'loading' ? ${PLAY_TO_PEAK} : null`,
        awaitPromise: true,
        returnByValue: true,
      }).catch(() => ({ result: { value: null } }));
      if (exceptionDetails) throw new Error(`${quality}: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
      if (result.value) break;
      if (Date.now() > deadline) throw new Error(`${quality}: page did not load`);
      await sleep(100);
    }
    await s('Emulation.setDeviceMetricsOverride', { ...FPS_VIEW, mobile: false });
    await sleep(1500);
    const { result } = await s('Runtime.evaluate', { expression: SAMPLE_FRAMES, awaitPromise: true, returnByValue: true });
    return frameRates(result.value);
  } finally {
    await cdp.send('Target.closeTarget', { targetId });
  }
}

async function gpuName(cdp) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const { result } = await cdp.send(
    'Runtime.evaluate',
    {
      expression: `(() => { const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return 'no WebGL2';
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER); })()`,
      returnByValue: true,
    },
    sessionId,
  );
  await cdp.send('Target.closeTarget', { targetId });
  return result.value;
}

const median = (xs) => {
  const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};
const ms = (x) => (x === null ? 'n/a' : `${Math.round(x)} ms`);
const kb = (n) => `${(n / 1000).toFixed(1)} kB`;
const fps = (x) => (x === null ? 'n/a' : x.toFixed(1));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const port = basePort();
  const chromePath = findChrome();
  if (!chromePath) throw new Error('Chrome not found; set CHROME_PATH (startup and FPS numbers need WebGL on the GPU)');
  const lock = await acquirePerfLock(ROOT, { label: `measure-startup ${process.argv.slice(2).join(' ')}` });
  const temps = [];
  const builds = [];
  if (args.base) {
    const dir = checkoutRef(args.base);
    temps.push(dir);
    builds.push({ label: `base (${args.base})`, root: dir });
  }
  builds.push({ label: 'working tree', root: process.cwd() });

  const servers = [];
  const profileDir = mkdtempSync(join(tmpdir(), 'cst-chrome-'));
  temps.push(profileDir);
  let chrome = null;
  let cdp = null;
  try {
    for (const b of builds) {
      b.outDir = resolve(b.root, 'dist');
      await build({ root: b.root, logLevel: 'warn', build: { outDir: b.outDir } });
      b.chunks = chunkSizes(b.outDir);
      const server = await preview({ root: b.root, logLevel: 'silent', build: { outDir: b.outDir }, preview: { port: port + servers.length, open: false } });
      servers.push(server);
      b.url = server.resolvedUrls.local[0];
    }

    chrome = launchChrome(chromePath, profileDir);
    cdp = await connect(await chrome.wsUrl);
    const gpu = await gpuName(cdp);
    console.log(`Chrome: ${chromePath}\nWebGL: ${gpu}\nRuns per cell: ${args.runs} (median)\n`);
    if (isSoftwareGl(gpu)) {
      if (process.env.MEDIA_GPU !== 'any') throw new Error(`WebGL runs in software (${gpu}): the numbers would say nothing; set MEDIA_GPU=any to measure anyway`);
      console.log('!! WebGL runs in software: every frame is CPU-bound.\n');
    }

    for (const b of builds) {
      console.log(`## ${b.label}\n\n| Chunk | Raw | Gzip |\n| --- | --- | --- |`);
      for (const c of b.chunks) console.log(`| ${c.file} | ${kb(c.raw)} | ${kb(c.gzip)} |`);
      console.log('');
    }

    if (!args.fpsOnly) {
      console.log('| Build | Profile | First paint | Main Menu | 3D scene |\n| --- | --- | --- | --- | --- |');
      for (const profile of PROFILES) {
        for (const b of builds) {
          const runs = [];
          for (let i = 0; i < args.runs; i++) runs.push(await measureOnce(cdp, b.url, profile));
          const pick = (k) => median(runs.map((r) => (r ? (r[k] ?? null) : null)));
          console.log(`| ${b.label} | ${profile.name} | ${ms(pick('fcp'))} | ${ms(pick('menu'))} | ${ms(pick('world'))} |`);
        }
      }
    }

    if (args.fps) {
      const v = FPS_VIEW;
      console.log(`\nFPS at the peak of day 1 (Easy, 4x), ${FPS_SECONDS} s × ${args.runs} runs per cell, builds taking turns, ${v.width}×${v.height} @${v.deviceScaleFactor}x\n`);
      const rows = [];
      for (const quality of args.qualities) {
        const cells = builds.map((build) => ({ build, quality, averages: [], each: [] }));
        // Taking turns spreads any drift (heat, background work) over both builds.
        for (let i = 0; i < args.runs; i++) {
          for (const c of cells) {
            const r = await measureFps(cdp, c.build.url, quality);
            if (r.average !== null) c.averages.push(r.average);
            c.each.push(...r.each);
            console.error(`  ${c.build.label} ${quality} run ${i + 1}: ${fps(r.average)} FPS`);
          }
        }
        for (const c of cells) {
          c.each.sort((a, b) => a - b);
          c.average = median(c.averages);
          c.p5 = c.each.length ? c.each[Math.floor(c.each.length * 0.05)] : null;
          rows.push(c);
        }
      }
      console.log('| Build | Quality | Average FPS (median of runs) | Runs | p5 FPS | Frames |\n| --- | --- | --- | --- | --- | --- |');
      for (const r of rows) console.log(`| ${r.build.label} | ${r.quality} | ${fps(r.average)} | ${r.averages.map(fps).join(' / ')} | ${fps(r.p5)} | ${r.each.length} |`);
      if (builds.length > 1) {
        for (const quality of args.qualities) {
          const [base, cur] = builds.map((b) => rows.find((r) => r.build === b && r.quality === quality));
          if (!base?.average || !cur?.average) continue;
          const drop = (1 - cur.average / base.average) * 100;
          console.log(`${drop > 10 ? '!!' : 'ok'} ${quality}: working tree ${drop > 0 ? `${drop.toFixed(1)}% below` : `${(-drop).toFixed(1)}% above`} base`);
        }
      }
    }
  } finally {
    cdp?.close();
    if (chrome && chrome.proc.exitCode === null) {
      // Chrome keeps writing its profile until it exits.
      const exited = new Promise((r) => chrome.proc.once('exit', r));
      chrome.proc.kill();
      await exited;
    }
    for (const s of servers) await s.close();
    for (const t of temps) rmSync(t, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    lock.release();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
