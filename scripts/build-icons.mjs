// Renders the 3D icon atlas (48 px and 24 px cells) from src/icon-studio. Run
// through `npm run icons` (all models) or `npm run icons -- --only i-menu,i-close`
// (re-render those, keep the rest of the current atlas). `--sheet` also writes
// the SVG vs 3D comparison to docs/reports/p18-icons-sample.png. Needs
// Playwright with Chromium; see docs/media.md.
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

async function main() {
  const argv = process.argv.slice(2);
  const only = parseOnly(argv);
  const sheet = argv.includes('--sheet');
  const server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: PORT, strictPort: true },
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

    const all = await page.evaluate(() => window.iconStudio.ids);
    const render = only ?? all;
    const previous = only ? readPrevious() : undefined;
    const out = await page.evaluate((input) => window.iconStudio.build(input), { render, previous });

    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'atlas@1x.webp'), fromDataUrl(out.images[1]));
    writeFileSync(join(OUT, 'atlas@2x.webp'), fromDataUrl(out.images[2]));
    writeFileSync(join(OUT, 'atlas.json'), `${JSON.stringify(out.manifest, null, 2)}\n`);
    // The old flat SVGs, for the side-by-side column of public/icons3d/index.html.
    const svgs = await page.evaluate(() => window.iconStudio.flatSvgs());
    writeFileSync(join(OUT, 'svg.json'), `${JSON.stringify(svgs, null, 2)}\n`);

    if (sheet) {
      await page.evaluate((o) => window.iconStudio.showSheet(o), out);
      mkdirSync(join(ROOT, 'docs', 'reports'), { recursive: true });
      await page.locator('#sheet').screenshot({ path: SHEET });
    }

    console.log(`${Object.keys(out.manifest.icons).length} icons (${render.length} rendered), atlas ${out.manifest.width}x${out.manifest.height} @1x`);
    for (const scale of [1, 2]) {
      const e = out.encodings[scale];
      console.log(`@${scale}x: WebP quality ${e.quality}, ${e.alphaLevels} alpha levels, ${e.bytes} bytes`);
    }
    const written = [join(OUT, 'atlas@1x.webp'), join(OUT, 'atlas@2x.webp'), join(OUT, 'atlas.json'), join(OUT, 'svg.json'), ...(sheet ? [SHEET] : [])];
    for (const path of written) {
      console.log(`${(statSync(path).size / 1024).toFixed(1)} KB ${path.slice(ROOT.length + 1)}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
