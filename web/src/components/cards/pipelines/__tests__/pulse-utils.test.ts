/**
 * Unit tests for pipeline pulse utility functions.
 *
 * Tests pure functions extracted from NightlyReleasePulse:
 * - formatCron: cron expression to human-readable string
 * - dotColor: conclusion → background color class
 * - dotTextColor: conclusion → text color class
 * - computeTrend: dot history → pass rate + trend direction
 * - mergeRepos: server repos + user config → visible repo list
 */
import { describe, expect, it } from 'vitest'
import {
  formatCron,
  dotColor,
  dotTextColor,
  computeTrend,
  mergeRepos,
  type DotInfo,
} from '../pulse-utils'

// ---------------------------------------------------------------------------
// formatCron
// ---------------------------------------------------------------------------

describe('formatCron', () => {
  it('returns em-dash for null/undefined/empty', () => {
    expect(formatCron(null)).toBe('—')
    expect(formatCron(undefined)).toBe('—')
    expect(formatCron('')).toBe('—')
  })

  it('returns raw cron for non-daily schedules', () => {
    // Every Monday at 3:00
    expect(formatCron('0 3 * * 1')).toBe('0 3 * * 1')
    // Every 15th at noon
    expect(formatCron('0 12 15 * *')).toBe('0 12 15 * *')
  })

  it('converts daily cron to localized time string', () => {
    // 30 14 * * * → 14:30 UTC daily (locale-dependent output)
    const result = formatCron('30 14 * * *')
    expect(result).toContain('daily')
    // Should contain some time representation
    expect(result.length).toBeGreaterThan(5)
  })

  it('handles midnight daily cron', () => {
    const result = formatCron('0 0 * * *')
    expect(result).toContain('daily')
  })

  it('returns raw cron for invalid minute/hour', () => {
    expect(formatCron('abc def * * *')).toBe('abc def * * *')
  })

  it('returns raw cron for wrong field count', () => {
    expect(formatCron('0 3 * *')).toBe('0 3 * *')
    expect(formatCron('0 3 * * * *')).toBe('0 3 * * * *')
  })

  it('handles extra whitespace in cron', () => {
    const result = formatCron('  30  14  *  *  *  ')
    expect(result).toContain('daily')
  })
})

// ---------------------------------------------------------------------------
// dotColor
// ---------------------------------------------------------------------------

describe('dotColor', () => {
  it('returns neutral color for null conclusion', () => {
    expect(dotColor(null)).toBe('bg-border/50')
  })

  it('returns green for success', () => {
    expect(dotColor('success')).toBe('bg-green-400')
  })

  it('returns red for failure variants', () => {
    expect(dotColor('failure')).toBe('bg-red-400')
    expect(dotColor('timed_out')).toBe('bg-red-400')
    expect(dotColor('startup_failure')).toBe('bg-red-400')
  })

  it('returns gray for cancelled', () => {
    expect(dotColor('cancelled')).toBe('bg-gray-500 dark:bg-gray-400')
  })

  it('returns yellow for action_required', () => {
    expect(dotColor('action_required')).toBe('bg-yellow-400')
  })

  it('returns yellow for unknown conclusions', () => {
    expect(dotColor('skipped')).toBe('bg-yellow-400')
    expect(dotColor('neutral')).toBe('bg-yellow-400')
    expect(dotColor('stale')).toBe('bg-yellow-400')
  })
})

// ---------------------------------------------------------------------------
// dotTextColor
// ---------------------------------------------------------------------------

describe('dotTextColor', () => {
  it('returns muted for null conclusion', () => {
    expect(dotTextColor(null)).toBe('text-muted-foreground')
  })

  it('returns green for success', () => {
    expect(dotTextColor('success')).toBe('text-green-400')
  })

  it('returns red for failure variants', () => {
    expect(dotTextColor('failure')).toBe('text-red-400')
    expect(dotTextColor('timed_out')).toBe('text-red-400')
    expect(dotTextColor('startup_failure')).toBe('text-red-400')
  })

  it('returns muted for all other conclusions', () => {
    expect(dotTextColor('cancelled')).toBe('text-muted-foreground')
    expect(dotTextColor('action_required')).toBe('text-muted-foreground')
    expect(dotTextColor('skipped')).toBe('text-muted-foreground')
    expect(dotTextColor('neutral')).toBe('text-muted-foreground')
  })
})

// ---------------------------------------------------------------------------
// computeTrend
// ---------------------------------------------------------------------------

function makeDot(conclusion: DotInfo['conclusion']): DotInfo {
  return { conclusion, htmlUrl: 'https://example.com', date: '2026-01-01' }
}

