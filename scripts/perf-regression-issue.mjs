#!/usr/bin/env node
/**
 * perf-regression-issue.mjs
 *
 * Shared "the perf budget was blown, file/update an issue" notifier used by
 * every perf workflow. The workflow drops a JSON result file at the path
 * given in PERF_RESULT_JSON, then calls this script. We:
 *
 *   1. Read the JSON result.
 *   2. Look for an existing open issue whose title starts with
 *      "[perf-regression] <signal>".
 *   3. If found, append a comment with the new numbers. Otherwise, file a
 *      fresh issue with the standard labels.
 *
 * The body always includes: value vs budget, the run URL, the head SHA, and
 * (when both SHAs are known) the list of merges between last-successful and
 * current HEAD — that's the blame window.
 *
 * This script NEVER fails the build. The workflow that called it has already
 * decided to fail; our job is to notify, not re-litigate.
 */

import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { buildBody, MAX_MERGE_LOG_LINES } from './lib/perf-regression-helpers.mjs'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ISSUE_TITLE_PREFIX = '[perf-regression]'
const ISSUE_LABELS = ['kind/bug', 'priority/high', 'triage/accepted', 'perf-regression']
// MAX_MERGE_LOG_LINES lives with buildMergeLog in scripts/lib/
// perf-regression-helpers.mjs; re-exported here as a no-op reference
// so callers grepping for the constant still find it in this file.
void MAX_MERGE_LOG_LINES
// Exit code we always return. Non-zero would mask the workflow's own failure.
const EXIT_OK = 0

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function showHelpAndExit() {
  process.stdout.write(
    [
      'Usage: node scripts/perf-regression-issue.mjs',
      '',
      'Reads PERF_RESULT_JSON (path to a perf result JSON file) and files or',
      'updates a GitHub issue tagged "[perf-regression] <signal>".',
      '',
      'Required env:',
      '  PERF_RESULT_JSON   path to the JSON result file written by the workflow',
      '',
      'Optional env:',
      '  GH_REPO            override gh --repo (defaults to the current repo)',
      '',
      'Always exits 0.',
      '',
    ].join('\n'),
  )
  process.exit(EXIT_OK)
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelpAndExit()
}

// Fallback exit code when spawnSync cannot launch the binary at all
// (e.g. `gh` not on PATH). We MUST NOT default to 0 here — that would make
// a missing binary look like success and the script would "succeed"
// without filing anything. See #6170.
const SH_SPAWN_FAILURE_CODE = 1

function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts })
  if (res.error) {
    // spawnSync sets `error` and leaves `status === null` when the binary
    // cannot be spawned. Surface that as a non-zero exit code so callers
    // take the failure branch instead of treating it as success.
    log(`failed to spawn ${cmd}: ${res.error.message}`)
    return { stdout: '', stderr: res.error.message, code: SH_SPAWN_FAILURE_CODE }
  }
  return {
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
    code: res.status ?? SH_SPAWN_FAILURE_CODE,
  }
}

function log(msg) {
  process.stdout.write(`[perf-regression-issue] ${msg}\n`)
}

function readResult(resultPath) {
  if (!existsSync(resultPath)) {
    log(`PERF_RESULT_JSON=${resultPath} not found; nothing to do.`)
    process.exit(EXIT_OK)
  }
  try {
    const raw = readFileSync(resultPath, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    log(`Failed to parse ${resultPath}: ${err?.message || err}`)
    process.exit(EXIT_OK)
  }
}

function buildMergeLogFromGit(lastSuccessfulSha, headSha) {
  if (!lastSuccessfulSha || !headSha) return null
  const range = `${lastSuccessfulSha}..${headSha}`
  // `--merges` filters to merge commits only — matches the "Merges since last
  // successful run" header below and keeps the bisect window narrow enough to
  // be actionable. Without this flag we'd dump every commit in the range.
  // See #6170.
  return sh('git', ['log', '--merges', range, '--format=- %h %s'])
}

function buildBodyLocal(result) {
  return buildBody(result, (range) =>
    sh('git', ['log', '--merges', range, '--format=- %h %s'])
  )
}
void buildMergeLogFromGit

function findExistingIssue(signal, repoFlag) {
  // gh issue list --search uses GitHub search syntax; the literal title prefix
  // must be quoted so the hyphen/brackets don't get interpreted.
  const titleNeedle = `${ISSUE_TITLE_PREFIX} ${signal}`
  const args = [
    'issue',
    'list',
    '--state',
    'open',
    '--search',
    `"${titleNeedle}" in:title`,
    '--json',
    'number,title',
    '--limit',
    '20',
  ]
  if (repoFlag) args.push('--repo', repoFlag)
  const { stdout, code, stderr } = sh('gh', args)
  if (code !== 0) {
    log(`gh issue list failed: ${stderr}`)
    return null
  }
  try {
    const items = JSON.parse(stdout || '[]')
    const match = items.find((i) => typeof i.title === 'string' && i.title.startsWith(titleNeedle))
    return match ? match.number : null
  } catch (err) {
    log(`Failed to parse gh issue list output: ${err?.message || err}`)
    return null
  }
}

function commentIssue(number, body, repoFlag) {
  const args = ['issue', 'comment', String(number), '--body', body]
  if (repoFlag) args.push('--repo', repoFlag)
  const { code, stderr } = sh('gh', args)
  if (code !== 0) log(`gh issue comment failed: ${stderr}`)
  else log(`Commented on issue #${number}`)
}

function createIssue(signal, displayName, body, repoFlag) {
  const title = `${ISSUE_TITLE_PREFIX} ${signal}: ${displayName}`
  const args = [
    'issue',
    'create',
    '--title',
    title,
    '--body',
    body,
    '--label',
    ISSUE_LABELS.join(','),
  ]
  if (repoFlag) args.push('--repo', repoFlag)
  const { stdout, code, stderr } = sh('gh', args)
  if (code !== 0) log(`gh issue create failed: ${stderr}`)
  else log(`Created issue: ${stdout}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const resultPath = process.env.PERF_RESULT_JSON
  if (!resultPath) {
    log('PERF_RESULT_JSON not set; nothing to do.')
    process.exit(EXIT_OK)
  }

  const result = readResult(resultPath)
  if (!result || !result.signal || !result.displayName) {
    log('Result JSON missing required fields (signal, displayName); skipping.')
    process.exit(EXIT_OK)
  }

  const repoFlag = process.env.GH_REPO || ''
  const body = buildBodyLocal(result)
  const existing = findExistingIssue(result.signal, repoFlag)
  if (existing) {
    commentIssue(existing, body, repoFlag)
  } else {
    createIssue(result.signal, result.displayName, body, repoFlag)
  }
  process.exit(EXIT_OK)
}

main()
