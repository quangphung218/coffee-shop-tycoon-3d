// @vitest-environment node
// Static import graph of the main chunk: everything src/main.ts reaches
// without import() lands in the JS the menu waits for.
import { describe, expect, it } from 'vitest';

// The project has no Node types, so node:fs comes through a dynamically
// named import; paths are from the project root (vitest's cwd).
const FS_MODULE = 'node:fs';
const { existsSync, readFileSync, statSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
  statSync(path: string): { isFile(): boolean };
};

const ENTRY = 'src/main.ts';

/** `dir` joined with `rel`, with `.` and `..` folded away (POSIX separators). */
function join(dir: string, rel: string): string {
  const out: string[] = [];
  for (const part of `${dir}/${rel}`.split('/')) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
}

const dirname = (path: string): string => path.slice(0, path.lastIndexOf('/'));

/** Import clause: default, `{ ... }`, `* as x`, or a default followed by one of those. */
const CLAUSE = String.raw`(?:\{[^}]*\}|\*(?:\s+as\s+[\w$]+)?|[\w$]+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+[\w$]+))?)`;
const FROM = new RegExp(String.raw`\b(import|export)\s+(type\s+)?${CLAUSE}\s*from\s*['"]([^'"]+)['"]`, 'g');
const BARE = /\bimport\s*['"]([^'"]+)['"]/g;

/** Module specifiers a source pulls in statically; `import type`, `export type` and import() are left out. */
function staticImports(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const specs: string[] = [];
  for (const m of code.matchAll(FROM)) if (!m[2]) specs.push(m[3]!);
  for (const m of code.matchAll(BARE)) specs.push(m[1]!);
  return specs;
}

const isFile = (path: string): boolean => existsSync(path) && statSync(path).isFile();

/** Repo-relative file a relative specifier points at, trying `.ts` and `/index.ts`. */
function resolve(from: string, spec: string, has: (path: string) => boolean = isFile): string | null {
  const base = join(dirname(from), spec);
  return [base, `${base}.ts`, join(base, 'index.ts')].find(has) ?? null;
}

interface Graph {
  /** Each reached file and the file that first imported it (the entry maps to null). */
  parent: Map<string, string | null>;
  unresolved: string[];
}

function walk(entry: string, read = (path: string): string => readFileSync(path, 'utf8'), has = isFile): Graph {
  const parent = new Map<string, string | null>([[entry, null]]);
  const unresolved: string[] = [];
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (!file.endsWith('.ts')) continue;
    for (const spec of staticImports(read(file))) {
      if (!spec.startsWith('.')) continue;
      const target = resolve(file, spec, has);
      if (!target) {
        unresolved.push(`${file} -> ${spec}`);
        continue;
      }
      if (parent.has(target)) continue;
      parent.set(target, file);
      queue.push(target);
    }
  }
  return { parent, unresolved };
}

/** Import chain from the entry to `file`, e.g. `src/main.ts -> src/a.ts -> src/b.ts`. */
function chain(graph: Graph, file: string): string {
  const path: string[] = [];
  for (let f: string | null | undefined = file; f; f = graph.parent.get(f)) path.unshift(f);
  return path.join(' -> ');
}

const BANNED_DIRS = ['src/sim/', 'src/ui/hud/', 'src/ui/report/', 'src/ui/panels/', 'src/audio/', 'src/render/'];
const BANNED_FILES = [
  'src/save/save.ts',
  'src/ui/screens/shell.ts',
  'src/ui/screens/game.ts',
  'src/ui/screens/weekEnd.ts',
  'src/ui/screens/pause.ts',
  'src/ui/screens/newGame.ts',
  'src/ui/screens/loadGame.ts',
];

