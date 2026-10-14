import { describe, expect, it } from 'vitest';
import {
  CHANGELOG_HEADER,
  bumpLevel,
  changelogSection,
  insertChangelog,
  nextVersion,
  parseCommit,
} from '../../scripts/release.mjs';

const commits = (...messages: string[]) => messages.map((m, i) => parseCommit(m, `${i}abcdef0123`));

describe('parseCommit', () => {
  it('reads type, scope, summary and the breaking marks', () => {
    expect(parseCommit('feat(ui): show the version', 'abc')).toEqual({
      hash: 'abc',
      type: 'feat',
      scope: 'ui',
      breaking: false,
      summary: 'show the version',
    });
    expect(parseCommit('refactor!: drop save v0')?.breaking).toBe(true);
    expect(parseCommit('fix(save): new slot format\n\nBREAKING CHANGE: old slots need migrating')?.breaking).toBe(true);
    expect(parseCommit('fix: x\n\nBREAKING-CHANGE: y')?.breaking).toBe(true);
  });

  it('ignores messages that are not Conventional Commits', () => {
    expect(parseCommit("Merge branch 'docs/x' into main")).toBeNull();
    expect(parseCommit('update stuff')).toBeNull();
  });
});

describe('nextVersion', () => {
  it('feat bumps minor, fix and perf bump patch', () => {
    expect(nextVersion('1.2.3', commits('feat: a'))).toBe('1.3.0');
    expect(nextVersion('1.2.3', commits('fix: a'))).toBe('1.2.4');
    expect(nextVersion('1.2.3', commits('perf(render): a'))).toBe('1.2.4');
  });

  it('takes the highest level across commits', () => {
    expect(nextVersion('1.2.3', commits('fix: a', 'feat: b', 'docs: c'))).toBe('1.3.0');
    expect(bumpLevel(commits('fix: a', 'feat!: b'))).toBe('major');
  });

  it('breaking bumps major from 1.x, minor while on 0.x', () => {
    expect(nextVersion('1.2.3', commits('feat!: a'))).toBe('2.0.0');
    expect(nextVersion('1.2.3', commits('chore: a\n\nBREAKING CHANGE: b'))).toBe('2.0.0');
    expect(nextVersion('0.1.4', commits('fix!: a'))).toBe('0.2.0');
    expect(nextVersion('0.1.4', commits('feat: a'))).toBe('0.2.0');
    expect(nextVersion('0.1.4', commits('fix: a'))).toBe('0.1.5');
  });

  it('keeps the version without feat, fix, perf or breaking commits', () => {
    expect(nextVersion('0.1.0', [])).toBe('0.1.0');
    expect(nextVersion('0.1.0', commits('docs: a', 'test: b', 'chore(release): v0.1.0', 'Merge branch x'))).toBe('0.1.0');
  });

  it('rejects versions that are not x.y.z', () => {
    expect(() => nextVersion('1.0', [])).toThrow();
  });
});

describe('changelog', () => {
  it('groups feat under Added, fix under Fixed, perf and other breaking under Changed', () => {
    const section = changelogSection('0.2.0', '2026-10-14', commits('feat(ui): show version', 'fix: wrong total', 'docs: readme', 'perf: faster path', 'refactor!: new save'));
    expect(section).toBe(
      [
        '## [0.2.0] - 2026-10-14',
        '',
        '### Added',
        '',
        '- **ui:** show version (0abcdef)',
        '',
        '### Fixed',
        '',
        '- wrong total (1abcdef)',
        '',
        '### Changed',
        '',
        '- faster path (3abcdef)',
        '- **BREAKING** new save (4abcdef)',
        '',
      ].join('\n'),
    );
  });

  it('puts the newest release first, under the header', () => {
    const first = insertChangelog('', '## [0.2.0] - d\n');
    expect(first.startsWith(CHANGELOG_HEADER)).toBe(true);
    const second = insertChangelog(first, '## [0.3.0] - d\n');
    expect(second.indexOf('[0.3.0]')).toBeLessThan(second.indexOf('[0.2.0]'));
    expect(second.startsWith(CHANGELOG_HEADER)).toBe(true);
  });
});
