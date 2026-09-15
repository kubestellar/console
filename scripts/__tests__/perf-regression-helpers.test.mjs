// @vitest-environment node
/**
 * Unit tests for scripts/lib/perf-regression-helpers.mjs
 *
 * Covers the two pure helpers extracted from
 * scripts/perf-regression-issue.mjs so that the notifier's
 * externally-visible contract — the Markdown body layout and the
 * merge-window truncation math — is regression-tested. Before this
 * file, scripts/perf-regression-issue.mjs had zero tests.
 */
import { describe, expect, it } from 'vitest'
import {
  buildBody,
  buildMergeLog,
  MAX_MERGE_LOG_LINES,
} from '../lib/perf-regression-helpers.mjs'

// A stub gitLog runner: returns whatever the caller has scripted for
// the (single) range it expects. Also records invocations for assertion.
function scriptedGit(response) {
  const calls = []
  const fn = (range) => {
    calls.push(range)
    return response
  }
  fn.calls = calls
  return fn
}

// ── buildMergeLog ───────────────────────────────────────────────────────────

describe('buildMergeLog', () => {
  it('returns null when lastSuccessfulSha is missing', () => {
    const git = scriptedGit({ stdout: 'unused', code: 0 })
    expect(buildMergeLog(null, 'deadbeef', git)).toBeNull()
    expect(git.calls).toEqual([])
  })

  it('returns null when headSha is missing', () => {
    const git = scriptedGit({ stdout: 'unused', code: 0 })
    expect(buildMergeLog('cafebabe', undefined, git)).toBeNull()
    expect(git.calls).toEqual([])
  })

  it('returns null when gitLog exits non-zero', () => {
    const git = scriptedGit({ stdout: '', code: 128 })
    expect(buildMergeLog('a', 'b', git)).toBeNull()
    expect(git.calls).toEqual(['a..b'])
  })

  it('returns null on empty stdout even when exit code is 0', () => {
    const git = scriptedGit({ stdout: '', code: 0 })
    expect(buildMergeLog('a', 'b', git)).toBeNull()
  })

  it('returns null when the stdout is only blank lines (no useful window)', () => {
    // "\n\n" splits to ['', '', ''], all falsy after filter → 0 lines → null.
    const git = scriptedGit({ stdout: '\n\n', code: 0 })
    expect(buildMergeLog('a', 'b', git)).toBeNull()
  })

  it('joins non-empty lines verbatim when within MAX_MERGE_LOG_LINES', () => {
    const stdout = ['- abc1 first', '- def2 second', '- ghi3 third'].join('\n')
    const git = scriptedGit({ stdout, code: 0 })
    expect(buildMergeLog('a', 'b', git)).toBe(stdout)
  })

  it('truncates when the merge count exceeds MAX_MERGE_LOG_LINES', () => {
    const overshoot = 7 // arbitrary; assertion computes the "N more" tail.
    const total = MAX_MERGE_LOG_LINES + overshoot
    const stdoutLines = Array.from({ length: total }, (_, i) => `- sha${i} msg${i}`)
    const git = scriptedGit({ stdout: stdoutLines.join('\n'), code: 0 })
    const out = buildMergeLog('a', 'b', git)
    // Kept lines: exactly MAX_MERGE_LOG_LINES of them.
    const kept = out.split('\n').filter(l => l.startsWith('- sha'))
    expect(kept).toHaveLength(MAX_MERGE_LOG_LINES)
    // Truncation tail must name the exact overshoot count.
    expect(out).toContain(`- ... (${overshoot} more commits truncated)`)
  })

  it('does NOT append the truncation tail at exactly MAX_MERGE_LOG_LINES (boundary)', () => {
    const stdoutLines = Array.from(
      { length: MAX_MERGE_LOG_LINES },
      (_, i) => `- sha${i} msg${i}`
    )
    const git = scriptedGit({ stdout: stdoutLines.join('\n'), code: 0 })
    const out = buildMergeLog('a', 'b', git)
    expect(out).toBe(stdoutLines.join('\n'))
    expect(out).not.toContain('more commits truncated')
  })
})

// ── buildBody ───────────────────────────────────────────────────────────────

const RESULT_BASE = {
  signal: 'lcp-p95',
  displayName: 'LCP p95',
  value: 4200,
  budget: 3000,
  unit: 'ms',
  context: {
    runUrl: 'https://github.com/kubestellar/console/actions/runs/1',
    headSha: 'deadbeefcafebabe1234567890abcdef00000000',
    navigatedTo: '/wds',
    lastSuccessfulSha: '1234567890abcdef1234567890abcdef11111111',
  },
}

describe('buildBody', () => {
  it('emits header, signal, delta computation, and standard anchors', () => {
    const git = scriptedGit({ stdout: '', code: 0 }) // no merges → no window section
    const body = buildBody({ ...RESULT_BASE, context: {} }, git)
    expect(body).toContain('## LCP p95 regressed')
    expect(body).toContain('**Signal:** `lcp-p95`')
    expect(body).toContain('**Measured:** 4200 ms')
    expect(body).toContain('**Budget:** 3000 ms')
    // Delta = value - budget, matching the on-call ergonomics of the script.
    expect(body).toContain('**Delta:** 1200 ms over budget')
    expect(body).toContain(
      '_Auto-filed by `scripts/perf-regression-issue.mjs`. Dedupes on title prefix._'
    )
  })

  it('prefers runUrl over runId when both are present', () => {
    const git = scriptedGit({ stdout: '', code: 0 })
    const body = buildBody(
      { ...RESULT_BASE, context: { runUrl: 'https://ex.example/1', runId: 'X' } },
      git
    )
    expect(body).toContain('**Run:** https://ex.example/1')
    expect(body).not.toContain('**Run ID:**')
  })

  it('falls back to runId when runUrl is absent', () => {
    const git = scriptedGit({ stdout: '', code: 0 })
    const body = buildBody(
      { ...RESULT_BASE, context: { runId: 'run-9' } },
      git
    )
    expect(body).toContain('**Run ID:** run-9')
    expect(body).not.toContain('**Run:**')
  })

  it('omits headSha / navigatedTo lines when their context fields are missing', () => {
    const git = scriptedGit({ stdout: '', code: 0 })
    const body = buildBody(
      { ...RESULT_BASE, context: {} },
      git
    )
    expect(body).not.toContain('**Head SHA:**')
    expect(body).not.toContain('**Navigated to:**')
  })

  it('appends the "Merges since last successful run" section only when the git window is non-empty', () => {
    const git = scriptedGit({
      stdout: ['- abcdef1 M1', '- fedcba2 M2'].join('\n'),
      code: 0,
    })
    const body = buildBody(RESULT_BASE, git)
    // Header slices both SHAs to 7 chars.
    expect(body).toContain(
      '### Merges since last successful run (`1234567..deadbee`)'
    )
    expect(body).toContain('- abcdef1 M1')
    expect(body).toContain('- fedcba2 M2')
  })

  it('omits the window section when gitLog reports no merges', () => {
    const git = scriptedGit({ stdout: '', code: 0 })
    const body = buildBody(RESULT_BASE, git)
    expect(body).not.toContain('Merges since last successful run')
  })
})
