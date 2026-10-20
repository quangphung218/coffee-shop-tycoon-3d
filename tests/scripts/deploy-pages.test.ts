// Runs scripts/deploy-pages.sh in throwaway git repos with a local bare
// "origin" and stub npm/gh, to check when it refuses to start and that it
// pushes the release commit and tag after a deploy.
import { afterEach, describe, expect, it } from 'vitest';

// The project has no Node types, so load the modules through dynamically
// named imports with the few signatures used here.
interface SpawnResult {
  status: number | null;
  stdout: string;
  stderr: string;
}
type Env = Record<string, string | undefined>;
const load = (name: string) => import(/* @vite-ignore */ name);
const { spawnSync } = (await load('node:child_process')) as {
  spawnSync(cmd: string, args: string[], opts: { cwd: string; env: Env; encoding: 'utf8' }): SpawnResult;
};
const { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = (await load(
  'node:fs',
)) as {
  chmodSync(path: string, mode: number): void;
  copyFileSync(from: string, to: string): void;
  existsSync(path: string): boolean;
  mkdirSync(path: string, opts?: { recursive: boolean }): void;
  mkdtempSync(prefix: string): string;
  readFileSync(path: string, encoding: 'utf8'): string;
  rmSync(path: string, opts: { recursive: boolean; force: boolean }): void;
  writeFileSync(path: string, data: string): void;
};
const { tmpdir } = (await load('node:os')) as { tmpdir(): string };
const { dirname, join, resolve } = (await load('node:path')) as {
  dirname(path: string): string;
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
};
const { env: processEnv } = (globalThis as unknown as { process: { env: Env } }).process;

const SCRIPTS = resolve('scripts');
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const env = (bin: string): Env => ({
  ...processEnv,
  PATH: `${bin}:${processEnv.PATH}`,
  // The script's mktemp -d lands inside the throwaway dir.
  TMPDIR: dirname(bin),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
});

function git(cwd: string, bin: string, ...args: string[]) {
  const r = spawnSync('git', args, { cwd, env: env(bin), encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function stub(bin: string, name: string, body: string) {
  const path = join(bin, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}

/** main == origin/main at v0.1.0, plus one fix commit, with stub tools. */
function setup() {
  const base = mkdtempSync(join(tmpdir(), 'deploy-pages-'));
  dirs.push(base);
  const bin = join(base, 'bin');
  const origin = join(base, 'origin.git');
  const repo = join(base, 'repo');
  mkdirSync(bin);
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  mkdirSync(join(repo, 'node_modules', '.bin'), { recursive: true });

  // npm run check fails when FAIL_CHECK is set, and logs the HEAD it ran on;
  // npm run build writes dist/; npm version edits package.json like the real one.
  stub(
    bin,
    'npm',
    `case "$1 $2" in
  "run check") echo "$(git log -1 --format=%s) workers=\${VITEST_MAX_WORKERS:-}" >> "$CHECK_LOG"; [ -z "\${FAIL_CHECK:-}" ] || { echo "1 test failed" >&2; exit 1; } ;;
  "run build") mkdir -p dist && echo ok > dist/index.html ;;
  version*) node -e 'const f=require("fs");const p=JSON.parse(f.readFileSync("package.json"));p.version=process.argv[1];f.writeFileSync("package.json",JSON.stringify(p,null,2)+"\\n")' "$2" ;;
  *) echo "unexpected npm $*" >&2; exit 1 ;;
esac`,
  );
  stub(bin, 'gh', 'exit 0');
  stub(join(repo, 'node_modules', '.bin'), 'tsc', 'exit 0');
  stub(join(repo, 'node_modules', '.bin'), 'vite', 'exit 0');

  copyFileSync(join(SCRIPTS, 'deploy-pages.sh'), join(repo, 'scripts', 'deploy-pages.sh'));
  copyFileSync(join(SCRIPTS, 'release.mjs'), join(repo, 'scripts', 'release.mjs'));
  writeFileSync(join(repo, 'package.json'), '{\n  "name": "t",\n  "version": "0.1.0"\n}\n');
  writeFileSync(join(repo, 'package-lock.json'), '{}\n');
  copyFileSync(join(repo, 'package-lock.json'), join(repo, 'node_modules', '.package-lock.json'));
  writeFileSync(join(repo, 'CHANGELOG.md'), '# Changelog\n');
  writeFileSync(join(repo, '.gitignore'), 'node_modules/\ndist/\n');

  git(base, bin, 'init', '-q', '--bare', '-b', 'main', origin);
  git(repo, bin, 'init', '-q', '-b', 'main');
  git(repo, bin, 'config', 'user.name', 'Test');
  git(repo, bin, 'config', 'user.email', 'test@example.com');
  git(repo, bin, 'remote', 'add', 'origin', origin);
  git(repo, bin, 'add', '-A');
  git(repo, bin, 'commit', '-q', '-m', 'chore: init');
  git(repo, bin, 'tag', '-a', 'v0.1.0', '-m', 'v0.1.0');
  writeFileSync(join(repo, 'a.txt'), 'a\n');
  git(repo, bin, 'add', 'a.txt');
  git(repo, bin, 'commit', '-q', '-m', 'fix: a');
  git(repo, bin, 'push', '-q', 'origin', 'main', 'v0.1.0');
  return { base, bin, origin, repo };
}

function deploy(repo: string, bin: string, extra: Env = {}) {
  const checkLog = join(dirname(bin), 'check.log');
  return spawnSync('sh', ['scripts/deploy-pages.sh'], {
    cwd: repo,
    env: { CHECK_LOG: checkLog, ...env(bin), VITEST_MAX_WORKERS: undefined, ...extra },
    encoding: 'utf8',
  });
}

const checkRuns = (bin: string): string[] => {
  const path = join(dirname(bin), 'check.log');
  return existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n') : [];
};

/** Asserts the script stopped before release.mjs and the build. */
function expectStopped(r: ReturnType<typeof deploy>, repo: string, bin: string, head: string) {
  expect(r.status).not.toBe(0);
  expect(r.stderr).toContain('Nothing was built, committed or pushed.');
  expect(git(repo, bin, 'rev-parse', 'HEAD')).toBe(head);
  expect(git(repo, bin, 'tag', '--list', 'v0.1.1')).toBe('');
  expect(existsSync(join(repo, 'dist'))).toBe(false);
}

describe('deploy-pages.sh', { timeout: 20_000 }, () => {
  it('stops when main is not checked out', () => {
    const { repo, bin } = setup();
    git(repo, bin, 'switch', '-q', '-c', 'feature');
    const head = git(repo, bin, 'rev-parse', 'HEAD');
    const r = deploy(repo, bin);
    expectStopped(r, repo, bin, head);
    expect(r.stderr).toContain('deploy only runs on main (current: feature)');
    expect(r.stderr).toContain('git switch main');
  });

  it('stops when tracked files have uncommitted changes', () => {
    const { repo, bin } = setup();
    writeFileSync(join(repo, 'a.txt'), 'changed\n');
    const head = git(repo, bin, 'rev-parse', 'HEAD');
    const r = deploy(repo, bin);
    expectStopped(r, repo, bin, head);
    expect(r.stderr).toContain('uncommitted changes');
    expect(r.stderr).toContain('a.txt');
  });

  it('suggests git pull --ff-only when local main is behind origin/main', () => {
    const { base, repo, bin } = setup();
    const other = join(base, 'other');
    git(base, bin, 'clone', '-q', join(base, 'origin.git'), other);
    git(other, bin, 'config', 'user.name', 'Test');
    git(other, bin, 'config', 'user.email', 'test@example.com');
    git(other, bin, 'commit', '-q', '--allow-empty', '-m', 'fix: merged on GitHub');
    git(other, bin, 'push', '-q', 'origin', 'main');
    const head = git(repo, bin, 'rev-parse', 'HEAD');
    const r = deploy(repo, bin);
    expectStopped(r, repo, bin, head);
    expect(r.stderr).toContain('1 commit(s) behind origin/main');
    expect(r.stderr).toContain('git pull --ff-only');
  });

  it('stops when local main has commits origin/main does not', () => {
    const { repo, bin } = setup();
    git(repo, bin, 'commit', '-q', '--allow-empty', '-m', 'fix: local only');
    const head = git(repo, bin, 'rev-parse', 'HEAD');
    const r = deploy(repo, bin);
    expectStopped(r, repo, bin, head);
    expect(r.stderr).toContain('1 commit(s) that origin/main does not');
    expect(r.stderr).toContain('fix: local only');
  });

  it('points at the unpushed release when local main ends at a release tag', () => {
    const { repo, bin } = setup();
    git(repo, bin, 'commit', '-q', '--allow-empty', '-m', 'chore(release): v0.1.1');
    git(repo, bin, 'tag', '-a', 'v0.1.1', '-m', 'v0.1.1');
    const r = deploy(repo, bin);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('git push origin main v0.1.1');
    expect(existsSync(join(repo, 'dist'))).toBe(false);
  });

  it('stops when local main and origin/main have split', () => {
    const { base, repo, bin } = setup();
    const other = join(base, 'other');
    git(base, bin, 'clone', '-q', join(base, 'origin.git'), other);
    git(other, bin, 'config', 'user.name', 'Test');
    git(other, bin, 'config', 'user.email', 'test@example.com');
    git(other, bin, 'commit', '-q', '--allow-empty', '-m', 'fix: remote');
    git(other, bin, 'push', '-q', 'origin', 'main');
    git(repo, bin, 'commit', '-q', '--allow-empty', '-m', 'fix: local');
    const head = git(repo, bin, 'rev-parse', 'HEAD');
    const r = deploy(repo, bin);
    expectStopped(r, repo, bin, head);
    expect(r.stderr).toContain('have split (1 local, 1 remote commit(s))');
  });

  it('stops before the release commit and tag when npm run check fails', () => {
    const { origin, repo, bin } = setup();
    const head = git(repo, bin, 'rev-parse', 'HEAD');
    const r = deploy(repo, bin, { FAIL_CHECK: '1' });
    expectStopped(r, repo, bin, head);
    expect(r.stderr).toContain('npm run check failed');
    expect(git(repo, bin, 'log', '-1', '--format=%s')).toBe('fix: a');
    expect(git(origin, bin, 'branch', '--list', 'gh-pages')).toBe('');
  });

  it('runs npm run check on the merged commit, before the release commit', () => {
    const { repo, bin } = setup();
    const r = deploy(repo, bin);
    expect(r.status, r.stderr).toBe(0);
    expect(checkRuns(bin)).toEqual(['fix: a workers=2']);
  });

  it('deploys, then pushes the release commit and tag to origin', () => {
    const { origin, repo, bin } = setup();
    const r = deploy(repo, bin);
    expect(r.status, r.stderr).toBe(0);
    const head = git(repo, bin, 'rev-parse', 'HEAD');
    expect(git(repo, bin, 'log', '-1', '--format=%s')).toBe('chore(release): v0.1.1');
    expect(git(origin, bin, 'rev-parse', 'main')).toBe(head);
    expect(git(origin, bin, 'rev-parse', 'v0.1.1^{commit}')).toBe(head);
    expect(git(origin, bin, 'log', '-1', '--format=%s', 'gh-pages')).toMatch(/^deploy: build from /);
    expect(r.stdout).toContain('Pushed main and v0.1.1.');
  });

  it('does not push main or a tag when there is nothing to release', () => {
    const { origin, repo, bin } = setup();
    git(repo, bin, 'tag', '-a', 'v0.1.1', '-m', 'v0.1.1');
    git(repo, bin, 'push', '-q', 'origin', 'v0.1.1');
    const before = git(origin, bin, 'rev-parse', 'main');
    const r = deploy(repo, bin);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain('Pushing release');
    expect(git(origin, bin, 'rev-parse', 'main')).toBe(before);
  });

  it('warns and exits non-zero when pushing the release fails', () => {
    const { origin, repo, bin } = setup();
    // Accept gh-pages, reject main, like a protected branch.
    stub(
      join(origin, 'hooks'),
      'pre-receive',
      'while read old new ref; do [ "$ref" = refs/heads/main ] && { echo "main is protected" >&2; exit 1; }; done; exit 0',
    );
    const before = git(origin, bin, 'rev-parse', 'main');
    const r = deploy(repo, bin);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('WARNING: pushing the release commit and tag v0.1.1 failed.');
    expect(r.stderr).toContain('git push origin main v0.1.1');
    expect(git(origin, bin, 'rev-parse', 'main')).toBe(before);
    expect(git(origin, bin, 'tag', '--list', 'v0.1.1')).toBe('');
    expect(git(origin, bin, 'log', '-1', '--format=%s', 'gh-pages')).toMatch(/^deploy: build from /);
  });
});
