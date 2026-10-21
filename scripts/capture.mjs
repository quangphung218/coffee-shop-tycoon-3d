#!/usr/bin/env node
// Runs a capture scenario: scripts/scenarios/<id>.mjs (or a path) says which
// saves each build plays, which shots to take (scripts/lib/shots.mjs kinds),
// which boards to draw from them and what to check. The runner does the
// rest: builds and serves the base commit, plays the saves, launches Chrome
// on the GPU (scripts/lib/browser.mjs), opens each session, writes the
// files, prints `ok <file> <kB>` and ends with exit code 1 on any `!!`.
//
//   node scripts/capture.mjs <scenario> [--only tag,tag] [--saves-only] [--headed] [--out <dir>] [--base <ref>]
//   npm run media -- --scenario p30            (builds first)
//
// A scenario is a short data file; see docs/media.md "Kịch bản chụp".
import { existsSync, rmSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from './lib/browser.mjs';
import { DESK, PORT, ROOT, buildRef, headCommit, progress, startPreview, urlFor, warn, warnings } from './lib/capture.mjs';
import { loadSim } from './lib/saves.mjs';
import { writeBoard } from './lib/board.mjs';
import { SHOTS, session } from './lib/shots.mjs';

export function parseArgs(argv) {
  const args = { scenario: null, only: null, savesOnly: false, headed: process.env.MEDIA_HEADED === '1', out: null, base: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') args.only = (argv[++i] ?? '').split(',').filter(Boolean);
    else if (a === '--saves-only') args.savesOnly = true;
    else if (a === '--headed') args.headed = true;
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--base') args.base = argv[++i];
    else if (a.startsWith('--')) throw new Error(`Unknown argument: ${a}`);
    else if (args.scenario) throw new Error(`One scenario at a time: ${args.scenario}, ${a}`);
    else args.scenario = a;
  }
  if (!args.scenario) throw new Error('Usage: node scripts/capture.mjs <scenario> [--only tag,tag] [--saves-only] [--headed] [--out <dir>] [--base <ref>]');
  return args;
}

/** The scenario module's default export: `scripts/scenarios/<name>.mjs`, or a path. */
export async function loadScenario(name) {
  const file = /[/.]/.test(name) ? resolve(name) : join(ROOT, 'scripts', 'scenarios', `${name}.mjs`);
  if (!existsSync(file)) throw new Error(`no scenario at ${file}`);
  const mod = await import(pathToFileURL(file).href);
  const sc = mod.default;
  if (!sc?.id || !Array.isArray(sc.steps) || typeof sc.saves !== 'function') throw new Error(`${file}: a scenario exports default { id, out, saves(), steps[] }`);
  return sc;
}

/** `{a.b.c}` in `text` replaced from `ctx`; a function is called with ctx. */
export function fill(text, ctx) {
  if (typeof text === 'function') return text(ctx);
  if (typeof text !== 'string') return text;
  return text.replace(/\{([\w.[\]]+)\}/g, (m, path) => {
    const v = path.split(/\.|\[|\]\.?/).filter(Boolean).reduce((o, k) => o?.[k], ctx);
    return v === undefined || v === null ? m : String(v);
  });
}

/** Steps with a tag in `only` (every step when `only` is null); a step with no tags runs always. */
export const selectSteps = (steps, only) => (only ? steps.filter((s) => !s.tags?.length || s.tags.some((t) => only.includes(t))) : steps);

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const sc = await loadScenario(args.scenario);
  const outDir = args.out ? resolve(args.out) : join(ROOT, sc.out ?? 'docs/media');
  const only = args.only ?? (sc.onlyEnv && process.env[sc.onlyEnv] ? process.env[sc.onlyEnv].split(',') : null);
  if (only && sc.tags) {
    const bad = only.filter((t) => !sc.tags.includes(t));
    if (bad.length) throw new Error(`--only ${bad.join(',')}: ${sc.id} knows ${sc.tags.join(', ')}`);
  }
  const steps = selectSteps(sc.steps, only);
  const baseRef = args.base ?? sc.base ?? null;
  const needsBase = Boolean(baseRef) && steps.some((s) => s.kind === 'pair' || s.build === 'base');
  const ctx = {
    scenario: sc,
    only,
    out: outDir,
    head: headCommit(),
    base: baseRef,
    results: {},
    files: [],
    warn,
    progress,
    fill: (text, extra = {}) => fill(text, { ...ctx, ...extra }),
  };
  const file = (name) => (isAbsolute(name) ? name : join(outDir, name));

  const cur = { label: 'working tree', root: ROOT };
  progress(`${sc.id}: playing the working tree's saves`);
  Object.assign(cur, await sc.saves(await loadSim(ROOT), { isBase: false, only, ctx }));
  progress(`working tree saves: ${cur.info}`);
  if (args.savesOnly || (sc.savesOnlyEnv && process.env[sc.savesOnlyEnv] === '1')) {
    if (warnings.count > 0) process.exitCode = 1;
    return ctx;
  }
  const servers = [];
  let baseDir = null;
  let browser = null;
  let sessions = 0;
  const relaunchEvery = sc.relaunchEvery ?? Infinity;
  const launch = async () => {
    if (browser) await browser.close();
    browser = await launchBrowser({ headless: !args.headed, log: progress, ignoreDefaultArgs: sc.scrollbars ? ['--hide-scrollbars'] : undefined });
    sessions = 0;
  };
  const builds = { cur };
  try {
    if (needsBase) {
      progress(`building ${baseRef}`);
      baseDir = buildRef(baseRef);
      const base = { label: baseRef, root: baseDir };
      Object.assign(base, await sc.saves(await loadSim(baseDir), { isBase: true, only, ctx }));
      progress(`${baseRef} saves: ${base.info}`);
      builds.base = base;
    }
    servers.push(await startPreview(ROOT, PORT));
    cur.url = urlFor(PORT);
    if (builds.base) {
      servers.push(await startPreview(baseDir, PORT + 1));
      builds.base.url = urlFor(PORT + 1);
    }
    const open = async (build, step, fn) => {
      if (!browser || sessions >= relaunchEvery) await launch();
      sessions++;
      const b = builds[build];
      if (!b) throw new Error(`${step.id}: build '${build}' is not served (no base commit)`);
      // `from` loads another build's save into this one (an old save in the new build).
      const saveOf = builds[step.from ?? build];
      if (!saveOf) throw new Error(`${step.id}: build '${step.from}' is not served (no base commit)`);
      const save = step.save === null ? null : saveOf.saves[step.save];
      if (step.save !== null && !save) throw new Error(`${step.id}: ${saveOf.label} has no save '${step.save}'`);
      const kind = SHOTS[step.shot];
      const opts = { viewport: step.viewport, dpr: step.dpr, quality: step.quality, speed: step.speed, hooks: kind.hooks, errors: step.errors ? [] : undefined };
      const r = await session(browser, b.url, save, opts, fn);
      if (opts.errors && r && typeof r === 'object') r.errors = opts.errors;
      return r;
    };
    // A probe on a blank page of the browser (boards that measure their frames).
    ctx.evaluate = async (fn, arg) => {
      if (!browser) await launch();
      const page = await browser.newPage({ viewport: DESK, deviceScaleFactor: 1 });
      try {
        return await page.evaluate(fn, arg);
      } finally {
        await page.close();
      }
    };
    const shotOpts = (step) => {
      const o = { ...(typeof step.opts === 'function' ? step.opts(ctx) : step.opts) };
      if (o.file) o.file = file(o.file);
      if (step.viewport) o.viewport = step.viewport;
      return o;
    };
    for (const step of steps) {
      if (step.relaunch) await launch();
      if (step.when && !step.when(ctx)) continue;
      const kind = SHOTS[step.shot];
      if ((step.kind === 'shot' || step.kind === 'pair') && !kind) throw new Error(`${step.id}: unknown shot kind '${step.shot}' (${Object.keys(SHOTS).join(', ')})`);
      let r;
      if (step.kind === 'shot') {
        const o = shotOpts(step);
        r = await open(step.build ?? 'cur', step, (page, t0) => kind.run(page, t0, o));
        if (r?.file) ctx.files.push(r.file);
      } else if (step.kind === 'pair') {
        const o = shotOpts(step);
        const after = await open('cur', step, (page, t0) => kind.after(page, t0, o));
        const ok = step.need ? step.need(after) : Boolean(after);
        const before = ok ? await open('base', step, (page, t0) => kind.before(page, t0, o, after)) : null;
        r = { after, before };
      } else if (step.kind === 'board') {
        const rows = fill(step.rows, ctx);
        if (!rows || rows.length === 0) continue;
        const spec = {
          rows: rows.map((row) => ({ ...row, panels: row.panels.map((p) => ({ ...p, title: fill(p.title, ctx), caption: fill(p.caption, ctx) })) })),
          notes: (fill(step.notes, ctx) ?? []).map((n) => fill(n, ctx)),
          width: step.width,
          fit: step.fit,
        };
        if (!browser) await launch();
        r = await writeBoard(browser, file(fill(step.file, ctx)), spec);
        if (r) ctx.files.push(r);
      } else if (step.kind === 'check') {
        r = await step.run(ctx);
      } else throw new Error(`${step.id ?? '?'}: unknown step kind '${step.kind}'`);
      if (step.id) ctx.results[step.id] = r;
      for (const line of step.log ? [].concat(step.log(r, ctx) ?? []) : []) progress(line);
      for (const line of step.check ? [].concat(step.check(r, ctx) ?? []) : []) warn(line);
    }
  } finally {
    if (browser) await browser.close();
    for (const s of servers) s.kill();
    if (baseDir) rmSync(baseDir, { recursive: true, force: true });
  }
  // Paths are relative to the repo; an --out dir outside it prints whole.
  for (const f of ctx.files.filter(Boolean)) console.log(`ok ${f.startsWith('..') ? resolve(ROOT, f) : f} ${Math.round(statSync(resolve(ROOT, f)).size / 1024)} kB`);
  if (warnings.count > 0) {
    console.error(`${warnings.count} !! warning(s) (${[...warnings.at].join(', ')}): fix them and run again before using the shots`);
    process.exitCode = 1;
  }
  return ctx;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
