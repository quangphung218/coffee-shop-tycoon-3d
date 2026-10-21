#!/usr/bin/env node
// Measures how smooth the first seconds after loading are, in headless Chromium.
//
//   node scripts/measure-frames.mjs [--base <git-ref>] [--runs <n>] [--headed] [--fx | --scene <id>]
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
// (scripts/lib/browser.mjs: $CHROME_PATH, else the usual install locations)
// so WebGL uses the GPU, and refuses software WebGL unless MEDIA_GPU=any.
// Holds the perf lock of scripts/lib/perf-lock.mjs: a second measurement
// waits for this one, so they never share the GPU.
// Each run also lists the confetti chunk and `tiers` atlas files requested
// before the window ends: the Main Menu must not load them.
//
// --fx measures the P25 effects instead, from saves each build's sim writes
// (scripts/capture-p25.mjs playSaves). After cst:world it presses Tiếp tục
// and records FX_WINDOW_MS around each effect: "upgrade" opens Nâng cấp on
// the tier-1 save and, FX_LEAD_MS into the window, clicks Mua and its confirm
// on Máy espresso cao cấp (sparkle and bounce); "level-up" starts the window
// at the Tiếp tục click on the report save of the first level-up, which opens
// the Daily Report with its level-up card and confetti. A working-tree
// level-up run where the confetti chunk did not load or no canvas.fx-confetti
// joined the DOM fails: it stays out of the table and the script exits 1.
//
// --scene <id> measures a P29 scene instead: 'dusk-rain' (rainy day, 19:00,
// customers in the shop) or 'noon-sunny' (12:00, sunny), from a save each
// build's sim writes (scripts/lib/saves.mjs sceneSaves). After cst:world it
// presses Tiếp tục, waits SCENE_SETTLE_MS for the camera and the weather to
// set in and records SCENE_WINDOW_MS of the running day.
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildRef, startPreview, urlFor } from './capture-media.mjs';
import { SCENES, SCENE_IDS, sceneSaves } from './lib/saves.mjs';
import { launchBrowser } from './lib/browser.mjs';
import { acquirePerfLock } from './lib/perf-lock.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.MEDIA_PORT ?? process.env.PORT ?? 4173);
/** Files loaded on demand only (confetti chunk, upgrade tier atlas). */
const LAZY = /confetti-|icons3d\/tiers/;
/** --fx: recorded around each effect, ms; the upgrade click comes FX_LEAD_MS in. */
const FX_WINDOW_MS = 3000;
const FX_LEAD_MS = 500;
const FX_ROW = '.panel:not([hidden]) li[data-upgrade="better_machine"]';
/** --scene: wait after Tiếp tục, then the recorded window, ms. */
const SCENE_SETTLE_MS = 1500;
const SCENE_WINDOW_MS = 5000;
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
  // --fx: set once a confetti canvas joins the DOM (it removes itself after 1.4 s).
  window.__confettiSeen = false;
  new MutationObserver((list, mo) => {
    for (const m of list) {
      for (const n of m.addedNodes) {
        if (n.nodeName === 'CANVAS' && n.classList.contains('fx-confetti')) {
          window.__confettiSeen = true;
          mo.disconnect();
          return;
        }
      }
    }
  }).observe(document, { childList: true, subtree: true });
  const lazy = (end) => performance.getEntriesByType('resource').filter((e) => e.startTime < end && ${LAZY}.test(e.name)).map((e) => e.name.split('/').pop());
  const overlap = (t0, end) => {
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
    return { count, total };
  };
  // --fx: frames and long tasks for ms from now.
  window.__record = (ms) =>
    new Promise((resolve) => {
      const t0 = performance.now();
      const end = t0 + ms;
      const ts = [t0];
      const frame = (t) => {
        ts.push(t);
        if (t < end) return requestAnimationFrame(frame);
        setTimeout(() => {
          const lt = overlap(t0, end);
          resolve({ ts, longTasks: lt.count, longTaskMs: lt.total });
        }, 200);
      };
      requestAnimationFrame(frame);
    });
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
          const lt = overlap(t0, end);
          resolve({ world: t0, ts, longTasks: lt.count, longTaskMs: lt.total, lazy: lazy(end) });
        }, 200);
      };
      requestAnimationFrame(frame);
    }).observe({ type: 'mark', buffered: true });
  });
})();`;

export function parseArgs(argv) {
  const args = { base: null, runs: 3, headed: false, fx: false, scene: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') args.base = argv[++i];
    else if (argv[i] === '--headed') args.headed = true;
    else if (argv[i] === '--fx') args.fx = true;
    else if (argv[i] === '--runs') args.runs = Math.max(1, Number(argv[++i]) || 1);
    else if (argv[i] === '--scene') {
      const id = argv[++i];
      if (!SCENE_IDS.includes(id)) throw new Error(`Unknown scene: ${id ?? '(none)'}; one of ${SCENE_IDS.join(', ')}`);
      args.scene = id;
    } else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (args.fx && args.scene) throw new Error('--fx and --scene measure different windows; pick one');
  return args;
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

/** Frame time quantiles, frames over JANK_MS and long tasks of one recording. */
function stats(r) {
  const frames = intervals(r.ts).sort((a, b) => a - b);
  return {
    world: r.world ?? null,
    frames: frames.length,
    p50: quantile(frames, 0.5),
    p95: quantile(frames, 0.95),
    max: frames.length ? frames[frames.length - 1] : null,
    janky: frames.filter((f) => f > JANK_MS).length,
    longTasks: r.longTasks,
    longTaskMs: r.longTaskMs,
    lazy: r.lazy ?? [],
  };
}

/** A context with the fixed clock, muted settings, the probe and `save` (if any) in localStorage; a page throttled to `profile`. */
async function openPage(browser, profile, save = null) {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
  await context.addInitScript(
    `Date.now = () => ${FIXED_NOW};
    localStorage.setItem('cst3d:settings', ${JSON.stringify(JSON.stringify({ musicVolume: 0, sfxVolume: 0 }))});
    ${save ? `localStorage.setItem(${JSON.stringify(save.key)}, ${JSON.stringify(save.text)});` : ''}
    ${PROBE}`,
  );
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (profile.network) await cdp.send('Network.emulateNetworkConditions', profile.network);
  if (profile.cpu) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  return { context, page };
}

/** One cold load of `url`: frame and long-task stats for WINDOW_MS after cst:world. */
async function measureOnce(browser, url, profile) {
  const { context, page } = await openPage(browser, profile);
  try {
    await page.goto(url, { waitUntil: 'commit' });
    const r = await page.evaluate((t) => Promise.race([window.__frames, new Promise((res) => setTimeout(() => res(null), t))]), TIMEOUT_MS);
    return r ? stats(r) : null;
  } finally {
    await context.close();
  }
}

/**
 * --fx, one cold load of `url` with `save`: after cst:world, Tiếp tục, then
 * FX_WINDOW_MS recorded around the effect `kind` ('upgrade' or 'level-up').
 */
async function measureFx(browser, url, profile, kind, save) {
  const { context, page } = await openPage(browser, profile, save);
  try {
    await page.goto(url, { waitUntil: 'commit' });
    await page.waitForFunction(() => performance.getEntriesByName('cst:world').length > 0, null, { timeout: TIMEOUT_MS, polling: 100 });
    const resume = page.getByRole('button', { name: /^Tiếp tục/ });
    await resume.waitFor({ timeout: TIMEOUT_MS });
    let rec;
    if (kind === 'upgrade') {
      await resume.click();
      await page.locator('[data-action="open"]').first().waitFor({ timeout: TIMEOUT_MS });
      await page.evaluate(() => document.querySelector('nav.dock [data-panel="upgrades"]')?.click());
      await page.locator(`${FX_ROW} [data-action="buy"]`).waitFor({ timeout: TIMEOUT_MS });
      await page.locator(FX_ROW).scrollIntoViewIfNeeded();
      // Tier atlas and panel slide-in done before the window.
      await sleep(1500);
      rec = page.evaluate((ms) => window.__record(ms), FX_WINDOW_MS);
      await sleep(FX_LEAD_MS);
      const bought = await page.evaluate(async (row) => {
        document.querySelector(`${row} [data-action="buy"]`)?.click();
        await new Promise((r) => setTimeout(r, 0));
        const ok = document.querySelector(`${row} [data-action="confirm"]`);
        ok?.click();
        return !!ok;
      }, FX_ROW);
      if (!bought) throw new Error('Mua on Máy espresso cao cấp had no confirm step');
    } else {
      await sleep(500);
      rec = page.evaluate((ms) => window.__record(ms), FX_WINDOW_MS);
      await resume.click();
      await page.locator('.rpt-layer:not([hidden])').waitFor({ timeout: FX_WINDOW_MS });
    }
    const r = await rec;
    const confetti =
      kind === 'level-up'
        ? await page.evaluate(() => ({
            chunk: performance.getEntriesByType('resource').some((e) => /confetti-/.test(e.name)),
            canvas: window.__confettiSeen === true,
          }))
        : null;
    return { ...stats(r), confetti };
  } finally {
    await context.close();
  }
}

/** --scene, one cold load of `url` with `save`: after cst:world, Tiếp tục, SCENE_SETTLE_MS, then SCENE_WINDOW_MS recorded. */
async function measureScene(browser, url, profile, save) {
  const { context, page } = await openPage(browser, profile, save);
  try {
    await page.goto(url, { waitUntil: 'commit' });
    await page.waitForFunction(() => performance.getEntriesByName('cst:world').length > 0, null, { timeout: TIMEOUT_MS, polling: 100 });
    const resume = page.getByRole('button', { name: /^Tiếp tục/ });
    await resume.waitFor({ timeout: TIMEOUT_MS });
    await resume.click();
    await page.locator('nav.dock').waitFor({ timeout: TIMEOUT_MS });
    await sleep(SCENE_SETTLE_MS);
    const clock = await page.evaluate(() => document.querySelector('.hud [data-stat="clock"]')?.textContent?.trim() ?? '');
    const r = await page.evaluate((ms) => window.__record(ms), SCENE_WINDOW_MS);
    return { ...stats(r), clock };
  } finally {
    await context.close();
  }
}

/** --scene table: per build and profile, the median over `runs` of measureScene. Throws after the table when a run failed. */
async function runScene(browser, builds, runs, id) {
  const failures = [];
  console.log(`| Build | Profile | Scene | Frames | p50 | p95 | Max | Frames > ${JANK_MS} ms | Long tasks | Long task time |`);
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const profile of PROFILES) {
    const cells = builds.map((build) => ({ build, runs: [] }));
    for (let i = 0; i < runs; i++) {
      for (const c of cells) {
        const who = `${c.build.label} · ${profile.name} · ${id} · run ${i + 1}`;
        try {
          const r = await measureScene(browser, c.build.url, profile, c.build.scene);
          console.error(`  ${who}: HUD ${r.clock}, p95 ${ms(r.p95)}, max ${ms(r.max)}, ${r.janky}/${r.frames} frames > ${JANK_MS} ms, ${r.longTasks} long tasks`);
          c.runs.push(r);
        } catch (err) {
          const msg = `${who}: ${String(err.message ?? err).split('\n')[0]}`;
          console.error(`  ${msg}`);
          failures.push(msg);
        }
      }
    }
    for (const c of cells) {
      const pick = (k) => median(c.runs.map((r) => r[k]));
      console.log(
        `| ${c.build.label} | ${profile.name} | ${id} | ${pick('frames') ?? 'n/a'} | ${ms(pick('p50'))} | ${ms(pick('p95'))} | ${ms(pick('max'))} | ${pick('janky') ?? 'n/a'} (${c.runs.map((r) => r.janky).join('/')}) | ${pick('longTasks') ?? 'n/a'} (${c.runs.map((r) => r.longTasks).join('/')}) | ${ms(pick('longTaskMs'))} |`,
      );
    }
  }
  if (failures.length) throw new Error(`FAIL: ${failures.length} --scene run(s) not counted:\n  ${failures.join('\n  ')}`);
}

/** --fx: why a level-up run of a build that has confetti shows none, or null when it ran. */
function confettiMissing(r) {
  if (!r.confetti) return null;
  if (!r.confetti.chunk) return 'confetti chunk not loaded';
  if (!r.confetti.canvas) return 'no confetti canvas in the DOM';
  return null;
}

/**
 * --fx table: per build, profile and effect, the median over `runs` of
 * measureFx. Throws after the table when a run failed or, on the working
 * tree, a level-up run threw no confetti; those runs stay out of the medians.
 */
async function runFx(browser, builds, runs) {
  const failures = [];
  console.log(`| Build | Profile | Effect | Frames | p50 | p95 | Max | Frames > ${JANK_MS} ms | Long tasks | Long task time |`);
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const profile of PROFILES) {
    for (const kind of ['upgrade', 'level-up']) {
      const cells = builds.map((build) => ({ build, runs: [] }));
      for (let i = 0; i < runs; i++) {
        for (const c of cells) {
          let r = null;
          try {
            r = await measureFx(browser, c.build.url, profile, kind, c.build.fx[kind]);
          } catch (err) {
            const msg = `${c.build.label} · ${profile.name} · ${kind} · run ${i + 1}: ${String(err.message ?? err).split('\n')[0]}`;
            console.error(`  ${msg}`);
            failures.push(msg);
            continue;
          }
          const confettiText = r.confetti === null ? '' : `, confetti chunk ${r.confetti.chunk ? 'loaded' : 'not loaded'}, canvas ${r.confetti.canvas ? 'seen' : 'not seen'}`;
          console.error(`  ${c.build.label} · ${profile.name} · ${kind} · run ${i + 1}: p95 ${ms(r.p95)}, max ${ms(r.max)}, ${r.janky}/${r.frames} frames > ${JANK_MS} ms, ${r.longTasks} long tasks${confettiText}`);
          const missing = c.build.confetti ? confettiMissing(r) : null;
          if (missing) {
            failures.push(`${c.build.label} · ${profile.name} · ${kind} · run ${i + 1}: ${missing}`);
            continue;
          }
          c.runs.push(r);
        }
      }
      for (const c of cells) {
        const pick = (k) => median(c.runs.map((r) => r[k]));
        const jankRuns = c.runs.map((r) => r.janky).join('/');
        console.log(
          `| ${c.build.label} | ${profile.name} | ${kind} | ${pick('frames') ?? 'n/a'} | ${ms(pick('p50'))} | ${ms(pick('p95'))} | ${ms(pick('max'))} | ${pick('janky') ?? 'n/a'} (${jankRuns}) | ${pick('longTasks') ?? 'n/a'} (${c.runs.map((r) => r.longTasks).join('/')}) | ${ms(pick('longTaskMs'))} |`,
        );
      }
    }
  }
  if (failures.length) throw new Error(`FAIL: ${failures.length} --fx run(s) not counted:\n  ${failures.join('\n  ')}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const builds = [];
  const temps = [];
  const servers = [];
  let browser = null;
  // Playing the saves and building take CPU too, so the lock comes first.
  const lock = await acquirePerfLock(ROOT, { label: `measure-frames ${process.argv.slice(2).join(' ')}` });
  try {
    if (args.base) {
      console.error(`Building ${args.base}…`);
      const dir = buildRef(args.base);
      temps.push(dir);
      builds.push({ label: `base (${args.base})`, root: dir });
    }
    // The base may predate the confetti, so only the working tree must show it.
    builds.push({ label: 'working tree', root: ROOT, confetti: true });
    if (args.fx) {
      const { playSaves } = await import('./capture-p25.mjs');
      for (const b of builds) {
        console.error(`Playing the saves of ${b.label}…`);
        const s = await playSaves(b.root);
        b.fx = { upgrade: s.tiers[1], 'level-up': s.saves.levelUp };
      }
    }
    if (args.scene) {
      for (const b of builds) {
        console.error(`Playing the ${args.scene} save of ${b.label}…`);
        const s = await sceneSaves(b.root, [{ id: args.scene, ...SCENES[args.scene] }]);
        b.scene = s[args.scene];
        console.error(`  ${s[args.scene].info}`);
      }
    }
    for (const [i, b] of builds.entries()) {
      servers.push(await startPreview(b.root, PORT + i));
      b.url = urlFor(PORT + i);
    }
    browser = await launchBrowser({ headless: !args.headed, requireGpu: process.env.MEDIA_GPU !== 'any', log: (line) => console.error(line) });
    const gpu = browser.gpu;
    const windowText = args.fx
      ? `${FX_WINDOW_MS / 1000} s around each effect`
      : args.scene
        ? `${SCENE_WINDOW_MS / 1000} s of ${args.scene}, ${SCENE_SETTLE_MS / 1000} s after Tiếp tục`
        : `${WINDOW_MS / 1000} s after cst:world`;
    console.log(`Chrome ${browser.version()}${args.headed ? ' (headed)' : ' (headless)'}, WebGL: ${gpu}, ${VIEW.width}×${VIEW.height}, ${windowText}, ${args.runs} runs per cell (median)\n`);
    if (browser.softwareGl) console.log('!! WebGL runs in software: every frame is CPU-bound, frame times say nothing about hitches.\n');
    if (args.fx) {
      await runFx(browser, builds, args.runs);
      return;
    }
    if (args.scene) {
      await runScene(browser, builds, args.runs, args.scene);
      return;
    }
    console.log(`| Build | Profile | 3D scene | Frames | p50 | p95 | Max | Frames > ${JANK_MS} ms | Long tasks | Long task time | Confetti, tiers loaded |`);
    console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
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
        const lazy = [...new Set(c.runs.flatMap((r) => r.lazy))];
        console.log(
          `| ${c.build.label} | ${profile.name} | ${ms(pick('world'))} | ${pick('frames') ?? 'n/a'} | ${ms(pick('p50'))} | ${ms(pick('p95'))} | ${ms(pick('max'))} | ${pick('janky') ?? 'n/a'} (${jankRuns}) | ${pick('longTasks') ?? 'n/a'} | ${ms(pick('longTaskMs'))} | ${lazy.length ? lazy.join(', ') : 'none'} |`,
        );
      }
    }
  } finally {
    await browser?.close();
    for (const s of servers) s.kill();
    for (const t of temps) rmSync(t, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    lock.release();
  }
}

// tests/scripts/p29-scenarios.test.ts imports parseArgs; only a direct run measures.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
