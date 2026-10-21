export interface CaptureArgs {
  scenario: string | null;
  only: string[] | null;
  savesOnly: boolean;
  headed: boolean;
  out: string | null;
  base: string | null;
}

export interface ScenarioStep {
  kind: 'shot' | 'pair' | 'board' | 'check';
  id?: string;
  shot?: string;
  build?: 'cur' | 'base';
  save?: string | null;
  tags?: string[];
  file?: string | ((ctx: unknown) => string);
  [key: string]: unknown;
}

export interface Scenario {
  id: string;
  out?: string;
  base?: string | null;
  tags?: string[];
  onlyEnv?: string;
  savesOnlyEnv?: string;
  saves(mods: unknown, options: { isBase: boolean; only: string[] | null; ctx: unknown }): Promise<{ saves: Record<string, unknown>; info: string }> | { saves: Record<string, unknown>; info: string };
  steps: ScenarioStep[];
}

export function parseArgs(argv: readonly string[]): CaptureArgs;
export function loadScenario(name: string): Promise<Scenario>;
export function fill<T>(text: T, ctx: Record<string, unknown>): T extends string ? string : T;
export function selectSteps<T extends { tags?: string[] }>(steps: readonly T[], only: readonly string[] | null): T[];
export function main(argv?: readonly string[]): Promise<unknown>;