describe('computeTrend', () => {
  it('returns 0% and steady for empty array', () => {
    expect(computeTrend([])).toEqual({ passRate: 0, trend: 'steady' })
  })

  it('returns 0% and steady for all-null conclusions', () => {
    const dots = [makeDot(null), makeDot(null), makeDot(null)]
    expect(computeTrend(dots)).toEqual({ passRate: 0, trend: 'steady' })
  })

  it('returns 100% for all success', () => {
    const dots = Array.from({ length: 10 }, () => makeDot('success'))
    const result = computeTrend(dots)
    expect(result.passRate).toBe(100)
    expect(result.trend).toBe('steady')
  })

  it('returns 0% for all failures', () => {
    const dots = Array.from({ length: 10 }, () => makeDot('failure'))
    const result = computeTrend(dots)
    expect(result.passRate).toBe(0)
    expect(result.trend).toBe('steady')
  })

  it('detects upward trend (first half better)', () => {
    // First half: all success, second half: all failure
    const dots = [
      ...Array.from({ length: 5 }, () => makeDot('success')),
      ...Array.from({ length: 5 }, () => makeDot('failure')),
    ]
    const result = computeTrend(dots)
    expect(result.trend).toBe('up')
    expect(result.passRate).toBe(50)
  })

  it('detects downward trend (second half better)', () => {
    // First half: all failure, second half: all success
    const dots = [
      ...Array.from({ length: 5 }, () => makeDot('failure')),
      ...Array.from({ length: 5 }, () => makeDot('success')),
    ]
    const result = computeTrend(dots)
    expect(result.trend).toBe('down')
    expect(result.passRate).toBe(50)
  })

  it('returns steady when difference is within threshold', () => {
    // 6 success + 4 failure = slight difference but within threshold
    const dots = [
      makeDot('success'), makeDot('success'), makeDot('success'),
      makeDot('failure'), makeDot('failure'),
      makeDot('success'), makeDot('success'), makeDot('success'),
      makeDot('failure'), makeDot('failure'),
    ]
    const result = computeTrend(dots)
    expect(result.trend).toBe('steady')
  })

  it('ignores null conclusions in pass rate calculation', () => {
    const dots = [makeDot('success'), makeDot(null), makeDot('success')]
    const result = computeTrend(dots)
    expect(result.passRate).toBe(100)
  })

  it('handles single non-null dot', () => {
    const result = computeTrend([makeDot('success')])
    expect(result.passRate).toBe(100)
    expect(result.trend).toBe('steady')
  })
})

// ---------------------------------------------------------------------------
// mergeRepos
// ---------------------------------------------------------------------------

describe('mergeRepos', () => {
  it('returns server repos unchanged with empty config', () => {
    const result = mergeRepos(
      ['org/repo-a', 'org/repo-b'],
      { added: [], hidden: [] },
    )
    expect(result).toEqual(['org/repo-a', 'org/repo-b'])
  })

  it('hides server repos listed in config.hidden', () => {
    const result = mergeRepos(
      ['org/repo-a', 'org/repo-b', 'org/repo-c'],
      { added: [], hidden: ['org/repo-b'] },
    )
    expect(result).toEqual(['org/repo-a', 'org/repo-c'])
  })

  it('appends user-added repos after server repos', () => {
    const result = mergeRepos(
      ['org/repo-a'],
      { added: ['user/custom-repo'], hidden: [] },
    )
    expect(result).toEqual(['org/repo-a', 'user/custom-repo'])
  })

  it('does not duplicate repos already in server list', () => {
    const result = mergeRepos(
      ['org/repo-a', 'org/repo-b'],
      { added: ['org/repo-a'], hidden: [] },
    )
    expect(result).toEqual(['org/repo-a', 'org/repo-b'])
  })

  it('does not add user repos that are hidden', () => {
    const result = mergeRepos(
      ['org/repo-a'],
      { added: ['user/hidden-repo'], hidden: ['user/hidden-repo'] },
    )
    expect(result).toEqual(['org/repo-a'])
  })

  it('handles empty server repos with user-added repos', () => {
    const result = mergeRepos(
      [],
      { added: ['user/repo-x', 'user/repo-y'], hidden: [] },
    )
    expect(result).toEqual(['user/repo-x', 'user/repo-y'])
  })

  it('handles all repos hidden', () => {
    const result = mergeRepos(
      ['org/a', 'org/b'],
      { added: [], hidden: ['org/a', 'org/b'] },
    )
    expect(result).toEqual([])
  })

  it('handles both added and hidden with no server repos', () => {
    const result = mergeRepos(
      [],
      { added: ['user/visible', 'user/hidden'], hidden: ['user/hidden'] },
    )
    expect(result).toEqual(['user/visible'])
  })
})
