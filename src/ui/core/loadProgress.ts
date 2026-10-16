/**
 * Loading progress from the files the page really downloads. vite.config.ts
 * writes the build's file list with byte sizes into index.html as
 * window.__cstAssets: `boot` is what the Main Menu needs (entry chunk and
 * CSS), `scene` the lazy three.js world. Resource Timing reports each file
 * once it has arrived, so progress is the share of bytes finished. In dev the
 * lists are empty and only the build steps count.
 */

/** [path in the build such as "assets/three-abc.js", size in bytes]. */
export type AssetList = readonly (readonly [string, number])[];

export interface BuildAssets {
  boot: AssetList;
  scene: AssetList;
}

/** Share of the scene bar for downloads; building the world and compiling shaders take the rest. */
export const DOWNLOAD_SHARE = 0.8;
/** Progress once the world is built, before the shaders have compiled. */
export const BUILT_SHARE = 0.9;

/** The lists index.html put on window, or empty ones. */
export function readAssets(): BuildAssets {
  const a = (globalThis as { __cstAssets?: Partial<BuildAssets> }).__cstAssets;
  return { boot: Array.isArray(a?.boot) ? a.boot : [], scene: Array.isArray(a?.scene) ? a.scene : [] };
}

/** The file of `files` that resource URL `url` is, or undefined. */
export function matchAsset(files: AssetList, url: string): string | undefined {
  const path = url.split(/[?#]/)[0] ?? '';
  return files.find(([file]) => path.endsWith(`/${file}`))?.[0];
}

/** Bytes of `files` in `done` over all their bytes; null when there is no list (dev). */
export function downloadedFraction(files: AssetList, done: ReadonlySet<string>): number | null {
  let total = 0;
  let got = 0;
  for (const [file, bytes] of files) {
    total += bytes;
    if (done.has(file)) got += bytes;
  }
  return total > 0 ? got / total : null;
}

export type SceneStage = 'download' | 'built' | 'compiled';

/** Overall 0–1 progress of the scene: downloads fill DOWNLOAD_SHARE, then each later stage its fixed mark. */
export function sceneProgress(download: number | null, stage: SceneStage): number {
  if (stage === 'compiled') return 1;
  if (stage === 'built') return BUILT_SHARE;
  return Math.min(1, Math.max(0, download ?? 0)) * DOWNLOAD_SHARE;
}

/**
 * Calls `onChange` with downloadedFraction() each time one of `files` finishes
 * loading, including files that finished before the call. Returns a stop function.
 */
export function watchDownloads(files: AssetList, onChange: (fraction: number) => void): () => void {
  if (files.length === 0 || typeof PerformanceObserver === 'undefined') return () => {};
  const done = new Set<string>();
  const observer = new PerformanceObserver((list) => {
    let changed = false;
    for (const entry of list.getEntries()) {
      const file = matchAsset(files, entry.name);
      if (file && !done.has(file)) {
        done.add(file);
        changed = true;
      }
    }
    if (changed) onChange(downloadedFraction(files, done) ?? 0);
  });
  try {
    observer.observe({ type: 'resource', buffered: true });
  } catch {
    return () => {};
  }
  return () => observer.disconnect();
}
