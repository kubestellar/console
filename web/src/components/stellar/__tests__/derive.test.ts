/**
 * Tests for components/stellar/lib/derive.ts
 *
 * All exported pure functions are covered:
 *   countSolveAttempts, getSolveStatus, getWatchAttemptSummary,
 *   severityColor, deriveShortReason, deriveTags, countRelated,
 *   deriveImportance, importanceColor, trendIcon, renderSparkline,
 *   trendColor, deriveWatchTrend
 */
import { describe, it, expect } from 'vitest'
import {
  countSolveAttempts,
  getSolveStatus,
  getWatchAttemptSummary,
  severityColor,
  deriveShortReason,
  deriveTags,
  countRelated,
  deriveImportance,
  importanceColor,
  trendIcon,
  renderSparkline,
  trendColor,
  deriveWatchTrend,
} from '../lib/derive'
import type { StellarNotification, StellarSolve, StellarWatch } from '../../../types/stellar'

function makeNotif(overrides: Partial<StellarNotification> = {}): StellarNotification {
  return {
    id: 'n1',
    type: 'event',
    severity: 'warning',
    title: 'BackOff — production/api-server-abc12-xyz56',
    body: 'Container keeps restarting',
    read: false,
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    cluster: 'prod',
    namespace: 'production',
    dedupeKey: 'ev:prod:production:api-server-abc12-xyz56:BackOff',
    ...overrides,
  }
}

function makeSolve(overrides: Partial<StellarSolve> = {}): StellarSolve {
  return {
    id: 's1',
    eventId: 'n1',
    userId: 'u1',
    cluster: 'prod',
    namespace: 'production',
    workload: 'api-server',
    status: 'running',
    actionsTaken: 2,
    summary: 'Investigating restart loop',
    startedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    ...overrides,
  }
}

