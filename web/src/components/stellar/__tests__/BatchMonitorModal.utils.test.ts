import { describe, it, expect } from 'vitest'
import type {
  StellarNotification,
  StellarSolve,
  StellarSolveProgress,
} from '../../../types/stellar'
import {
  buildDemoBatch,
  deriveEventStatus,
  deriveStepLabel,
  buildResolutionStepsFromProgress,
  getStatusIcon,
  getStatusColor,
  formatElapsedSeconds,
  BATCH_UPDATE_INTERVAL_MS,
  SECONDS_PER_MINUTE,
  MS_PER_SECOND,
  OVERLAY_Z_INDEX,
  STEP_INTERVAL_MS,
  BATCH_START_OFFSET_MS,
  BATCH_WINDOW_MS,
  FLEX_MIN_WIDTH_STYLE,
} from '../BatchMonitorModal.utils'

function notification(overrides: Partial<StellarNotification> = {}): StellarNotification {
  return {
    id: overrides.id ?? 'n1',
    type: overrides.type ?? 'event',
    severity: overrides.severity ?? 'info',
    title: overrides.title ?? 'x',
    body: overrides.body ?? '',
    read: overrides.read ?? false,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
    ...overrides,
  } as StellarNotification
}

function solve(overrides: Partial<StellarSolve> = {}): StellarSolve {
  return {
    id: overrides.id ?? 's1',
    eventId: overrides.eventId ?? 'n1',
    userId: 'u1',
    cluster: 'c1',
    namespace: 'ns1',
    workload: 'w1',
    status: overrides.status ?? 'running',
    actionsTaken: 0,
    summary: '',
    startedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as StellarSolve
}

function progress(overrides: Partial<StellarSolveProgress> = {}): StellarSolveProgress {
  return {
    solveId: overrides.solveId ?? 's1',
    eventId: overrides.eventId ?? 'n1',
    step: overrides.step ?? 'investigating',
    ...overrides,
  } as StellarSolveProgress
}

// ─── constants ───────────────────────────────────────────────────────────────

describe('BatchMonitorModal.utils constants', () => {
  it('exposes timing constants', () => {
    expect(BATCH_UPDATE_INTERVAL_MS).toBe(2000)
    expect(SECONDS_PER_MINUTE).toBe(60)
    expect(MS_PER_SECOND).toBe(1000)
    expect(STEP_INTERVAL_MS).toBe(3000)
    expect(BATCH_START_OFFSET_MS).toBe(5000)
    expect(BATCH_WINDOW_MS).toBe(30000)
  })

  it('exposes an OVERLAY_Z_INDEX high enough to sit above modals', () => {
    expect(OVERLAY_Z_INDEX).toBeGreaterThanOrEqual(1000)
    expect(OVERLAY_Z_INDEX).toBe(9999)
  })

  it('exposes an immutable FLEX_MIN_WIDTH_STYLE', () => {
    expect(FLEX_MIN_WIDTH_STYLE).toEqual({ flex: 1, minWidth: 0 })
  })
})

// ─── buildDemoBatch ──────────────────────────────────────────────────────────

describe('buildDemoBatch', () => {
  it('produces a batch with 5 demo events summarised correctly', () => {
    const batch = buildDemoBatch('2026-05-01T12:00:00Z')
    expect(batch.totalEvents).toBe(5)
    expect(batch.events).toHaveLength(5)
    expect(batch.status).toBe('in_progress')
    expect(batch.summary).toEqual({
      resolved: 1,
      failed: 1,
      skipped: 1,
      inProgress: 2, // 1 in_progress + 1 pending
    })
  })

  it('sets id and startTime from the supplied batchTimestamp', () => {
    const ts = '2026-05-01T12:00:00Z'
    const batch = buildDemoBatch(ts)
    expect(batch.id).toBe(ts)
    expect(batch.startTime).toBe(new Date(ts).toISOString())
  })

  it('falls back to Date.now() - BATCH_WINDOW_MS when timestamp is unparseable', () => {
    const before = Date.now()
    const batch = buildDemoBatch('not-a-date')
    const after = Date.now()
    const start = new Date(batch.startTime).getTime()
    // start ≈ Date.now() - BATCH_WINDOW_MS within a small window
    expect(start).toBeGreaterThanOrEqual(before - BATCH_WINDOW_MS - 100)
    expect(start).toBeLessThanOrEqual(after - BATCH_WINDOW_MS + 100)
  })

  it('includes exactly one event of each summary category', () => {
    const batch = buildDemoBatch('2026-05-01T12:00:00Z')
    const statuses = batch.events.map((e) => e.status).sort()
    expect(statuses).toEqual(['failed', 'in_progress', 'pending', 'resolved', 'skipped'])
  })
})

// ─── deriveEventStatus ───────────────────────────────────────────────────────

describe('deriveEventStatus', () => {
  it('returns "resolved" when the progress step is resolved', () => {
    const status = deriveEventStatus(
      notification(),
      [],
      { n1: progress({ step: 'resolved' }) },
    )
    expect(status).toBe('resolved')
  })

  it('returns "failed" when progress step is escalated or exhausted', () => {
    expect(deriveEventStatus(notification(), [], { n1: progress({ step: 'escalated' }) })).toBe('failed')
    expect(deriveEventStatus(notification(), [], { n1: progress({ step: 'exhausted' }) })).toBe('failed')
  })

  it('returns "in_progress" for any other progress step', () => {
    expect(deriveEventStatus(notification(), [], { n1: progress({ step: 'investigating' }) })).toBe('in_progress')
    expect(deriveEventStatus(notification(), [], { n1: progress({ step: 'root_cause' }) })).toBe('in_progress')
    expect(deriveEventStatus(notification(), [], { n1: progress({ step: 'solving' }) })).toBe('in_progress')
  })

  it('falls back to solves when there is no progress entry', () => {
    expect(deriveEventStatus(notification(), [solve({ status: 'resolved' })], {})).toBe('resolved')
    expect(deriveEventStatus(notification(), [solve({ status: 'escalated' })], {})).toBe('failed')
    expect(deriveEventStatus(notification(), [solve({ status: 'exhausted' })], {})).toBe('failed')
  })

  it('ignores solves whose eventId does not match', () => {
    const status = deriveEventStatus(
      notification({ id: 'n1', severity: 'critical' }),
      [solve({ eventId: 'other', status: 'resolved' })],
      {},
    )
    // no match → severity critical → pending
    expect(status).toBe('pending')
  })

  it('returns "pending" for critical notifications without progress or solve', () => {
    expect(deriveEventStatus(notification({ severity: 'critical' }), [], {})).toBe('pending')
  })

  it('returns "skipped" for non-critical notifications without progress or solve', () => {
    expect(deriveEventStatus(notification({ severity: 'warning' }), [], {})).toBe('skipped')
    expect(deriveEventStatus(notification({ severity: 'info' }), [], {})).toBe('skipped')
  })

  it('tolerates a null/undefined solves array', () => {
    expect(
      deriveEventStatus(
        notification({ severity: 'critical' }),
        undefined as unknown as StellarSolve[],
        {},
      ),
    ).toBe('pending')
  })

  it('prefers progress over solve when both are present', () => {
    // progress says resolved, solve says escalated — progress wins
    const status = deriveEventStatus(
      notification(),
      [solve({ status: 'escalated' })],
      { n1: progress({ step: 'resolved' }) },
    )
    expect(status).toBe('resolved')
  })
})

// ─── deriveStepLabel ─────────────────────────────────────────────────────────

describe('deriveStepLabel', () => {
  it('returns undefined for undefined progress', () => {
    expect(deriveStepLabel(undefined)).toBeUndefined()
  })

  it.each([
    ['investigating', 'Analyzing root cause…'],
    ['reading', 'Analyzing root cause…'],
    ['root_cause', 'Generating remediation plan…'],
    ['planning', 'Generating remediation plan…'],
    ['solving', 'Executing resolution…'],
    ['acting', 'Executing resolution…'],
    ['verifying', 'Validating result…'],
    ['observing', 'Validating result…'],
  ])('maps step "%s" to "%s"', (step, expected) => {
    expect(deriveStepLabel(progress({ step: step as StellarSolveProgress['step'] }))).toBe(expected)
  })

  it('falls back to progress.message for unknown steps', () => {
    expect(
      deriveStepLabel(progress({
        step: 'unknown' as StellarSolveProgress['step'],
        message: 'custom label',
      } as Partial<StellarSolveProgress>)),
    ).toBe('custom label')
  })

  it('returns undefined for unknown step with no message', () => {
    expect(
      deriveStepLabel(progress({ step: 'unknown' as StellarSolveProgress['step'] })),
    ).toBeUndefined()
  })
})

// ─── buildResolutionStepsFromProgress ────────────────────────────────────────

describe('buildResolutionStepsFromProgress', () => {
  it('returns an empty array for undefined progress', () => {
    expect(buildResolutionStepsFromProgress(undefined)).toEqual([])
  })

  it('emits 4 steps for any known progress', () => {
    const steps = buildResolutionStepsFromProgress(progress({ step: 'investigating' }))
    expect(steps).toHaveLength(4)
    expect(steps.map((s) => s.name)).toEqual([
      'Analyzing root cause',
      'Generating remediation plan',
      'Executing resolution',
      'Validating result',
    ])
  })

  it('marks steps before the current index as completed, current as in_progress, after as pending', () => {
    const steps = buildResolutionStepsFromProgress(progress({ step: 'solving' }))
    // solving is index 2 → indexes 0,1 completed, 2 in_progress, 3 pending
    expect(steps.map((s) => s.status)).toEqual(['completed', 'completed', 'in_progress', 'pending'])
  })

  it('gives completed steps a non-null endTime and pending steps a null endTime with 0 startTime', () => {
    const steps = buildResolutionStepsFromProgress(progress({ step: 'root_cause' }))
    // root_cause is index 1 → 0 completed, 1 in_progress, 2/3 pending
    expect(steps[0].endTime).not.toBeNull()
    expect(steps[1].endTime).toBeNull()
    expect(steps[2].endTime).toBeNull()
    expect(steps[2].startTime).toBe(0)
    expect(steps[3].startTime).toBe(0)
  })

  it('for unknown step (currentIdx = -1) marks all steps as pending', () => {
    const steps = buildResolutionStepsFromProgress(
      progress({ step: 'not-a-step' as StellarSolveProgress['step'] }),
    )
    expect(steps.map((s) => s.status)).toEqual(['pending', 'pending', 'pending', 'pending'])
    // All startTimes should be 0 for pending steps
    expect(steps.every((s) => s.startTime === 0)).toBe(true)
    expect(steps.every((s) => s.endTime === null)).toBe(true)
  })

  it('always fills output as "" and error as null on new steps', () => {
    const steps = buildResolutionStepsFromProgress(progress({ step: 'verifying' }))
    expect(steps.every((s) => s.output === '' && s.error === null)).toBe(true)
  })
})

// ─── getStatusIcon / getStatusColor ──────────────────────────────────────────

describe('getStatusIcon', () => {
  it.each([
    ['pending', '⏳'],
    ['in_progress', '⊙'],
    ['resolved', '✓'],
    ['failed', '✗'],
    ['skipped', '–'],
  ])('maps %s → %s', (status, icon) => {
    expect(getStatusIcon(status as 'pending')).toBe(icon)
  })

  it('returns a bullet for an unknown status (default branch)', () => {
    expect(getStatusIcon('bogus' as 'pending')).toBe('•')
  })
})

describe('getStatusColor', () => {
  it.each([
    ['pending', 'var(--s-text-dim)'],
    ['in_progress', 'var(--s-info)'],
    ['resolved', 'var(--s-success)'],
    ['failed', 'var(--s-critical)'],
    ['skipped', 'var(--s-text-muted)'],
  ])('maps %s → %s', (status, color) => {
    expect(getStatusColor(status as 'pending')).toBe(color)
  })

  it('returns default color for an unknown status', () => {
    expect(getStatusColor('bogus' as 'pending')).toBe('var(--s-text)')
  })
})

// ─── formatElapsedSeconds ────────────────────────────────────────────────────

describe('formatElapsedSeconds', () => {
  it('renders seconds under one minute as "Ns"', () => {
    expect(formatElapsedSeconds(0)).toBe('0s')
    expect(formatElapsedSeconds(1)).toBe('1s')
    expect(formatElapsedSeconds(59)).toBe('59s')
  })

  it('renders exact minutes as "Nm 0s"', () => {
    expect(formatElapsedSeconds(60)).toBe('1m 0s')
    expect(formatElapsedSeconds(120)).toBe('2m 0s')
  })

  it('renders mixed minutes and seconds', () => {
    expect(formatElapsedSeconds(75)).toBe('1m 15s')
    expect(formatElapsedSeconds(3599)).toBe('59m 59s')
    expect(formatElapsedSeconds(3600)).toBe('60m 0s')
  })
})
