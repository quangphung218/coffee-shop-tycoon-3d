// scripts/lib/browser.mjs: where Chrome is looked for and how software WebGL is told apart.
import { afterEach, describe, expect, it } from 'vitest';
import { BROWSER_ARGS, findChrome, isSoftwareGl } from '../../scripts/lib/browser.mjs';

// The project has no Node types; the env comes through globalThis.
const proc = (globalThis as unknown as { process: { env: Record<string, string | undefined>; execPath: string } }).process;
const saved = { CHROME_PATH: proc.env.CHROME_PATH, MEDIA_CHROMIUM: proc.env.MEDIA_CHROMIUM };

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete proc.env[k];
    else proc.env[k] = v;
  }
});

describe('isSoftwareGl', () => {
  it('names SwiftShader, llvmpipe and a missing WebGL as software', () => {
    expect(isSoftwareGl('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)')).toBe(true);
    expect(isSoftwareGl('Mesa llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(isSoftwareGl('no WebGL2')).toBe(true);
  });

  it('takes a GPU renderer as hardware', () => {
    expect(isSoftwareGl('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)')).toBe(false);
    expect(isSoftwareGl('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
  });
});

describe('findChrome', () => {
  it('takes CHROME_PATH when it exists and refuses one that does not', () => {
    delete proc.env.MEDIA_CHROMIUM;
    proc.env.CHROME_PATH = proc.execPath;
    expect(findChrome()).toBe(proc.execPath);
    proc.env.CHROME_PATH = '/nowhere/chrome-that-is-not-there';
    expect(() => findChrome()).toThrow(/CHROME_PATH=.*no such file/);
  });

  it('gives null with MEDIA_CHROMIUM=1, so the headless shell is used on purpose', () => {
    proc.env.MEDIA_CHROMIUM = '1';
    proc.env.CHROME_PATH = proc.execPath;
    expect(findChrome()).toBeNull();
  });
});

describe('BROWSER_ARGS', () => {
  it('keeps the GPU on and lets a headed window behind others keep drawing', () => {
    expect(BROWSER_ARGS).toContain('--ignore-gpu-blocklist');
    expect(BROWSER_ARGS).toContain('--disable-renderer-backgrounding');
    expect(BROWSER_ARGS).toContain('--disable-background-timer-throttling');
  });
});