function makeWatch(overrides: Partial<StellarWatch> = {}): StellarWatch {
  return {
    id: 'w1',
    cluster: 'prod',
    namespace: 'production',
    resourceKind: 'Pod',
    resourceName: 'api-server',
    reason: 'BackOff',
    status: 'active',
    lastUpdate: new Date().toISOString(),
    createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('severityColor', () => {
  it('critical', () => { expect(severityColor('critical')).toBe('var(--s-critical)') })
  it('warning', () => { expect(severityColor('warning')).toBe('var(--s-warning)') })
  it('info and unknown → info color', () => {
    expect(severityColor('info')).toBe('var(--s-info)')
    expect(severityColor('unknown')).toBe('var(--s-info)')
  })
})

describe('trendIcon', () => {
  it('increasing → ↗', () => { expect(trendIcon('increasing')).toBe('↗') })
  it('decreasing → ↘', () => { expect(trendIcon('decreasing')).toBe('↘') })
  it('stable → ↔', () => { expect(trendIcon('stable')).toBe('↔') })
  it('idle → ·', () => { expect(trendIcon('idle')).toBe('·') })
})

describe('trendColor', () => {
  it('increasing', () => { expect(trendColor('increasing')).toBe('var(--s-critical)') })
  it('decreasing', () => { expect(trendColor('decreasing')).toBe('var(--s-success)') })
  it('stable', () => { expect(trendColor('stable')).toBe('var(--s-text-muted)') })
  it('idle', () => { expect(trendColor('idle')).toBe('var(--s-text-dim)') })
})

describe('importanceColor', () => {
  it('critical', () => { expect(importanceColor('critical')).toBe('var(--s-critical)') })
  it('high', () => { expect(importanceColor('high')).toBe('var(--s-warning)') })
  it('medium', () => { expect(importanceColor('medium')).toBe('var(--s-info)') })
  it('low', () => { expect(importanceColor('low')).toBe('var(--s-text-muted)') })
})

describe('renderSparkline', () => {
  it('empty → ""', () => { expect(renderSparkline([])).toBe('') })
  it('all zeros → ""', () => { expect(renderSparkline([0, 0, 0])).toBe('') })
  it('length equals buckets length', () => { expect(renderSparkline([1, 2, 3]).length).toBe(3) })
  it('max value gets █', () => { expect(renderSparkline([0, 10, 0])[1]).toBe('█') })
  it('zero when max > 0 gets ▁', () => { expect(renderSparkline([0, 5])[0]).toBe('▁') })
})

describe('deriveShortReason', () => {
  it('crashloop', () => { expect(deriveShortReason(makeNotif({ title: 'CrashLoopBackOff — ns/pod' }))).toContain('restart loop') })
  it('OOMKill', () => { expect(deriveShortReason(makeNotif({ title: 'OOMKilled — ns/pod' }))).toContain('memory limit') })
  it('ErrImagePull (no backoff in name)', () => { expect(deriveShortReason(makeNotif({ title: 'ErrImagePull — ns/pod' }))).toContain('image') })
  it('FailedScheduling', () => { expect(deriveShortReason(makeNotif({ title: 'FailedScheduling for pod' }))).toContain("can't be placed") })
  it('unrecognised → null', () => { expect(deriveShortReason(makeNotif({ title: 'SomethingRandom' }))).toBeNull() })
})

describe('deriveTags', () => {
  it('auto-fixable when hint includes restart', () => {
    expect(deriveTags(makeNotif({ actionHints: ['restart'] }), 0)).toContain('auto-fixable')
  })
  it('recurring when relatedCount >= 3', () => {
    expect(deriveTags(makeNotif(), 3)).toContain('recurring')
    expect(deriveTags(makeNotif(), 2)).not.toContain('recurring')
  })
  it('crash-loop tag for backoff title', () => {
    expect(deriveTags(makeNotif({ title: 'BackOff ns/pod' }), 0)).toContain('crash-loop')
  })
  it('memory tag for OOM title', () => {
    expect(deriveTags(makeNotif({ title: 'OOMKilled ns/pod' }), 0)).toContain('memory')
  })
  it('empty for plain info', () => {
    expect(deriveTags(makeNotif({ title: 'ClusterProvisioned', actionHints: [] }), 0)).toEqual([])
  })
})

describe('countRelated', () => {
  it('0 when no dedupeKey', () => {
    expect(countRelated(makeNotif({ dedupeKey: undefined }), [])).toBe(0)
  })
  it('counts others with same key', () => {
    const key = 'ev:prod:ns:pod:BackOff'
    const n1 = makeNotif({ id: 'n1', dedupeKey: key })
    const n2 = makeNotif({ id: 'n2', dedupeKey: key })
    const n3 = makeNotif({ id: 'n3', dedupeKey: 'other' })
    expect(countRelated(n1, [n1, n2, n3])).toBe(1)
  })
  it('excludes self', () => {
    const n = makeNotif({ dedupeKey: 'k' })
    expect(countRelated(n, [n])).toBe(0)
  })
})

describe('deriveImportance', () => {
  it('critical severity → score ≥ 50', () => {
    expect(deriveImportance(makeNotif({ severity: 'critical', createdAt: new Date().toISOString() }), 0).score).toBeGreaterThanOrEqual(50)
  })
  it('info severity no recurrence → low', () => {
    expect(deriveImportance(makeNotif({ severity: 'info', createdAt: new Date().toISOString() }), 0).label).toBe('low')
  })
  it('recurring bonus raises score', () => {
    const n = makeNotif({ severity: 'info', createdAt: new Date().toISOString() })
    expect(deriveImportance(n, 3).score).toBeGreaterThan(deriveImportance(n, 0).score)
  })
  it('old notification gets duration bonus', () => {
    const old = makeNotif({ severity: 'info', createdAt: new Date(Date.now() - 20 * 60_000).toISOString() })
    const fresh = makeNotif({ severity: 'info', createdAt: new Date().toISOString() })
    expect(deriveImportance(old, 0).score).toBeGreaterThan(deriveImportance(fresh, 0).score)
  })
  it('label is one of 4 levels', () => {
    expect(['critical', 'high', 'medium', 'low']).toContain(deriveImportance(makeNotif(), 0).label)
  })
})

describe('countSolveAttempts', () => {
  it('0 when no solves', () => { expect(countSolveAttempts(makeNotif(), [])).toBe(0) })
  it('0 when no extractable workload', () => {
    expect(countSolveAttempts(makeNotif({ dedupeKey: undefined, title: 'Random' }), [makeSolve()])).toBe(0)
  })
  it('counts matching cluster/namespace/workload', () => {
    const solves = [makeSolve({ id: 's1' }), makeSolve({ id: 's2' }), makeSolve({ id: 's3', cluster: 'other' })]
    expect(countSolveAttempts(makeNotif(), solves)).toBe(2)
  })
})

describe('getSolveStatus', () => {
  it('null with empty inputs', () => { expect(getSolveStatus(makeNotif(), [], {})).toBeNull() })
  it('uses live progress', () => {
    const live = { n1: { solveId: 's1', step: 'investigating', message: '', percent: 20 } }
    expect(getSolveStatus(makeNotif(), [], live)?.phase).toBe('investigating')
  })
  it('resolved phase from direct solve', () => {
    expect(getSolveStatus(makeNotif(), [makeSolve({ status: 'resolved', eventId: 'n1' })], {})?.phase).toBe('resolved')
  })
  it('escalated phase', () => {
    expect(getSolveStatus(makeNotif(), [makeSolve({ status: 'escalated', eventId: 'n1' })], {})?.phase).toBe('escalated')
  })
  it('resolved_monitored phase from direct solve', () => {
    const nextRecheck = new Date(Date.now() + 5 * 60_000).toISOString()
    expect(getSolveStatus(makeNotif(), [makeSolve({ status: 'resolved_monitored', eventId: 'n1', nextRecheckAt: nextRecheck })], {})?.phase).toBe('resolved_monitored')
  })
  it('resolved_monitored is terminal (isActive false)', () => {
    const nextRecheck = new Date(Date.now() + 5 * 60_000).toISOString()
    expect(getSolveStatus(makeNotif(), [makeSolve({ status: 'resolved_monitored', eventId: 'n1', nextRecheckAt: nextRecheck })], {})?.isActive).toBe(false)
  })
  it('isActive true for running solve', () => {
    expect(getSolveStatus(makeNotif(), [makeSolve({ status: 'running', eventId: 'n1' })], {})?.isActive).toBe(true)
  })
  it('back-compat raw string id', () => {
    expect(getSolveStatus('notif-x', [makeSolve({ status: 'resolved', eventId: 'notif-x' })], {})?.phase).toBe('resolved')
  })
})

describe('getWatchAttemptSummary', () => {
  it('null when no solves', () => { expect(getWatchAttemptSummary(makeWatch(), [])).toBeNull() })
  it('null when different cluster', () => {
    expect(getWatchAttemptSummary(makeWatch(), [makeSolve({ cluster: 'staging' })])).toBeNull()
  })
  it('counts resolved/escalated/paused', () => {
    const w = makeWatch({ resourceName: 'api-server' })
    const solves = [
      makeSolve({ status: 'resolved', workload: 'api-server' }),
      makeSolve({ id: 's2', status: 'escalated', workload: 'api-server' }),
      makeSolve({ id: 's3', status: 'exhausted', workload: 'api-server' }),
    ]
    const s = getWatchAttemptSummary(w, solves)!
    expect(s.resolved).toBe(1)
    expect(s.escalated).toBe(1)
    expect(s.paused).toBe(1)
    expect(s.total).toBe(3)
  })
  it('recent sorted newest first', () => {
    const w = makeWatch({ resourceName: 'api-server' })
    const older = makeSolve({ id: 's1', workload: 'api-server', startedAt: new Date(Date.now() - 5 * 60_000).toISOString() })
    const newer = makeSolve({ id: 's2', workload: 'api-server', startedAt: new Date(Date.now() - 60_000).toISOString() })
    expect(getWatchAttemptSummary(w, [older, newer])!.recent[0].id).toBe('s2')
  })
})

describe('deriveWatchTrend', () => {
  it('idle when no notifications', () => { expect(deriveWatchTrend(makeWatch(), []).trend).toBe('idle') })
  it('sparkline has 24 buckets', () => { expect(deriveWatchTrend(makeWatch(), []).sparkline).toHaveLength(24) })
  it('sparkline values are non-negative integers', () => {
    const { sparkline } = deriveWatchTrend(makeWatch(), [makeNotif()])
    expect(sparkline.every(v => Number.isInteger(v) && v >= 0)).toBe(true)
  })
  it('increasing when recent >> prior', () => {
    const w = makeWatch({ resourceName: 'api-server', cluster: 'prod', namespace: 'production' })
    const recent = Array.from({ length: 10 }, (_, i) =>
      makeNotif({ id: `r${i}`, createdAt: new Date(Date.now() - i * 60_000).toISOString() })
    )
    expect(deriveWatchTrend(w, recent).trend).toBe('increasing')
  })
})
