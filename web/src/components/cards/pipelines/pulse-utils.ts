/**
 * Pure utility functions for NightlyReleasePulse card.
 * Extracted for testability and reuse.
 */
import type { Conclusion } from '../../../hooks/useGitHubPipelines'

/** Minimum pass-rate delta to flag a trend */
export const TREND_THRESHOLD = 0.1

/** Standard cron field count (minute hour day month weekday) */
const STANDARD_CRON_FIELD_COUNT = 5

export interface DotInfo {
  conclusion: Conclusion
  htmlUrl: string
  date: string
}

/**
 * Convert a cron expression to a human-readable schedule string.
 * Only handles daily crons (hour + minute with wildcards for day/month/weekday).
 * Returns the raw cron string for anything more complex.
 */
export function formatCron(cron: string | undefined | null): string {
  if (!cron || typeof cron !== 'string') return '—'
  const parts = cron.trim().split(/\s+/)
  if (parts.length === STANDARD_CRON_FIELD_COUNT && parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
    const minute = parseInt(parts[0], 10)
    const hourUtc = parseInt(parts[1], 10)
    if (!isNaN(minute) && !isNaN(hourUtc)) {
      const now = new Date()
      const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, minute))
      return `${utc.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} daily`
    }
  }
  return cron
}

/** Returns the Tailwind background color class for a workflow run conclusion. */
export function dotColor(c: Conclusion): string {
  if (!c) return 'bg-border/50'
  if (c === 'success') return 'bg-green-400'
  if (c === 'failure' || c === 'timed_out' || c === 'startup_failure') return 'bg-red-400'
  if (c === 'cancelled') return 'bg-gray-500 dark:bg-gray-400'
  if (c === 'action_required') return 'bg-yellow-400'
  return 'bg-yellow-400'
}

/** Returns the Tailwind text color class for a workflow run conclusion. */
export function dotTextColor(c: Conclusion): string {
  if (!c) return 'text-muted-foreground'
  if (c === 'success') return 'text-green-400'
  if (c === 'failure' || c === 'timed_out' || c === 'startup_failure') return 'text-red-400'
  return 'text-muted-foreground'
}

/**
 * Compute the pass rate and trend direction from a set of run dots.
 * Splits the array in half: if the first half has a significantly higher
 * pass rate than the second half, trend is 'up' (improving); if lower, 'down'.
 */
export function computeTrend(cells: DotInfo[]): { passRate: number; trend: 'up' | 'down' | 'steady' } {
  const with_ = cells.filter((c) => c.conclusion !== null)
  if (with_.length === 0) return { passRate: 0, trend: 'steady' }
  const successes = with_.filter((c) => c.conclusion === 'success').length
  const rate = Math.round((successes / with_.length) * 100)
  const mid = Math.floor(with_.length / 2)
  const first = with_.slice(0, mid)
  const second = with_.slice(mid)
  // Need dots on both sides to compare halves; otherwise there's no trend.
  if (first.length === 0 || second.length === 0) {
    return { passRate: rate, trend: 'steady' }
  }
  const fr = first.filter((c) => c.conclusion === 'success').length / first.length
  const sr = second.filter((c) => c.conclusion === 'success').length / second.length
  const t: 'up' | 'down' | 'steady' =
    fr > sr + TREND_THRESHOLD ? 'up' : fr < sr - TREND_THRESHOLD ? 'down' : 'steady'
  return { passRate: rate, trend: t }
}

/**
 * Merge server-default repos with user config (added/hidden) into a visible list.
 * Used by PipelineFilterContext to compute the effective repo list.
 */
export function mergeRepos(
  serverRepos: string[],
  config: { added: string[]; hidden: string[] },
): string[] {
  const hidden = new Set(config.hidden)
  const visible = serverRepos.filter((r) => !hidden.has(r))
  const serverSet = new Set(serverRepos)
  for (const r of config.added) {
    if (!serverSet.has(r) && !hidden.has(r)) {
      visible.push(r)
    }
  }
  return visible
}
