export const GAME_MINUTES_PER_SECOND: number;
export const MAX_FRAME_S: number;
export const SHOTS: Record<string, { run?: unknown; after?: unknown; before?: unknown; hooks: readonly unknown[] }>;
export function session(browser: unknown, url: string, save: { key: string; text: string } | null, options: Record<string, unknown>, fn: (page: unknown, t0: number) => Promise<unknown>): Promise<unknown>;
export function until(t0: number, ms: number): Promise<void>;
type Vec3 = { x: number; y: number; z: number };
export function clearBox(box: { min: Vec3; max: Vec3 }): number;
export function openPanel(page: unknown, id: string, settleMs?: number): Promise<void>;
