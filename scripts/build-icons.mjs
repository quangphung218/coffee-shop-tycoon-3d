// Renders the 3D icon atlas (48 px and 24 px cells) from src/icon-studio. Run
// through `npm run icons` (all models) or `npm run icons -- --only i-menu,i-close`
// (re-render those, keep the rest of the current atlas). `--sheet` also writes
// the SVG vs 3D comparison to docs/reports/p18-icons-sample.png.
// `npm run icons -- --set tiers` writes the upgrade tier atlas instead
// (public/icons3d/tiers@1x.webp, tiers@2x.webp, tiers.json), loaded by the
// game only when needed; the main atlas is left alone. Needs Playwright with
// Chromium; see docs/media.md.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'public', 'icons3d');
const SHEET = join(ROOT, 'docs', 'reports', 'p18-icons-sample.png');
const PORT = Number(process.env.ICONS_PORT ?? 4175);

/** `--only a,b` or `--only a b`: the ids after the flag, up to the next flag. */
function parseOnly(argv) {
  const at = argv.indexOf('--only');
  if (at < 0) return null;
  const ids = [];
  for (const arg of argv.slice(at + 1)) {
    if (arg.startsWith('--')) break;
    ids.push(...arg.split(',').filter(Boolean));
  }
  if (!ids.length) throw new Error('--only needs at least one icon id, e.g. --only i-menu,i-close');
  return ids;
}

/** `--set tiers` or `--set=tiers`: the atlas to build; `main` without the flag. */
function parseSet(argv) {
  const at = argv.findIndex((arg) => arg === '--set' || arg.startsWith('--set='));
  if (at < 0) return 'main';
  const set = argv[at].startsWith('--set=') ? argv[at].slice('--set='.length) : argv[at + 1];
  if (set !== 'main' && set !== 'tiers') throw new Error(`--set takes main or tiers, not ${set ?? 'nothing'}`);
  return set;
}

const dataUrl = (path) => `data:image/webp;base64,${readFileSync(path).toString('base64')}`;
const fromDataUrl = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

/** The committed atlas, when there is one, so --only can keep the other icons. */
function readPrevious() {
  const json = join(OUT, 'atlas.json');
  if (!existsSync(json)) return undefined;
  return {
    manifest: JSON.parse(readFileSync(json, 'utf8')),
    images: { 1: dataUrl(join(OUT, 'atlas@1x.webp')), 2: dataUrl(join(OUT, 'atlas@2x.webp')) },
  };
}

/** Build log: cell count, encodings, weakest 24 px cells and the size of each file `written`. */
function report(out, render, written) {
  console.log(`${Object.keys(out.manifest.icons).length} icons (${render.length} rendered), atlas ${out.manifest.width}x${out.manifest.height} @1x`);
  for (const scale of [1, 2]) {
    const e = out.encodings[scale];
    console.log(`@${scale}x: WebP quality ${e.quality}, ${e.alphaLevels} alpha levels, ${e.bytes} bytes`);
  }
  // Weakest small cell for each legibility measure (tests/icons holds them to SMALL_QUALITY).
  const quality = Object.entries(out.manifest.smallQuality);
  for (const [key, worst] of [['edgeInk', Math.min], ['edgeContrast', Math.min], ['creamShare', Math.max]]) {
    const value = worst(...quality.map(([, q]) => q[key]));
    const ids = quality.filter(([, q]) => q[key] === value).map(([id]) => id);
    console.log(`24 px ${key}: weakest ${value} (${ids.join(', ')})`);
  }
  for (const path of written) {
    console.log(`${(statSync(path).size / 1024).toFixed(1)} KB ${path.slice(ROOT.length + 1)}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const only = parseOnly(argv);
  const sheet = argv.includes('--sheet');
  const set = parseSet(argv);
  if (set === 'tiers' && (only || sheet)) throw new Error('--set tiers always renders the whole tiers atlas; --only and --sheet are for the main atlas');
  const server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: PORT, strictPort: true, hmr: false },
  });
  await server.listen();
  const browser = await chromium.launch({
    // Lets WebGL fall back to software rendering when headless Chromium has no GPU.
    args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  try {
    // Device pixel ratio 2, so the report sheet shows the @2x atlas the way a phone does.
    const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 900, height: 600 } });
    page.on('pageerror', (err) => console.error(err));
    await page.goto(`http://127.0.0.1:${PORT}/src/icon-studio/index.html?headless`);
    await page.waitForFunction(() => window.iconStudio !== undefined, null, { timeout: 60_000 });

    if (set === 'tiers') {
      const render = await page.evaluate(() => window.iconStudio.setIds.tiers);
      const out = await page.evaluate((input) => window.iconStudio.build(input), { render, set });
      mkdirSync(OUT, { recursive: true });
      const written = [join(OUT, 'tiers@1x.webp'), join(OUT, 'tiers@2x.webp'), join(OUT, 'tiers.json')];
      writeFileSync(written[0], fromDataUrl(out.images[1]));
      writeFileSync(written[1], fromDataUrl(out.images[2]));
      writeFileSync(written[2], `${JSON.stringify(out.manifest, null, 2)}\n`);
      report(out, render, written);
      return;
    }

    const all = await page.evaluate(() => window.iconStudio.ids);
    const render = only ?? all;
    const previous = only ? readPrevious() : undefined;
    const out = await page.evaluate((input) => window.iconStudio.build(input), { render, previous });
    // The old flat SVGs, for the side-by-side column of public/icons3d/index.html.
    const svgs = await page.evaluate(() => window.iconStudio.flatSvgs());
    if (sheet) {
      await page.evaluate((o) => window.iconStudio.showSheet(o), out);
      mkdirSync(join(ROOT, 'docs', 'reports'), { recursive: true });
      await page.locator('#sheet').screenshot({ path: SHEET });
    }

    // Written last: the studio imports atlas.json, so a change to it reloads the page.
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'atlas@1x.webp'), fromDataUrl(out.images[1]));
    writeFileSync(join(OUT, 'atlas@2x.webp'), fromDataUrl(out.images[2]));
    writeFileSync(join(OUT, 'atlas.json'), `${JSON.stringify(out.manifest, null, 2)}\n`);
    writeFileSync(join(OUT, 'svg.json'), `${JSON.stringify(svgs, null, 2)}\n`);

    report(out, render, [join(OUT, 'atlas@1x.webp'), join(OUT, 'atlas@2x.webp'), join(OUT, 'atlas.json'), join(OUT, 'svg.json'), ...(sheet ? [SHEET] : [])]);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
