/**
 * Unit tests for stellar/lib/derive.ts — Stellar AI solver status derivation.
 *
 * Covers: __testables (describePhase, workloadFromPodName), countSolveAttempts,
 * getSolveStatus, getWatchAttemptSummary, severityColor, deriveShortReason,
 * deriveTags, countRelated, deriveImportance, importanceColor, deriveWatchTrend,
 * trendIcon, renderSparkline, trendColor.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  __testables,
  countSolveAttempts,
  getSolveStatus,
  getWatchAttemptSummary,
  severityColor,
  deriveShortReason,
  deriveTags,
  countRelated,
  deriveImportance,
  importanceColor,
  deriveWatchTrend,
  trendIcon,
  renderSparkline,
  trendColor,
} from '../derive'
import type { StellarNotification, StellarSolve, StellarWatch } from '../../../../types/stellar'

const { describePhase, workloadFromPodName } = __testables

afterEach(() => { vi.restoreAllMocks() })

// ---------------------------------------------------------------------------
// __testables: describePhase
// ---------------------------------------------------------------------------

describe('describePhase', () => {
  it('maps investigating to 20%', () => {
    const r = describePhase('investigating', '')
    expect(r.phase).toBe('investigating')
    expect(r.percent).toBe(20)
  })

  it('maps solving to 75%', () => {
    expect(describePhase('solving', '').percent).toBe(75)
    expect(describePhase('acting', '').phase).toBe('solving')
  })

  it('maps resolved to 100%', () => {
    const r = describePhase('resolved', '')
    expect(r.percent).toBe(100)
    expect(r.phase).toBe('resolved')
  })

  it('maps escalated to warning color', () => {
    expect(describePhase('escalated', '').color).toBe('var(--s-warning)')
  })

  it('uses message in label when provided', () => {
    expect(describePhase('investigating', 'Reading logs').label).toContain('Reading logs')
  })

  it('handles unknown phase gracefully', () => {
    const r = describePhase('something-new', 'custom msg')
    expect(r.phase).toBe('unknown')
    expect(r.percent).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// __testables: workloadFromPodName
// ---------------------------------------------------------------------------

describe('workloadFromPodName', () => {
  it('strips ReplicaSet hash and pod suffix', () => {
    expect(workloadFromPodName('api-server-7f8b9d-xk4mn')).toBe('api-server')
  })

  it('returns original when fewer than 3 parts', () => {
    expect(workloadFromPodName('simple')).toBe('simple')
    expect(workloadFromPodName('two-parts')).toBe('two-parts')
  })

  it('handles complex deployment names', () => {
    expect(workloadFromPodName('my-app-frontend-6d8f4b-abc12')).toBe('my-app-frontend')
  })

  it('returns original when suffixes do not look like RS+pod', () => {
    expect(workloadFromPodName('not-a-pod-name-here')).toBe('not-a-pod-name-here')
  })
})

// ---------------------------------------------------------------------------
// severityColor
// ---------------------------------------------------------------------------

describe('severityColor', () => {
  it('returns critical color for critical', () => {
    expect(severityColor('critical')).toBe('var(--s-critical)')
  })
  it('returns warning color for warning', () => {
    expect(severityColor('warning')).toBe('var(--s-warning)')
  })
  it('returns info color for anything else', () => {
    expect(severityColor('info')).toBe('var(--s-info)')
    expect(severityColor('unknown')).toBe('var(--s-info)')
  })
})

// ---------------------------------------------------------------------------
// deriveShortReason
// ---------------------------------------------------------------------------

describe('deriveShortReason', () => {
  it('detects ImagePullBackOff', () => {
    const n = { title: 'ImagePullBackOff — ns/pod' } as StellarNotification
    expect(deriveShortReason(n)).toContain('image')
  })

  it('detects CrashLoopBackOff', () => {
    const n = { title: 'CrashLoopBackOff — ns/app' } as StellarNotification
    expect(deriveShortReason(n)).toContain('restart loop')
  })

  it('detects OOMKill', () => {
    const n = { title: 'OOMKilled — ns/pod' } as StellarNotification
    expect(deriveShortReason(n)).toContain('memory')
  })

  it('detects FailedScheduling', () => {
    const n = { title: 'FailedScheduling — ns/pod' } as StellarNotification
    expect(deriveShortReason(n)).toContain('capacity')
  })

  it('detects FailedMount', () => {
    const n = { title: 'FailedMount — ns/pod' } as StellarNotification
    expect(deriveShortReason(n)).toContain('volume')
  })

  it('returns null for unrecognized patterns', () => {
    const n = { title: 'Something random happened' } as StellarNotification
    expect(deriveShortReason(n)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// deriveTags
// ---------------------------------------------------------------------------

describe('deriveTags', () => {
  it('adds auto-fixable when actionHints include restart', () => {
    const n = { title: 'BackOff', actionHints: ['restart'] } as StellarNotification
    expect(deriveTags(n, 0)).toContain('auto-fixable')
  })

  it('adds recurring when relatedCount >= 3', () => {
    const n = { title: 'something', actionHints: [] } as unknown as StellarNotification
    expect(deriveTags(n, 3)).toContain('recurring')
    expect(deriveTags(n, 2)).not.toContain('recurring')
  })

  it('adds crash-loop for crashloop in title', () => {
    const n = { title: 'CrashLoopBackOff — ns/pod', actionHints: [] } as unknown as StellarNotification
    expect(deriveTags(n, 0)).toContain('crash-loop')
  })

  it('adds image-pull for ImagePullBackOff (not crash-loop)', () => {
    const n = { title: 'ImagePullBackOff — ns/pod', actionHints: [] } as unknown as StellarNotification
    const tags = deriveTags(n, 0)
    expect(tags).toContain('image-pull')
    expect(tags).not.toContain('crash-loop')
  })

  it('adds memory for OOM events', () => {
    const n = { title: 'OOMKilled — ns/pod', actionHints: [] } as unknown as StellarNotification
    expect(deriveTags(n, 0)).toContain('memory')
  })
})

// ---------------------------------------------------------------------------
// countRelated
// ---------------------------------------------------------------------------

describe('countRelated', () => {
  it('returns 0 when no dedupeKey', () => {
    const n = { id: '1', dedupeKey: '' } as unknown as StellarNotification
    expect(countRelated(n, [])).toBe(0)
  })

  it('counts other notifications with same dedupeKey', () => {
    const n = { id: '1', dedupeKey: 'key-a' } as unknown as StellarNotification
    const all = [
      { id: '1', dedupeKey: 'key-a' },
      { id: '2', dedupeKey: 'key-a' },
      { id: '3', dedupeKey: 'key-b' },
      { id: '4', dedupeKey: 'key-a' },
    ] as unknown as StellarNotification[]
    expect(countRelated(n, all)).toBe(2)
  })

  it('excludes self from count', () => {
    const n = { id: '1', dedupeKey: 'x' } as unknown as StellarNotification
    expect(countRelated(n, [n])).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// deriveImportance
// ---------------------------------------------------------------------------

describe('deriveImportance', () => {
  it('critical severity scores at least 50', () => {
    const n = { severity: 'critical', createdAt: new Date().toISOString() } as unknown as StellarNotification
    expect(deriveImportance(n, 0).score).toBeGreaterThanOrEqual(50)
  })

  it('adds recurring bonus when relatedCount >= 3', () => {
    const n = { severity: 'warning', createdAt: new Date().toISOString() } as unknown as StellarNotification
    const withoutRecurring = deriveImportance(n, 0).score
    const withRecurring = deriveImportance(n, 3).score
    expect(withRecurring).toBeGreaterThan(withoutRecurring)
  })

  it('adds duration bonus for old events', () => {
    const old = new Date(Date.now() - 20 * 60_000).toISOString()
    const n = { severity: 'info', createdAt: old } as unknown as StellarNotification
    const result = deriveImportance(n, 0)
    // info(10) + duration(20) + long_duration(20) = 50
    expect(result.score).toBeGreaterThanOrEqual(50)
  })

  it('returns correct labels based on score thresholds', () => {
    const recent = new Date().toISOString()
    expect(deriveImportance({ severity: 'info', createdAt: recent } as unknown as StellarNotification, 0).label).toBe('low')
    expect(deriveImportance({ severity: 'warning', createdAt: recent } as unknown as StellarNotification, 0).label).toBe('low')
    expect(deriveImportance({ severity: 'critical', createdAt: recent } as unknown as StellarNotification, 0).label).toBe('medium')
  })
})

// ---------------------------------------------------------------------------
// importanceColor
// ---------------------------------------------------------------------------

describe('importanceColor', () => {
  it('maps all labels to CSS vars', () => {
    expect(importanceColor('critical')).toBe('var(--s-critical)')
    expect(importanceColor('high')).toBe('var(--s-warning)')
    expect(importanceColor('medium')).toBe('var(--s-info)')
    expect(importanceColor('low')).toBe('var(--s-text-muted)')
  })
})

// ---------------------------------------------------------------------------
// countSolveAttempts
// ---------------------------------------------------------------------------

describe('countSolveAttempts', () => {
  it('returns 0 when no matching solves', () => {
    expect(countSolveAttempts({ cluster: 'a', namespace: 'ns', title: 'x', dedupeKey: 'ev:a:ns:pod-abc-xyz' }, [])).toBe(0)
  })

  it('counts solves matching workload key', () => {
    const notif = { cluster: 'east', namespace: 'prod', dedupeKey: 'ev:east:prod:api-server-7f8b9d-xk4mn' }
    const solves: StellarSolve[] = [
      { id: 's1', cluster: 'east', namespace: 'prod', workload: 'api-server', status: 'resolved', startedAt: '2025-01-01T00:00:00Z', eventId: 'x' },
      { id: 's2', cluster: 'east', namespace: 'prod', workload: 'api-server', status: 'running', startedAt: '2025-01-02T00:00:00Z', eventId: 'y' },
      { id: 's3', cluster: 'west', namespace: 'prod', workload: 'api-server', status: 'resolved', startedAt: '2025-01-01T00:00:00Z', eventId: 'z' },
    ] as unknown as StellarSolve[]
    expect(countSolveAttempts(notif, solves)).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// getSolveStatus
// ---------------------------------------------------------------------------

describe('getSolveStatus', () => {
  it('returns null when no solves exist for workload', () => {
    const notif = { id: 'n1', cluster: 'a', namespace: 'ns', title: 'CrashLoop — ns/pod-abc-xyz', dedupeKey: 'ev:a:ns:pod-abc-xyz' }
    expect(getSolveStatus(notif, [], {})).toBeNull()
  })

  it('returns live progress when available by event id', () => {
    const notif = { id: 'n1', cluster: 'a', namespace: 'ns', title: 'x', dedupeKey: '' }
    const progress = { n1: { step: 'investigating', message: 'Reading logs', solveId: 's1' } } as unknown as Parameters<typeof getSolveStatus>[2]
    const result = getSolveStatus(notif, [], progress)
    expect(result).not.toBeNull()
    expect(result!.phase).toBe('investigating')
    expect(result!.isActive).toBe(true)
  })

  it('returns resolved status from direct solve match', () => {
    const notif = { id: 'n1', cluster: 'a', namespace: 'ns', title: 'x', dedupeKey: '' }
    const solves = [{ id: 's1', eventId: 'n1', cluster: 'a', namespace: 'ns', workload: 'x', status: 'resolved', startedAt: new Date().toISOString() }] as unknown as StellarSolve[]
    const result = getSolveStatus(notif, solves, {})
    expect(result!.phase).toBe('resolved')
    expect(result!.isActive).toBe(false)
    expect(result!.percent).toBe(100)
  })

  it('handles string notification id (back-compat)', () => {
    const solves = [{ id: 's1', eventId: 'n1', status: 'escalated', startedAt: new Date().toISOString(), cluster: '', namespace: '', workload: '' }] as unknown as StellarSolve[]
    const result = getSolveStatus('n1', solves, {})
    expect(result!.phase).toBe('escalated')
  })
})

// ---------------------------------------------------------------------------
// getWatchAttemptSummary
// ---------------------------------------------------------------------------

describe('getWatchAttemptSummary', () => {
  it('returns null when no relevant solves', () => {
    const watch = { cluster: 'a', namespace: 'ns', resourceName: 'web' } as StellarWatch
    expect(getWatchAttemptSummary(watch, [])).toBeNull()
  })

  it('summarizes solve attempts within lookback window', () => {
    const watch = { cluster: 'a', namespace: 'ns', resourceName: 'web' } as StellarWatch
    const now = new Date()
    const solves = [
      { cluster: 'a', namespace: 'ns', workload: 'web', status: 'resolved', startedAt: now.toISOString() },
      { cluster: 'a', namespace: 'ns', workload: 'web', status: 'escalated', startedAt: now.toISOString() },
      { cluster: 'a', namespace: 'ns', workload: 'web', status: 'exhausted', startedAt: now.toISOString() },
    ] as unknown as StellarSolve[]
    const result = getWatchAttemptSummary(watch, solves)
    expect(result).not.toBeNull()
    expect(result!.total).toBe(3)
    expect(result!.resolved).toBe(1)
    expect(result!.escalated).toBe(1)
    expect(result!.paused).toBe(1)
  })

  it('excludes solves from different cluster', () => {
    const watch = { cluster: 'east', namespace: 'ns', resourceName: 'web' } as StellarWatch
    const solves = [
      { cluster: 'west', namespace: 'ns', workload: 'web', status: 'resolved', startedAt: new Date().toISOString() },
    ] as unknown as StellarSolve[]
    expect(getWatchAttemptSummary(watch, solves)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// trendIcon / trendColor
// ---------------------------------------------------------------------------

describe('trendIcon', () => {
  it('returns correct icons for each trend', () => {
    expect(trendIcon('increasing')).toBe('↗')
    expect(trendIcon('decreasing')).toBe('↘')
    expect(trendIcon('stable')).toBe('↔')
    expect(trendIcon('idle')).toBe('·')
  })
})

describe('trendColor', () => {
  it('maps increasing to critical', () => {
    expect(trendColor('increasing')).toBe('var(--s-critical)')
  })
  it('maps decreasing to success', () => {
    expect(trendColor('decreasing')).toBe('var(--s-success)')
  })
})

// ---------------------------------------------------------------------------
// renderSparkline
// ---------------------------------------------------------------------------

describe('renderSparkline', () => {
  it('returns empty string for empty buckets', () => {
    expect(renderSparkline([])).toBe('')
  })

  it('returns empty string for all-zero buckets', () => {
    expect(renderSparkline([0, 0, 0])).toBe('')
  })

  it('renders unicode blocks for non-zero buckets', () => {
    const result = renderSparkline([0, 1, 2, 4])
    expect(result.length).toBe(4)
    // Max is 4, so last char should be full block
    expect(result[3]).toBe('█')
    // First is 0, should be lowest block
    expect(result[0]).toBe('▁')
  })

  it('handles single-element bucket', () => {
    const result = renderSparkline([5])
    expect(result.length).toBe(1)
    expect(result).toBe('█')
  })
})

// ---------------------------------------------------------------------------
// deriveWatchTrend
// ---------------------------------------------------------------------------

describe('deriveWatchTrend', () => {
  it('returns idle when no matching notifications', () => {
    const watch = { cluster: 'a', namespace: 'ns', resourceName: 'web' } as StellarWatch
    const result = deriveWatchTrend(watch, [])
    expect(result.trend).toBe('idle')
    expect(result.recent).toBe(0)
    expect(result.prior).toBe(0)
  })

  it('returns increasing when recent > prior * 1.25', () => {
    const watch = { cluster: 'a', namespace: 'ns', resourceName: 'web' } as StellarWatch
    const now = Date.now()
    const notifications = [
      // 3 recent events (within 24h)
      { id: '1', title: 'CrashLoop — ns/web-abc-xyz', cluster: 'a', namespace: 'ns', createdAt: new Date(now - 3600_000).toISOString(), dedupeKey: '' },
      { id: '2', title: 'BackOff — ns/web-def-uvw', cluster: 'a', namespace: 'ns', createdAt: new Date(now - 7200_000).toISOString(), dedupeKey: '' },
      { id: '3', title: 'CrashLoop — ns/web-ghi-rst', cluster: 'a', namespace: 'ns', createdAt: new Date(now - 10800_000).toISOString(), dedupeKey: '' },
      // 1 prior event (24-48h ago)
      { id: '4', title: 'BackOff — ns/web-jkl-mno', cluster: 'a', namespace: 'ns', createdAt: new Date(now - 30 * 3600_000).toISOString(), dedupeKey: '' },
    ] as unknown as StellarNotification[]
    const result = deriveWatchTrend(watch, notifications)
    expect(result.trend).toBe('increasing')
    expect(result.recent).toBe(3)
    expect(result.prior).toBe(1)
  })

  it('returns sparkline with 24 buckets', () => {
    const watch = { cluster: 'a', namespace: 'ns', resourceName: 'web' } as StellarWatch
    const now = Date.now()
    const notifications = [
      { id: '1', title: 'Error — ns/web', cluster: 'a', namespace: 'ns', createdAt: new Date(now - 1000).toISOString(), dedupeKey: '' },
    ] as unknown as StellarNotification[]
    const result = deriveWatchTrend(watch, notifications)
    expect(result.sparkline).toHaveLength(24)
  })
})
