import { describe, expect, it } from 'vitest';

// Vitest stubs .css imports to '', so both files are read through a
// dynamically named node:fs import, with paths from the repo root (vitest's cwd).
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: string, encoding: 'utf8'): string;
};

/** design/tokens.json and tokens.css must give type, shadows and control sizes the same values. */
const design = JSON.parse(readFileSync('design/tokens.json', 'utf8')) as Record<string, unknown>;
const tokensCss = readFileSync('src/ui/styles/tokens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** The :root custom properties, first declaration wins (later blocks only override for reduced motion). */
const cssVars = new Map<string, string>();
for (const m of tokensCss.slice(0, tokensCss.indexOf('}')).matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
  if (!cssVars.has(m[1]!)) cssVars.set(m[1]!, m[2]!.replace(/\s+/g, ' ').trim());
}

/** A tokens.css value with every var() replaced by its value. */
function cssValue(name: string): string {
  const raw = cssVars.get(name);
  if (raw === undefined) throw new Error(`tokens.css has no ${name}`);
  return raw.replace(/var\((--[\w-]+)\)/g, (_, ref: string) => cssValue(ref));
}

interface Dim {
  value: number;
  unit: string;
}
interface Shadow {
  color: unknown;
  offsetX: Dim;
  offsetY: Dim;
  blur: Dim;
  spread: Dim;
}
interface Color {
  hex: string;
  alpha?: number;
}

function node(path: string): { $value: unknown } {
  const found = path.split('.').reduce<unknown>((at, part) => (at as Record<string, unknown> | undefined)?.[part], design);
  if (!found || typeof found !== 'object' || !('$value' in found)) throw new Error(`design/tokens.json has no ${path}`);
  return found as { $value: unknown };
}

/** A design token's raw value with "{a.b}" references followed. */
function designValue(path: string): unknown {
  const v = node(path).$value;
  return typeof v === 'string' && /^\{.+\}$/.test(v) ? designValue(v.slice(1, -1)) : v;
}

const px = (d: Dim): string => (d.value === 0 ? '0' : `${d.value}${d.unit}`);

function color(c: unknown): string {
  const v = typeof c === 'string' ? designValue(c.slice(1, -1)) : c;
  const { hex, alpha } = v as Color;
  if (alpha === undefined) return hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** A design shadow (one layer, or a list of references) written as CSS. */
function shadowCss(path: string): string {
  const v = designValue(path);
  if (Array.isArray(v)) return v.map((ref: string) => shadowCss(ref.slice(1, -1))).join(', ');
  const s = v as Shadow;
  return `${px(s.offsetX)} ${px(s.offsetY)} ${px(s.blur)} ${px(s.spread)} ${color(s.color)}`;
}

describe('design/tokens.json and tokens.css stay in sync', () => {
  it.each(['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', 'caption', 'label', 'value', 'panel-title', 'screen-title'])('font size %s', (step) => {
    expect(cssValue(`--font-size-${step}`)).toBe(px(designValue(`font.size.${step}`) as Dim));
  });

  it.each(['regular', 'semibold', 'bold', 'heavy'])('font weight %s', (w) => {
    expect(cssValue(`--font-weight-${w}`)).toBe(String(designValue(`font.weight.${w}`)));
  });

  it.each(['tight', 'base'])('line height %s', (lh) => {
    expect(cssValue(`--line-height-${lh}`)).toBe(String(designValue(`font.line-height.${lh}`)));
  });

  it.each([
    ['sm', '--shadow-sm'],
    ['md', '--shadow-md'],
    ['lg', '--shadow-lg'],
    ['soft', '--shadow-soft'],
    ['card', '--shadow-card'],
    ['frame', '--frame-shadow'],
  ])('shadow %s as %s', (step, name) => {
    expect(cssValue(name)).toBe(shadowCss(`shadow.${step}`));
  });

  it.each(['target', 'target-lg', 'hud-pill', 'control-sm', 'control-md', 'control-lg', 'hud-row', 'frame-outline', 'outline', 'outline-sm'])('size %s', (size) => {
    expect(cssValue(`--size-${size}`)).toBe(px(designValue(`size.${size}`) as Dim));
  });
});
