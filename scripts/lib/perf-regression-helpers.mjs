/**
 * Pure helper functions for scripts/perf-regression-issue.mjs.
 * No side-effects, no fs, no child_process — safe to import in tests.
 *
 * `buildBody` builds the GitHub issue Markdown body from a parsed perf
 * result JSON. `buildMergeLog` formats a merge-window commit list; both
 * are the pieces the auto-filed issue's freshness and readability depend
 * on, and both were unit-uncovered before this file existed.
 *
 * Related: coverage gap for scripts/perf-regression-issue.mjs (no tests).
 */

// Upper bound on merge-window lines in the issue body. More than this
// and the issue body gets noisy and less actionable. Kept in sync with
// scripts/perf-regression-issue.mjs — that file re-exports this constant.
export const MAX_MERGE_LOG_LINES = 50

/**
 * Format the "Merges since last successful run" section body.
 *
 * `gitLog` is an injectable callable: `(range) => { stdout, code }`.
 * The default (in perf-regression-issue.mjs) runs `git log --merges
 * <range> --format='- %h %s'` via child_process. Tests inject a stub.
 *
 * Returns null when there is no useful window to render (missing SHAs,
 * `git log` fails, or the range is empty). Callers omit the section
 * when this returns null.
 *
 * @param {string|undefined|null} lastSuccessfulSha
 * @param {string|undefined|null} headSha
 * @param {(range: string) => { stdout: string, code: number }} gitLog
 * @returns {string|null}
 */
export function buildMergeLog(lastSuccessfulSha, headSha, gitLog) {
  if (!lastSuccessfulSha || !headSha) return null
  const range = `${lastSuccessfulSha}..${headSha}`
  const { stdout, code } = gitLog(range)
  if (code !== 0 || !stdout) return null
  const lines = stdout.split('\n').filter(Boolean)
  if (lines.length === 0) return null
  const truncated = lines.length > MAX_MERGE_LOG_LINES
  const shown = lines.slice(0, MAX_MERGE_LOG_LINES).join('\n')
  return truncated
    ? `${shown}\n- ... (${lines.length - MAX_MERGE_LOG_LINES} more commits truncated)`
    : shown
}

/**
 * Build the Markdown body for a perf-regression issue from a parsed
 * perf result JSON. `gitLog` is passed through to `buildMergeLog` so
 * tests can drive both the "no window" and "window present" branches
 * deterministically without touching a real git repo.
 *
 * The exact string shape is asserted by the tests — it is the
 * externally-visible contract of the notifier: humans and automation
 * downstream scan for "Signal: " / "Measured: " / "Merges since last
 * successful run" as anchors.
 *
 * @param {object} result - parsed perf result JSON
 * @param {(range: string) => { stdout: string, code: number }} gitLog
 * @returns {string}
 */
export function buildBody(result, gitLog) {
  const { signal, displayName, value, budget, unit, context = {} } = result
  const lines = []
  lines.push(`## ${displayName} regressed`)
  lines.push('')
  lines.push(`**Signal:** \`${signal}\``)
  lines.push(`**Measured:** ${value} ${unit}`)
  lines.push(`**Budget:** ${budget} ${unit}`)
  lines.push(`**Delta:** ${value - budget} ${unit} over budget`)
  lines.push('')
  if (context.runUrl) {
    lines.push(`**Run:** ${context.runUrl}`)
  } else if (context.runId) {
    lines.push(`**Run ID:** ${context.runId}`)
  }
  if (context.headSha) {
    lines.push(`**Head SHA:** \`${context.headSha}\``)
  }
  if (context.navigatedTo) {
    lines.push(`**Navigated to:** \`${context.navigatedTo}\``)
  }
  lines.push('')

  const mergeLog = buildMergeLog(context.lastSuccessfulSha, context.headSha, gitLog)
  if (mergeLog) {
    lines.push(
      `### Merges since last successful run (\`${String(context.lastSuccessfulSha).slice(0, 7)}..${String(context.headSha).slice(0, 7)}\`)`
    )
    lines.push('')
    lines.push(mergeLog)
    lines.push('')
  }

  lines.push('---')
  lines.push('_Auto-filed by `scripts/perf-regression-issue.mjs`. Dedupes on title prefix._')
  return lines.join('\n')
}
