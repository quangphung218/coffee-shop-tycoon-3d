export type BumpLevel = 'major' | 'minor' | 'patch';

export interface Commit {
  hash: string;
  type: string;
  scope: string | null;
  breaking: boolean;
  summary: string;
}

export const CHANGELOG_GROUPS: readonly { title: string; has(commit: Commit): boolean }[];
export const CHANGELOG_HEADER: string;
export function parseCommit(message: string, hash?: string): Commit | null;
export function commitLevel(commit: Commit | null): BumpLevel | null;
export function bumpLevel(commits: readonly (Commit | null)[]): BumpLevel | null;
export function nextVersion(current: string, commits: readonly (Commit | null)[]): string;
export function changelogSection(version: string, date: string, commits: readonly (Commit | null)[]): string;
export function insertChangelog(existing: string, section: string): string;
