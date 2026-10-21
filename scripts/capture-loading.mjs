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
//   loading-game-error.png    Main Menu after the game chunk failed: the error
//                             line and Thử lại on "Mã cảnh 3D", marked
//   loading-game-retried.png  New Game after Thử lại with the network back:
//                             "Bắt đầu ngày 1" unlocked, marked
//
// The game script (BOOT_HOLD_MS) and three.js (HOLD_MS) are held back so each
// state stays on screen long enough to capture. The game chunk scene checks
// each step; a failed check prints "!!" and the script exits 1.
// Run after `npm run build`; needs Playwright's Chromium.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './lib/browser.mjs';
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
const GAME = '**/assets/game-*.js';

const START = Date.now();
const progress = (what) => console.log(`[${Math.round((Date.now() - START) / 1000)} s] ${what}`);

/** Prints a check; a failed one is marked "!!" and makes the script exit 1. */
function check(ok, what) {
  console.log(`${ok ? 'ok' : '!!'} ${what}`);
  if (!ok) process.exitCode = 1;
}

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
  // Headless Chrome now and then answers "Unable to capture screenshot" while the page is busy; try again.
  for (let attempt = 1; ; attempt++) {
    try {
      await page.screenshot({ path: join(OUT, name) });
      break;
    } catch (err) {
      if (attempt >= 3) throw err;
      progress(`${name}: ${err.message.split('\n')[0]}, retrying`);
      await sleep(1000);
    }
  }
  progress(`wrote docs/media/${name}`);
}

/** Screenshot with a red labelled box around each of `marks` ({ locator, text }), removed afterwards. */
async function markedShot(page, name, marks) {
  await marks[0].locator.scrollIntoViewIfNeeded();
  const boxes = [];
  for (const m of marks) boxes.push({ box: await m.locator.boundingBox(), text: m.text });
  await page.evaluate((list) => {
    const layer = document.createElement('div');
    layer.id = 'capture-marks';
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    for (const { box, text } of list) {
      if (!box) continue;
      const frame = document.createElement('div');
      frame.style.cssText = `position:absolute;left:${box.x - 4}px;top:${box.y - 4}px;width:${box.width + 8}px;height:${box.height + 8}px;border:3px solid #e11d48;border-radius:8px`;
      const label = document.createElement('span');
      label.textContent = text;
      // Above the box, or below it when there is no room.
      const top = box.y >= 30 ? box.y - 28 : box.y + box.height + 6;
      label.style.cssText = `position:absolute;left:${Math.max(4, box.x - 4)}px;top:${top}px;background:#e11d48;color:#fff;font:700 13px/1 system-ui,sans-serif;padding:4px 8px;border-radius:6px;white-space:nowrap`;
      layer.append(frame, label);
    }
    document.body.append(layer);
    // Keep each label inside the viewport.
    for (const label of layer.querySelectorAll('span')) {
      const over = label.getBoundingClientRect().right - (innerWidth - 4);
      if (over > 0) label.style.left = `${Math.max(4, label.offsetLeft - over)}px`;
    }
  }, boxes);
  await shot(page, name);
  await page.evaluate(() => document.getElementById('capture-marks')?.remove());
}

/** Path of the game's entry script in the build, e.g. "assets/index-abc.js". */
function entryScript() {
  const entry = /<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"/.exec(readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8'))?.[1];
  if (!entry) throw new Error('entry script not found in dist/index.html');
  return entry;
}

async function main() {
  const server = await startPreview(ROOT, PORT);
  const browser = await launchBrowser();
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
    // 7–8: the game chunk fails, Ván mới waits for it, then Thử lại with the network back.
    {
      const { context, page } = await phonePage(browser);
      await page.route(GAME, (route) => route.abort('internetdisconnected'));
      await page.goto(URL_BASE);
      const menu = page.locator('.ui-screen.is-menu');
      const code = menu.locator('.scene-load-item[data-component="code"]');
      const codeRetry = code.locator('.scene-load-retry');
      await menu.locator('.scene-load-item[data-component="code"][data-status="error"]').waitFor({ timeout: 60_000 });
      progress('game chunk failed');
      check(await menu.locator('nav[aria-label="Menu chính"]').isVisible(), 'game chunk failed: Main Menu still shows');
      check(await menu.locator('.scene-load.is-failed').isVisible(), 'game chunk failed: the status line reports the error');
      check(await codeRetry.isVisible(), 'game chunk failed: "Mã cảnh 3D" has Thử lại');
      const continueBtn = menu.locator('.menu-list button', { hasText: 'Tiếp tục' });
      // No save yet, so Tiếp tục is hidden, but the scene gate still holds it.
      check(
        (await continueBtn.getAttribute('aria-disabled')) === 'true' && (await continueBtn.locator('.btn-prep').textContent()) === 'Chưa tải được',
        'game chunk failed: Tiếp tục stays locked ("Chưa tải được")',
      );
      check((await page.locator('#scene.is-ready').count()) === 0, 'game chunk failed: the 3D scene is not shown');
      // Ván mới before Thử lại: the form must wait for the game chunk.
      await menu.getByRole('button', { name: 'Ván mới' }).click();
      await sleep(800);
      const start = page.locator('.ui-screen:not([hidden]) button[type="submit"]', { hasText: 'Bắt đầu ngày 1' });
      check((await start.count()) === 0 && (await menu.isVisible()), 'Ván mới before Thử lại: stays on the Main Menu until the game chunk is in');
      await markedShot(page, 'loading-game-error.png', [
        { locator: menu.locator('.scene-load-msg'), text: 'Dòng lỗi' },
        { locator: codeRetry, text: 'Thử lại "Mã cảnh 3D"' },
      ]);
      await page.unroute(GAME);
      // Thử lại may import the chunk again or, when the browser kept the failed module, reload the page.
      await page.evaluate(() => {
        window.captureBeforeRetry = true;
      });
      await codeRetry.click();
      await page.locator('#scene.is-ready').waitFor({ timeout: 60_000 });
      const reloaded = !(await page.evaluate(() => window.captureBeforeRetry === true));
      progress(`scene ready after Thử lại (${reloaded ? 'page reloaded' : 'same page'})`);
      if (reloaded) {
        await page.locator('#boot').waitFor({ state: 'detached', timeout: 30_000 });
        await page.getByRole('button', { name: 'Ván mới' }).click();
      } else {
        check(await start.isVisible(), 'Thử lại: the New Game form pressed before opens once the game chunk is in');
      }
      await start.waitFor({ timeout: 10_000 });
      // Every screen's status line follows the same gate.
      const lines = await page
        .locator('.scene-load')
        .evaluateAll((els) => els.map((el) => el.hidden && el.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') === '100'));
      check(lines.length > 0 && lines.every(Boolean), 'Thử lại: the loading lines reach 100% and hide');
      check((await start.getAttribute('aria-disabled')) === null, 'Thử lại: Bắt đầu ngày 1 is unlocked');
      await sleep(500);
      await markedShot(page, 'loading-game-retried.png', [{ locator: start, text: 'Đã mở khoá' }]);
      await page.locator('label.choice', { has: page.locator('input[value="easy"]') }).click();
      await start.click();
      const hud = page.locator('.hud [data-action="open"]');
      await hud.waitFor({ timeout: 30_000 }).catch(() => undefined);
      check(await hud.isVisible(), 'Thử lại: Bắt đầu ngày 1 opens the HUD');
      await context.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((err) => {
  console.error('!!', err);
  process.exit(1);
});
