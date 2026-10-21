/** Face prints per mood: [min x, y, z, max x, y, z] of the brows-and-mouth geometry. */
export type FaceMarks = Record<string, number[]>;
export interface FaceSeen {
  print: number[];
  box: { x: number; y: number; w: number; h: number; inside?: boolean };
}
export function faceMarks(rig: typeof import('../../src/render/actors/rig')): FaceMarks;
export function matchMood(print: readonly number[], marks: FaceMarks): string | null;
export function faceOf(faces: readonly FaceSeen[] | undefined, marks: FaceMarks): { mood: string; box: FaceSeen['box'] } | null;
// In-page functions (serialised by Playwright): typed loosely, they only run through page.evaluate / addInitScript.
export function focusHooks(): void;
export function clockHooks(): void;
export function coinHooks(): void;
export function framesCounter(): void;
export function alwaysVisible(): void;
export function scanActors(args: unknown): unknown;
export function lightInfo(): unknown;
export function poolBox(): unknown;
export function shadowOf(args: unknown): unknown;
export function coinMeasure(): unknown;
export function lumaCells(args: unknown): Promise<unknown>;
export function unionBox(sels: readonly string[]): unknown;
export function sectionBox(args: unknown): unknown;
export function scrollPanelToEnd(): void;
export function readDom(args: unknown): unknown[];
export function textsOf(sel: string): string[];