describe('import walker', () => {
  const files: Record<string, string> = {
    'src/a.ts': [
      "import type { X } from '../sim/types';",
      "export type { Y } from './hidden';",
      "import { b, type B } from './b';",
      "export { c } from './c';",
      "import './style.css';",
      "import { lib } from 'three';",
      "// import { gone } from './commented';",
      "const lazy = () => import('./lazy');",
      'type T = typeof import(\'./typed\');',
    ].join('\n'),
    'src/b.ts': "import * as d from './d/index';\nimport e, { f } from './e';",
    'src/c.ts': '',
    'src/d/index.ts': '',
    'src/e.ts': "import { x } from './sim/types';",
    'src/sim/types.ts': '',
  };
  const read = (path: string): string => files[path] ?? '';
  const has = (path: string): boolean => path in files;

  it('keeps value imports and re-exports, skips type-only, dynamic and commented ones', () => {
    expect(staticImports(read('src/a.ts'))).toEqual(['./b', './c', 'three', './style.css']);
    expect(staticImports(read('src/b.ts'))).toEqual(['./d/index', './e']);
  });

  it('does not count `import type` from src/sim as a dependency', () => {
    expect(staticImports("import type { X } from '../sim/types';")).toEqual([]);
    expect(staticImports("export type { X } from '../sim/types';")).toEqual([]);
  });

  it('resolves .ts and /index.ts against the repo', () => {
    expect(resolve('src/main.ts', './game')).toBe('src/game.ts');
    expect(resolve('src/main.ts', './render/scene')).toBe('src/render/scene/index.ts');
    expect(resolve('src/main.ts', './ui/styles/ui.css')).toBe('src/ui/styles/ui.css');
    expect(resolve('src/ui/screens/mainMenu.ts', '../../save/./slots')).toBe('src/save/slots.ts');
    expect(resolve('src/main.ts', './missing')).toBeNull();
  });

  it('follows value imports through files and reports the chain to each', () => {
    const graph = walk('src/a.ts', read, has);
    expect([...graph.parent.keys()].sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d/index.ts', 'src/e.ts', 'src/sim/types.ts']);
    expect(graph.unresolved).toEqual(['src/a.ts -> ./style.css']);
    expect(chain(graph, 'src/sim/types.ts')).toBe('src/a.ts -> src/b.ts -> src/e.ts -> src/sim/types.ts');
  });

  it('leaves out a file reached only through `import type`', () => {
    const typeOnly = (path: string): string => (path === 'src/e.ts' ? "import type { x } from './sim/types';" : read(path));
    expect(walk('src/a.ts', typeOnly, has).parent.has('src/sim/types.ts')).toBe(false);
  });
});

describe('main chunk static import graph (src/main.ts)', () => {
  const graph = walk(ENTRY);
  const reached = [...graph.parent.keys()];

  it('resolves every relative import', () => {
    expect(graph.unresolved).toEqual([]);
  });

  it('reaches no sim, HUD, report, panels, audio or render code', () => {
    const hits = reached.filter((f) => BANNED_DIRS.some((d) => f.startsWith(d))).map((f) => chain(graph, f));
    expect(hits, `banned files on the main chunk:\n${hits.join('\n')}`).toEqual([]);
  });

  it('reaches none of the game-only files', () => {
    const hits = BANNED_FILES.filter((f) => graph.parent.has(f)).map((f) => chain(graph, f));
    expect(hits, `banned files on the main chunk:\n${hits.join('\n')}`).toEqual([]);
  });

  it('reaches the menu shell, main menu, settings and slot summaries', () => {
    for (const f of ['src/ui/screens/menuShell.ts', 'src/ui/screens/mainMenu.ts', 'src/ui/screens/settings.ts', 'src/save/slots.ts']) {
      expect(graph.parent.has(f), `${f} not reached from ${ENTRY}`).toBe(true);
    }
  });

  it('loads the game and 3D scene chunks with import()', () => {
    const main = readFileSync(ENTRY, 'utf8');
    expect(main).toContain("import('./game')");
    expect(main).toContain("import('./render/scene')");
  });
});
