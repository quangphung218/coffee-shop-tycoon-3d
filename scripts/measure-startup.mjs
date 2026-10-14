#!/usr/bin/env node
// Measures how fast the production build shows the Main Menu, in headless Chrome.
//
//   node scripts/measure-startup.mjs [--base <git-ref>] [--runs <n>]
//
// Builds the working tree (and <git-ref> with --base), serves each build with
// `vite preview`, loads it with an empty cache and prints chunk sizes and the
// median time to first paint, Main Menu on screen and 3D scene on screen.
// Chrome: $CHROME_PATH, else the usual install locations.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build, preview } from 'vite';

const PROFILES = [
  { name: 'Desktop, no throttling' },
  // Lighthouse's mobile preset: slow 4G and a 4x slower CPU.
  { name: 'Mobile: 150 ms RTT, 1.6 Mbps, CPU 4x', latency: 150, down: (1.6 * 1024 * 1024) / 8, up: (750 * 1024) / 8, cpu: 4 },
];
const TIMEOUT_MS = 60_000;

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
  const args = { base: null, runs: 3 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') args.base = argv[++i];
    else if (argv[i] === '--runs') args.runs = Math.max(1, Number(argv[++i]) || 1);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

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
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chromePath = findChrome();
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
      const server = await preview({ root: b.root, logLevel: 'silent', build: { outDir: b.outDir }, preview: { port: 4173 + servers.length, open: false } });
      servers.push(server);
      b.url = server.resolvedUrls.local[0];
    }

    chrome = launchChrome(chromePath, profileDir);
    cdp = await connect(await chrome.wsUrl);
    console.log(`Chrome: ${chromePath}\nWebGL: ${await gpuName(cdp)}\nRuns per cell: ${args.runs} (median)\n`);

    for (const b of builds) {
      console.log(`## ${b.label}\n\n| Chunk | Raw | Gzip |\n| --- | --- | --- |`);
      for (const c of b.chunks) console.log(`| ${c.file} | ${kb(c.raw)} | ${kb(c.gzip)} |`);
      console.log('');
    }

    console.log('| Build | Profile | First paint | Main Menu | 3D scene |\n| --- | --- | --- | --- | --- |');
    for (const profile of PROFILES) {
      for (const b of builds) {
        const runs = [];
        for (let i = 0; i < args.runs; i++) runs.push(await measureOnce(cdp, b.url, profile));
        const pick = (k) => median(runs.map((r) => (r ? (r[k] ?? null) : null)));
        console.log(`| ${b.label} | ${profile.name} | ${ms(pick('fcp'))} | ${ms(pick('menu'))} | ${ms(pick('world'))} |`);
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
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
