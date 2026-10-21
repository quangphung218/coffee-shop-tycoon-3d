import type { Browser } from 'playwright';

/** A Playwright Browser with the WebGL renderer it reported at launch. */
export interface GpuBrowser extends Browser {
  gpu: string;
  softwareGl: boolean;
}

export interface LaunchOptions {
  headless?: boolean;
  args?: readonly string[];
  ignoreDefaultArgs?: readonly string[];
  requireGpu?: boolean;
  log?: (line: string) => void;
}

export const BROWSER_ARGS: readonly string[];
export function findChrome(): string | null;
export function gpuName(browser: Browser): Promise<string>;
export function isSoftwareGl(gpu: string): boolean;
export function launchBrowser(options?: LaunchOptions): Promise<GpuBrowser>;
