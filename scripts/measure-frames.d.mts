export interface FrameArgs {
  base: string | null;
  runs: number;
  headed: boolean;
  fx: boolean;
  scene: string | null;
}

export function parseArgs(argv: readonly string[]): FrameArgs;
