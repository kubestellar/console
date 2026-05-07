import { describe, expect, it } from 'vitest'
import { groupAlertsForDisplay } from './groupAlertsForDisplay'
import type { Alert } from '../../types/alerts'

const BASE_TIME_MS = Date.UTC(2026, 0, 1, 0, 0, 0)

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'alert-1',
    ruleId: 'rule-1',
    ruleName: 'Pod CrashLoopBackOff',
    severity: 'warning',
    status: 'firing',
    message: 'Pod CrashLoopBackOff',
    details: {},
    cluster: 'cluster-a',
    firedAt: new Date(BASE_TIME_MS).toISOString(),
    ...overrides,
  }
}

describe('groupAlertsForDisplay', () => {
  it('groups alerts with the same message, type, and source', () => {
    const alerts = [
      makeAlert({ id: 'alert-1', details: { source: 'prometheus' } }),
      makeAlert({ id: 'alert-2', details: { source: 'prometheus' }, firedAt: new Date(BASE_TIME_MS - 15_000).toISOString() }),
      makeAlert({ id: 'alert-3', ruleId: 'rule-2', details: { source: 'prometheus' } }),
      makeAlert({ id: 'alert-4', details: { source: 'alertmanager' } }),
    ]

    const groups = groupAlertsForDisplay(alerts)

    expect(groups).toHaveLength(3)
    expect(groups[0]).toMatchObject({ id: 'alert-1', duplicateCount: 2, alertIds: ['alert-1', 'alert-2'] })
  })

  it('keeps the newest alert as the representative row', () => {
    const alerts = [
      makeAlert({ id: 'older', firedAt: new Date(BASE_TIME_MS).toISOString(), details: { source: 'prometheus' } }),
      makeAlert({ id: 'newer', firedAt: new Date(BASE_TIME_MS + 60_000).toISOString(), details: { source: 'prometheus' } }),
    ]

    const groups = groupAlertsForDisplay(alerts)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.id).toBe('newer')
    expect(groups[0]?.alertIds).toEqual(['newer', 'older'])
  })

  it('does not merge acknowledged and unacknowledged alerts', () => {
    const alerts = [
      makeAlert({ id: 'alert-1', details: { source: 'prometheus' } }),
      makeAlert({ id: 'alert-2', details: { source: 'prometheus' }, acknowledgedAt: new Date(BASE_TIME_MS - 5_000).toISOString() }),
    ]

    const groups = groupAlertsForDisplay(alerts)

    expect(groups).toHaveLength(2)
  })

  it('does not merge alerts outside the grouping window', () => {
    const alerts = [
      makeAlert({ id: 'alert-1', details: { source: 'prometheus' } }),
      makeAlert({
        id: 'alert-2',
        details: { source: 'prometheus' },
        firedAt: new Date(BASE_TIME_MS - 120_000).toISOString(),
      }),
    ]

    const groups = groupAlertsForDisplay(alerts)

    expect(groups).toHaveLength(2)
  })
})
