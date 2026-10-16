// Captures the loading screens of the production build on a phone over
// emulated Slow 4G (the mobile profile of scripts/measure-startup.mjs: 150 ms
// RTT, 1.6 Mbps, CPU 4x), into docs/media/loading-*.png:
//
//   loading-boot.png       boot screen with the real percent and a tip
//   loading-menu.png       Main Menu while the 3D scene downloads
//   loading-start.png      New Game: "Bắt đầu ngày 1" waits with its percent,
//                          and the slow-network note
//   loading-error.png      Main Menu after the 3D files failed: Thử lại
//   loading-retried.png    the same page after Thử lại with the network back
//   loading-boot-error.png boot screen when the game script fails: Thử lại
//
// The game script (BOOT_HOLD_MS) and three.js (HOLD_MS) are held back so each
// state stays on screen long enough to capture. Run after `npm run build`; needs Playwright's Chromium.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { newContext, OUT, PHONE, startPreview, urlFor } from './capture-media.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.MEDIA_PORT ?? 4173);
const URL_BASE = urlFor(PORT);
/** How long three.js is held back, past the 8 s slow-network note. */
const HOLD_MS = 11_000;
/** How long the game script is held back, so the boot screen can be captured mid-way. */
const BOOT_HOLD_MS = 3000;
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
const THREE = /\/assets\/three-[^/]+\.js$/;

const START = Date.now();
const progress = (what) => console.log(`[${Math.round((Date.now() - START) / 1000)} s] ${what}`);

/** A fresh phone page with an empty cache over Slow 4G. */
async function phonePage(browser) {
  const context = await newContext(browser, { viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  return { context, page };
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name) });
  progress(`wrote docs/media/${name}`);
}

/** Path of the game's entry script in the build, e.g. "assets/index-abc.js". */
function entryScript() {
  const entry = /<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"/.exec(readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8'))?.[1];
  if (!entry) throw new Error('entry script not found in dist/index.html');
  return entry;
}

async function main() {
  const server = await startPreview(ROOT, PORT);
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  try {
    const entry = entryScript();
    // 1–3: boot, menu and New Game while three.js is held back.
    {
      const { context, page } = await phonePage(browser);
      await page.route(THREE, async (route) => {
        await sleep(HOLD_MS);
        await route.continue();
      });
      // The game script is held too, so the boot screen shows the CSS done and the script still coming.
      await page.route(
        (url) => url.pathname.endsWith(`/${entry}`),
        async (route) => {
          await sleep(BOOT_HOLD_MS);
          await route.continue();
        },
      );
      void page.goto(URL_BASE);
      await page.waitForFunction(
        () => {
          const boot = document.querySelector('#boot:not(.is-done)');
          return /^[1-9]\d*%$/.test(boot?.querySelector('.boot-pct')?.textContent ?? '');
        },
        null,
        { timeout: 30_000 },
      );
      await shot(page, 'loading-boot.png');
      await page.locator('#boot').waitFor({ state: 'detached', timeout: 30_000 });
      await page.locator('.ui-screen.is-menu .scene-load:not([hidden])').waitFor();
      await shot(page, 'loading-menu.png');
      await page.getByRole('button', { name: /Ván mới/ }).click();
      // The slow-network note comes 8 s after the scene started loading.
      // Every screen has its own status line; wait on the one New Game shows.
      await page.locator('.ui-screen:not([hidden]) .scene-load.is-slow').waitFor({ timeout: 15_000 });
      // The form is taller than the phone and scrolls inside its layer: bring the
      // start button (and the status line above it) into view.
      await page.locator('.ui-screen:not([hidden]) button[type="submit"]').scrollIntoViewIfNeeded();
      await sleep(300);
      await shot(page, 'loading-start.png');
      await page.locator('#scene.is-ready').waitFor({ timeout: 60_000 });
      progress('scene ready after the hold');
      await context.close();
    }
    // 4–5: three.js fails, then Thử lại with the network back.
    {
      const { context, page } = await phonePage(browser);
      await page.route(THREE, (route) => route.abort('internetdisconnected'));
      await page.goto(URL_BASE);
      await page.locator('.ui-screen.is-menu .scene-load.is-failed').waitFor({ timeout: 60_000 });
      await shot(page, 'loading-error.png');
      await page.unroute(THREE);
      await page.locator('.ui-screen.is-menu .scene-load').getByRole('button', { name: 'Thử lại' }).click();
      await page.locator('#scene.is-ready').waitFor({ timeout: 60_000 });
      await page.locator('#boot').waitFor({ state: 'detached', timeout: 30_000 });
      await sleep(800);
      await shot(page, 'loading-retried.png');
      await context.close();
    }
    // 6: the game script itself fails: the boot screen offers Thử lại.
    {
      const { context, page } = await phonePage(browser);
      await page.route((url) => url.pathname.endsWith(`/${entry}`), (route) => route.abort('internetdisconnected'));
      await page.goto(URL_BASE);
      await page.locator('#boot.is-failed .boot-retry').waitFor({ timeout: 30_000 });
      await shot(page, 'loading-boot-error.png');
      await context.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
