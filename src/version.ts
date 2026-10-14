/** Replaced at build time with package.json "version" (see `define` in vite.config.ts). */
declare const __APP_VERSION__: string;

export const APP_VERSION: string = __APP_VERSION__;

/** Shown on the Main Menu and in Settings, e.g. "v0.1.0". */
export const VERSION_LABEL = `v${APP_VERSION}`;
