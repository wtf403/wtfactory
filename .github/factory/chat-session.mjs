#!/usr/bin/env node
/**
 * factory chat-session controller
 *
 * One in-work pull request == one live agent chat.
 *
 * This is the executor's edge, and it runs on the runner:
 *   1. resolve the work item (explicit number, else dispatcher input),
 *   2. claim it exactly once (no two controllers per delivery),
 *   3. name a deterministic chat thread for the PR,
 *   4. collect steering comments left by humans on that thread,
 *   5. dispatch the agentic workflow that runs the harness session.
 *
 * The board is the control plane. The agentic workflow (factory.md) is the
 * phase engine and carries the harness (codex or claude) in its engine block.
 * This controller only decides *whether* and *for which thread* a session runs.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

export const STEER_PREFIX = 'factory-steer:';
export const CLAIM_PREFIX = '<!-- factory-session:';
export const PHASES = ['Analytics', 'InProgress', 'Test', 'Review'];
export const STATUSES = ['TODO', 'Analytics', 'InProgress', 'Test', 'Review', 'Completed'];
export const SESSION_WORKFLOW = 'factory.lock.yml';
/** A held claim older than this no longer blocks a fresh run. */
export const CLAIM_TTL_MS = 6 * 60 * 60 * 1000;

/** Deterministic, CLI- and filesystem-safe chat thread name for a PR. */
export function threadName(repo, number, harness) {
  const slug = String(repo || '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `factory-${slug}-${number}-${harness}`;
}

/**
 * Stable identity for one delivery step. Scoped by phase as well as head, so a
 * later phase (InProgress -> Review) is not blocked by an earlier claim, while
 * a second controller for the same phase and head still is.
 */
export function claimKey({ repo, number, headSha, harness, phase }) {
  return `${repo}#${number}@${headSha || 'no-head'}:${harness}:${phase || 'any'}`;
}

/**
 * Parse steering instructions out of a comment body. Quoted lines ("> ...")
 * are ignored so a reply that quotes instructions does not re-trigger them.
 */
export function parseSteer(body) {
  const out = [];
  for (const raw of String(body || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('>')) continue;
    const stripped = line.replace(/^[-*]\s*/, '');
    const m = new RegExp(`^${STEER_PREFIX}\\s*(.+)$`, 'i').exec(stripped);
    if (m && m[1].trim()) out.push(m[1].trim());
  }
  return out;
}

export function claimComment(claim) {
  return `${CLAIM_PREFIX}${claim} -->\nClaimed ${claim}`;
}

export function readClaim(bodies) {
  for (const b of bodies || []) {
    const m = new RegExp(`${CLAIM_PREFIX}([^>]*?)-->`).exec(String(b || ''));
    if (m) return m[1].trim();
  }
  return null;
}

/** Newest claim across a comment list, with its timestamp. */
export function readClaims(comments) {
  let latest = null;
  for (const c of comments || []) {
    const m = new RegExp(`${CLAIM_PREFIX}([^>]*?)-->`).exec(String((c && c.body) || ''));
    if (!m) continue;
    const at = String((c && (c.created_at || c.createdAt)) || '');
    if (!latest || at > latest.at) latest = { key: m[1].trim(), at };
  }
  return latest;
}

/** Pure policy: should this run act? */
export function decideClaim({ status, currentKey, heldKey, liveRun, heldAgeMs = 0, ttlMs = CLAIM_TTL_MS }) {
  if (!status) return { act: false, reason: 'no board status resolved' };
  if (status === 'TODO' || status === 'Completed') {
    return { act: false, reason: `status ${status} is not actionable` };
  }
  if (!PHASES.includes(status)) return { act: false, reason: `unknown phase ${status}` };
  if (liveRun) return { act: false, reason: 'a live run already owns this delivery' };
  if (heldKey && heldKey === currentKey) {
    if (heldAgeMs < ttlMs) return { act: false, reason: 'claim already held for this head' };
    return { act: true, reason: 'stale claim expired, re-claiming' };
  }
  return { act: true, reason: `run ${status}` };
}

/** Which board item a scan should pick, and in what order. */
export function pickScanItem(items) {
  for (const want of ['InProgress', 'Test', 'Review', 'Analytics']) {
    const hit = (items || []).find((i) => i && i.status === want);
    if (hit) return hit;
  }
  return null;
}

/**
 * Does an in-progress workflow run belong to this work item?
 *
 * Runs do not carry the issue number as a first-class field, so match the
 * number the dispatcher puts in the run title/URL. Anything we cannot tie to
 * this item must not block it: a repo-wide "any run is live" gate would let one
 * busy issue starve every other issue.
 */
export function runBelongsToItem(run, number) {
  if (!run) return false;
  const n = String(number === undefined || number === null ? '' : number).trim();
  if (!/^[0-9]+$/.test(n)) return false;
  const hay = [run.displayTitle, run.name, run.url].filter(Boolean).join(' ');
  if (new RegExp('#\\s*' + n + '(?![0-9])').test(hay)) return true;
  if (new RegExp('issue_number=' + n + '(?![0-9])').test(hay)) return true;
  return new RegExp('(^|\\s)' + n + '($|\\s)').test(String(run.displayTitle || ''));
}

/** gh argv that dispatches the agentic workflow for one work item. */
export function dispatchArgs({ repo, number, workflow = SESSION_WORKFLOW }) {
  return ['workflow', 'run', workflow, '--repo', repo, '-f', `issue_number=${number}`];
}

/**
 * Workflow dispatch only resolves workflows that exist on the default branch,
 * which is the single most common first-run failure: the installer's setup PR
 * has not been merged yet.
 */
export function classifyDispatchError(text) {
  const s = String(text || '');
  if (/not found on the default branch/i.test(s) || /HTTP 404/i.test(s)) return 'not-on-default-branch';
  return 'other';
}

export function dispatchRemedy(kind) {
  if (kind === 'not-on-default-branch') {
    return 'The agentic workflow is not on the default branch yet. Merge the factory/setup pull request, then dispatch again.';
  }
  return 'Dispatch failed. Check the workflow name and that Actions is enabled for this repository.';
}

/** The phase prompt handed to the harness, built from the board state. */
export function phasePrompt({ repo, number, status, steer }) {
  const lines = [
    `You are the factory agent for ${repo}.`,
    `Work item: #${number}. Board phase: ${status}.`,
    'Run exactly this one phase, then record evidence on the issue or pull request.',
  ];
  if (steer && steer.length) {
    lines.push('Human steering instructions, most recent last:');
    for (const s of steer) lines.push(`- ${s}`);
  }
  return lines.join('\n');
}

/**
 * Job-summary markdown for one session run. This is what makes the remote run
 * show up as the pull request's live chat: the thread name, the phase, the
 * decision, and the steering still in force.
 */
export function summaryMarkdown({ repo, number, harness, thread, status, decision, steer, runUrl }) {
  const lines = [
    '### factory chat session',
    '',
    `- Work item: \`${repo}#${number}\``,
    `- Chat thread: \`${thread}\``,
    `- Harness: \`${harness}\``,
    `- Board phase: \`${status || 'unknown'}\``,
    `- Decision: ${decision && decision.act ? 'run' : 'skip'} (${(decision && decision.reason) || 'n/a'})`,
  ];
  if (runUrl) lines.push(`- Run: ${runUrl}`);
  if (steer && steer.length) {
    lines.push('', 'Steering in force:');
    for (const s of steer) lines.push(`- ${s}`);
  }
  return lines.join('\n');
}

export function writeSummary(markdown) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return false;
  try {
    appendFileSync(file, markdown + '\n');
    return true;
  } catch { return false; }
}

