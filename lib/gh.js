import { spawnSync, execSync } from 'node:child_process';

export function have(cmd) {
  const probe = process.platform === 'win32'
    ? spawnSync('where', [cmd], { stdio: 'ignore' })
    : spawnSync('/bin/sh', ['-c', 'command -v "$1"', '-', cmd], { stdio: 'ignore' });
  return probe.status === 0;
}

export function ghAuthOk() {
  return spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' }).status === 0;
}

export function ghToken() {
  try {
    return execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
}

export function gh(args, { input, env } = {}) {
  const r = spawnSync('gh', args, {
    encoding: 'utf8',
    input,
    env: { ...process.env, ...env },
  });
  return r;
}

export function ghJson(args) {
  const r = gh(args);
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'gh failed').trim().slice(0, 2000));
  return JSON.parse(r.stdout || 'null');
}

export function ghAwExtOk() {
  return spawnSync('gh', ['aw', '--version'], { stdio: 'ignore' }).status === 0;
}

export function repoExists(slug) {
  return spawnSync('gh', ['repo', 'view', slug, '--json', 'name'], { stdio: 'ignore' }).status === 0;
}

export function defaultBranch(slug) {
  const name = ghJson(['repo', 'view', slug, '--json', 'defaultBranchRef']).defaultBranchRef?.name;
  if (!name) throw new Error('Repository has no default branch');
  return name;
}
