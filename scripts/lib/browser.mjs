// The one place scripts launch a browser from. Chrome (CHROME_PATH, then the
// usual install paths, then Playwright's 'chrome' channel) in its new headless
// mode draws WebGL on the GPU (ANGLE Metal on a Mac, about 60 fps on a heavy
// scene); Playwright's chromium-headless-shell draws it with SwiftShader on
// the CPU (about 20 fps on the same scene, several cores busy), so it is only
// used when no Chrome is installed, with a warning. Every launch prints the
// browser, its version and the WebGL renderer, and `!!` when WebGL runs in
// software. MEDIA_CHROMIUM=1 forces the headless shell (to reproduce an old
// run); MEDIA_GPU=require fails the run instead of warning, MEDIA_GPU=any
// lets the perf scripts measure in software.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

/** Where Chrome usually is; CHROME_PATH first. */
const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

/**
 * Flags every launch gets. --ignore-gpu-blocklist keeps the GPU on in
 * headless; the three --disable-* keep a headed window drawing when it is
 * behind another; --enable-unsafe-swiftshader lets WebGL fall back to
 * software (and the launch log say so) instead of failing with no GPU.
 */
export const BROWSER_ARGS = [
  '--ignore-gpu-blocklist',
  '--enable-unsafe-swiftshader',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
];

/** The installed Chrome: $CHROME_PATH, else the first of CHROME_PATHS that exists; null when none (or MEDIA_CHROMIUM=1). */
export function findChrome() {
  if (process.env.MEDIA_CHROMIUM === '1') return null;
  const env = process.env.CHROME_PATH;
  if (env) {
    if (!existsSync(env)) throw new Error(`CHROME_PATH=${env}: no such file`);
    return env;
  }
  return CHROME_PATHS.find((p) => existsSync(p)) ?? null;
}

/** WebGL renderer string of a blank page, e.g. "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, …)". */
export async function gpuName(browser) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return 'no WebGL2';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    });
  } finally {
    await page.close();
  }
}

/** True when the renderer string names a software rasterizer. */
export const isSoftwareGl = (gpu) => /swiftshader|llvmpipe|software|no webgl/i.test(gpu);

/**
 * Launches Chromium for a script: Chrome when installed (new headless mode,
 * GPU), else Playwright's headless shell (software WebGL, with a `!!`
 * warning). `headless` false opens a window (MEDIA_HEADED / LAYOUT_HEADED);
 * `args` and `ignoreDefaultArgs` go to chromium.launch on top of
 * BROWSER_ARGS; `requireGpu` (default: MEDIA_GPU=require) fails the launch
 * when WebGL is in software. Logs one line with the browser and the WebGL
 * renderer through `log`. Returns the Browser, with `browser.gpu` (the
 * renderer string) and `browser.softwareGl` set.
 */
export async function launchBrowser({ headless = true, args = [], ignoreDefaultArgs, requireGpu = process.env.MEDIA_GPU === 'require', log = console.log } = {}) {
  const options = { headless, args: [...BROWSER_ARGS, ...args], ...(ignoreDefaultArgs ? { ignoreDefaultArgs } : {}) };
  const chrome = findChrome();
  let browser = null;
  let how;
  if (chrome) {
    browser = await chromium.launch({ ...options, executablePath: chrome });
    how = `Chrome ${browser.version()} (${chrome})`;
  } else if (process.env.MEDIA_CHROMIUM !== '1') {
    // Chrome somewhere else: Playwright knows the install locations of each OS.
    browser = await chromium.launch({ ...options, channel: 'chrome' }).catch(() => null);
    if (browser) how = `Chrome ${browser.version()} (channel 'chrome')`;
  }
  if (!browser) {
    browser = await chromium.launch(options);
    how = `Playwright Chromium headless shell ${browser.version()}`;
  }
  const gpu = await gpuName(browser);
  browser.gpu = gpu;
  browser.softwareGl = isSoftwareGl(gpu);
  log(`browser: ${how}, ${headless ? 'headless' : 'headed'}, WebGL: ${gpu}`);
  if (browser.softwareGl) {
    const line = chrome
      ? '!! WebGL chạy bằng CPU (SwiftShader) dù đã mở Chrome: máy không có GPU dùng được; khung hình và FPS đo được không nói lên gì'
      : '!! WebGL chạy bằng CPU (SwiftShader): không tìm thấy Chrome. Cài Google Chrome hoặc đặt CHROME_PATH; headless shell vẽ chậm và ăn nhiều lõi';
    log(line);
    if (requireGpu) {
      await browser.close();
      throw new Error(`WebGL runs in software (${gpu}); this run needs the GPU. Install Chrome or set CHROME_PATH (MEDIA_GPU=any measures anyway)`);
    }
  }
  return browser;
}