export function ghJson(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'gh failed').trim().slice(0, 2000));
  return JSON.parse(r.stdout || 'null');
}

export function ghRun(args, input) {
  return spawnSync('gh', args, { encoding: 'utf8', input });
}

function main() {
  const argv = process.argv.slice(2);
  const has = (f) => argv.includes(f);
  const env = process.env;
  const harness = env.FACTORY_HARNESS || 'codex';
  const model = env.FACTORY_MODEL || '';
  const repo = env.GITHUB_REPOSITORY || '';
  const number = env.FACTORY_NUMBER || env.FACTORY_ISSUE || '';
  const status = env.FACTORY_STATUS || '';
  let headSha = env.FACTORY_HEAD_SHA || '';
  const thread = threadName(repo, number, harness);
  const key = claimKey({ repo, number, headSha, harness, phase: status });

  if (has('--print-thread')) {
    console.log(thread);
    return;
  }
  if (has('--dry-run') || !number) {
    console.log(JSON.stringify({ repo, number, harness, model, thread, claimKey: key, status, dryRun: true }, null, 2));
    return;
  }
  if (!repo) throw new Error('GITHUB_REPOSITORY is required');

  const comments = ghJson(['api', `repos/${repo}/issues/${number}/comments`, '--paginate']) || [];
  const bodies = comments.map((c) => c.body);
  const steer = bodies.flatMap(parseSteer);

  // Resolve the delivery head from the task branch's pull request, when one
  // exists, so a new push re-arms the claim instead of blocking forever.
  if (!headSha) {
    try {
      const prs = ghJson(['pr', 'list', '--repo', repo, '--head', 'task-' + number, '--state', 'all', '--json', 'headRefOid']) || [];
      if (prs[0] && prs[0].headRefOid) headSha = prs[0].headRefOid;
    } catch { /* no pull request yet */ }
  }
  const currentKey = claimKey({ repo, number, headSha, harness, phase: status });
  const held = readClaims(comments);
  const heldAgeMs = held && held.at ? Math.max(0, Date.now() - Date.parse(held.at)) : 0;

  let liveRun = false;
  try {
    // Only a run for *this* item blocks it. Per-item serialization is also
    // enforced by the workflow's own concurrency group.
    const runs = ghJson(['run', 'list', '--repo', repo, '--workflow', SESSION_WORKFLOW, '--status', 'in_progress', '--json', 'databaseId,name,displayTitle,url']) || [];
    liveRun = runs.some((r) => runBelongsToItem(r, number));
  } catch { /* no runs yet */ }

  const decision = decideClaim({ status, currentKey, heldKey: held && held.key, liveRun, heldAgeMs });
  console.log(JSON.stringify({ thread, decision, steerCount: steer.length }, null, 2));
  if (!decision.act) return;

  ghRun(['issue', 'comment', String(number), '--repo', repo, '--body', claimComment(key)]);
  const args = dispatchArgs({ repo, number, workflow: env.FACTORY_WORKFLOW || SESSION_WORKFLOW });
  console.log(`dispatch: gh ${args.join(' ')}`);
  writeSummary(summaryMarkdown({
    repo, number, harness, thread, status, decision, steer,
    runUrl: `${env.GITHUB_SERVER_URL || 'https://github.com'}/${repo}/actions`,
  }));
  if (has('--dispatch')) {
    const r = ghRun(args);
    if (r.status !== 0) {
      const text = (r.stderr || r.stdout || 'dispatch failed').trim();
      const kind = classifyDispatchError(text);
      // Leave the remedy where a human will actually see it.
      ghRun(['issue', 'comment', String(number), '--repo', repo, '--body', dispatchRemedy(kind)]);
      throw new Error(kind + ': ' + dispatchRemedy(kind));
    }
  }
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (invokedDirectly) {
  try { main(); } catch (e) { console.error(e.message); process.exit(1); }
}

