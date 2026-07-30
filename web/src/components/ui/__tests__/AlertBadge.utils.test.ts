import { describe, it, expect } from 'vitest'
import { filterAndSortAlerts } from '../AlertBadge.utils'
import type { GroupedAlert } from '../../../lib/alerts/groupAlertsForDisplay'

function makeAlert(overrides: Partial<GroupedAlert>): GroupedAlert {
  return {
    id: overrides.id ?? 'a1',
    ruleId: 'rule-1',
    ruleName: 'Rule',
    severity: 'warning',
    status: 'firing',
    message: 'Something happened',
    details: {},
    firedAt: '2024-01-01T00:00:00.000Z',
    alertIds: [overrides.id ?? 'a1'],
    duplicateCount: 1,
    ...overrides,
  } as GroupedAlert
}

describe('filterAndSortAlerts', () => {
  it('returns all alerts unfiltered when search query is empty and severity is all', () => {
    const alerts = [makeAlert({ id: 'a1' }), makeAlert({ id: 'a2' })]
    const result = filterAndSortAlerts(alerts, '', 'all')
    expect(result).toHaveLength(2)
  })

  it('filters by rule name (case-insensitive)', () => {
    const alerts = [
      makeAlert({ id: 'a1', ruleName: 'Node Not Ready' }),
      makeAlert({ id: 'a2', ruleName: 'Disk Pressure' }),
    ]
    const result = filterAndSortAlerts(alerts, 'node not ready', 'all')
    expect(result.map(a => a.id)).toEqual(['a1'])
  })

  it('filters by message content', () => {
    const alerts = [
      makeAlert({ id: 'a1', message: 'GPU usage exceeded threshold' }),
      makeAlert({ id: 'a2', message: 'Memory pressure detected' }),
    ]
    const result = filterAndSortAlerts(alerts, 'gpu', 'all')
    expect(result.map(a => a.id)).toEqual(['a1'])
  })

  it('filters by cluster name', () => {
    const alerts = [
      makeAlert({ id: 'a1', cluster: 'cluster-east' }),
      makeAlert({ id: 'a2', cluster: 'cluster-west' }),
    ]
    const result = filterAndSortAlerts(alerts, 'east', 'all')
    expect(result.map(a => a.id)).toEqual(['a1'])
  })

  it('excludes alerts with no cluster when searching by cluster substring', () => {
    const alerts = [makeAlert({ id: 'a1', cluster: undefined })]
    const result = filterAndSortAlerts(alerts, 'east', 'all')
    expect(result).toHaveLength(0)
  })

  it('trims whitespace from the search query before matching', () => {
    const alerts = [makeAlert({ id: 'a1', ruleName: 'Disk Pressure' })]
    const result = filterAndSortAlerts(alerts, '   disk   '.trim(), 'all')
    expect(result.map(a => a.id)).toEqual(['a1'])
  })

  it('filters by severity when not "all"', () => {
    const alerts = [
      makeAlert({ id: 'a1', severity: 'critical' }),
      makeAlert({ id: 'a2', severity: 'info' }),
    ]
    const result = filterAndSortAlerts(alerts, '', 'critical')
    expect(result.map(a => a.id)).toEqual(['a1'])
  })

  it('sorts by severity first (critical before warning before info)', () => {
    const alerts = [
      makeAlert({ id: 'a1', severity: 'info', firedAt: '2024-01-01T00:00:00.000Z' }),
      makeAlert({ id: 'a2', severity: 'critical', firedAt: '2024-01-01T00:00:00.000Z' }),
      makeAlert({ id: 'a3', severity: 'warning', firedAt: '2024-01-01T00:00:00.000Z' }),
    ]
    const result = filterAndSortAlerts(alerts, '', 'all')
    expect(result.map(a => a.id)).toEqual(['a2', 'a3', 'a1'])
  })

  it('sorts by most recent firedAt within the same severity', () => {
    const alerts = [
      makeAlert({ id: 'older', severity: 'warning', firedAt: '2024-01-01T00:00:00.000Z' }),
      makeAlert({ id: 'newer', severity: 'warning', firedAt: '2024-06-01T00:00:00.000Z' }),
    ]
    const result = filterAndSortAlerts(alerts, '', 'all')
    expect(result.map(a => a.id)).toEqual(['newer', 'older'])
  })

  it('does not mutate the input array', () => {
    const alerts = [makeAlert({ id: 'a1', severity: 'info' }), makeAlert({ id: 'a2', severity: 'critical' })]
    const original = [...alerts]
    filterAndSortAlerts(alerts, '', 'all')
    expect(alerts).toEqual(original)
  })
})
