/**
 * Loading progress of the 3D scene as a list of components (LOAD_COMPONENTS),
 * each with a weight; overall progress is their weighted average and the
 * shop opens only once every one is done. Audio is synthesised with Web Audio
 * at run time and has no file, so it needs no loading and is not listed.
 *
 * The code item follows the files the page really downloads. vite.config.ts
 * writes the build's file list with byte sizes into index.html as
 * window.__cstAssets: `boot` is what the Main Menu needs (entry chunk and
 * CSS), `scene` the lazy three.js world. Resource Timing reports each file
 * once it has arrived, so the code item is the share of bytes finished. In
 * dev the lists are empty and it goes straight from 0 to done.
 */

/** [path in the build such as "assets/three-abc.js", size in bytes]. */
export type AssetList = readonly (readonly [string, number])[];

export interface BuildAssets {
  boot: AssetList;
  scene: AssetList;
}

/** Components loaded before the shop can open, in the order they are listed. */
export type LoadComponentId = 'code' | 'fonts' | 'icons' | 'world' | 'shaders' | 'labels';

export type LoadComponentStatus = 'waiting' | 'loading' | 'done' | 'error';

export interface LoadComponent {
  id: LoadComponentId;
  /** Shown on the loading list. */
  label: string;
  /** Share of the overall progress, relative to the other weights. */
  weight: number;
  status: LoadComponentStatus;
  /** 0–1 within this component. */
  progress: number;
}

/**
 * Labels and weights. The code chunk (three + src/render, by bytes) is most
 * of the wait on a slow network, the shader compile most of it after that.
 * `labels` (label and texture warm-up) is reported by world.prepare's onStep.
 */
export const LOAD_COMPONENTS: readonly Pick<LoadComponent, 'id' | 'label' | 'weight'>[] = [
  { id: 'code', label: 'Mã cảnh 3D', weight: 55 },
  { id: 'fonts', label: 'Font', weight: 5 },
  { id: 'icons', label: 'Icon', weight: 5 },
  { id: 'world', label: 'Dựng quán', weight: 10 },
  { id: 'shaders', label: 'Biên dịch shader', weight: 15 },
  { id: 'labels', label: 'Nhãn và texture', weight: 10 },
];

/** Every component of LOAD_COMPONENTS, waiting at 0. */
export function initialComponents(): LoadComponent[] {
  return LOAD_COMPONENTS.map((c) => ({ ...c, status: 'waiting', progress: 0 }));
}

/** 0–1 of one component: done counts whole, anything else its progress clamped. */
export function componentProgress(c: Pick<LoadComponent, 'status' | 'progress'>): number {
  if (c.status === 'done') return 1;
  return Math.min(1, Math.max(0, c.progress));
}

/** Weighted average of componentProgress over `list`; 1 for an empty list. */
export function weightedProgress(list: readonly LoadComponent[]): number {
  let total = 0;
  let got = 0;
  for (const c of list) {
    total += c.weight;
    got += c.weight * componentProgress(c);
  }
  return total > 0 ? got / total : 1;
}

/** 'error' if any component failed, 'ready' once all are done, otherwise 'loading'. */
export function componentsStatus(list: readonly LoadComponent[]): 'loading' | 'ready' | 'error' {
  if (list.some((c) => c.status === 'error')) return 'error';
  return list.every((c) => c.status === 'done') ? 'ready' : 'loading';
}

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

/** Text that needs both Nunito subsets (latin and vietnamese) loaded. */
const FONT_SAMPLE = 'Aa Đang chuẩn bị quán';

/**
 * Loads Nunito 400 and 700 for both subsets through the CSS Font Loading API.
 * Resolves at once where there is no document.fonts (tests); rejects when a
 * face fails to load, so the caller can offer "Thử lại".
 */
export async function loadFonts(fonts: FontFaceSet | undefined = globalThis.document?.fonts): Promise<void> {
  if (!fonts) return;
  await Promise.all([fonts.load(`400 1em Nunito`, FONT_SAMPLE), fonts.load(`700 1em Nunito`, FONT_SAMPLE)]);
}
