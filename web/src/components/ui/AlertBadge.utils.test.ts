import { describe, it, expect } from 'vitest'
import { filterAndSortAlerts } from './AlertBadge.utils'
import type { Alert, AlertSeverity } from '../../types/alerts'

function mkAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: overrides.id ?? 'a1',
    ruleId: overrides.ruleId ?? 'r1',
    ruleName: overrides.ruleName ?? 'HighCPU',
    severity: overrides.severity ?? ('warning' as AlertSeverity),
    status: overrides.status ?? 'firing',
    message: overrides.message ?? 'CPU is high',
    details: overrides.details ?? {},
    cluster: overrides.cluster,
    firedAt: overrides.firedAt ?? '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('filterAndSortAlerts', () => {
  it('returns all alerts sorted by severity then recency when no filter', () => {
    const alerts: Alert[] = [
      mkAlert({ id: '1', severity: 'info', firedAt: '2026-01-03T00:00:00Z' }),
      mkAlert({ id: '2', severity: 'critical', firedAt: '2026-01-01T00:00:00Z' }),
      mkAlert({ id: '3', severity: 'warning', firedAt: '2026-01-02T00:00:00Z' }),
      mkAlert({ id: '4', severity: 'critical', firedAt: '2026-01-05T00:00:00Z' }),
    ]

    const result = filterAndSortAlerts(alerts, '', 'all')

    expect(result.map(a => a.id)).toEqual(['4', '2', '3', '1'])
  })

  it('does not mutate the input array', () => {
    const alerts: Alert[] = [
      mkAlert({ id: '1', severity: 'info' }),
      mkAlert({ id: '2', severity: 'critical' }),
    ]
    const original = [...alerts]

    filterAndSortAlerts(alerts, '', 'all')

    expect(alerts).toEqual(original)
  })

  it('filters by case-insensitive query on ruleName', () => {
    const alerts: Alert[] = [
      mkAlert({ id: '1', ruleName: 'HighCPU', message: 'x' }),
      mkAlert({ id: '2', ruleName: 'LowMemory', message: 'y' }),
    ]

    const result = filterAndSortAlerts(alerts, 'cpu', 'all')

    expect(result.map(a => a.id)).toEqual(['1'])
  })

  it('filters by query on message', () => {
    const alerts: Alert[] = [
      mkAlert({ id: '1', message: 'disk full on node-A' }),
      mkAlert({ id: '2', message: 'memory pressure' }),
    ]

    const result = filterAndSortAlerts(alerts, 'DISK', 'all')

    expect(result.map(a => a.id)).toEqual(['1'])
  })

  it('filters by query on cluster', () => {
    const alerts: Alert[] = [
      mkAlert({ id: '1', cluster: 'prod-east' }),
      mkAlert({ id: '2', cluster: 'staging' }),
      mkAlert({ id: '3' }), // undefined cluster
    ]

    const result = filterAndSortAlerts(alerts, 'prod', 'all')

    expect(result.map(a => a.id)).toEqual(['1'])
  })

  it('treats undefined cluster as empty for query matching without throwing', () => {
    const alerts: Alert[] = [mkAlert({ id: '1', ruleName: 'X', message: 'y' })]

    expect(() => filterAndSortAlerts(alerts, 'anything', 'all')).not.toThrow()
    expect(filterAndSortAlerts(alerts, 'anything', 'all')).toEqual([])
  })

  it('trims whitespace-only query and treats it as no query', () => {
    const alerts: Alert[] = [
      mkAlert({ id: '1', ruleName: 'A', message: 'foo' }),
      mkAlert({ id: '2', ruleName: 'B', message: 'bar' }),
    ]

    const result = filterAndSortAlerts(alerts, '   ', 'all')

    expect(result.map(a => a.id).sort()).toEqual(['1', '2'])
  })

  it('filters by severity when severityFilter is not "all"', () => {
    const alerts: Alert[] = [
      mkAlert({ id: '1', severity: 'critical' }),
      mkAlert({ id: '2', severity: 'warning' }),
      mkAlert({ id: '3', severity: 'info' }),
      mkAlert({ id: '4', severity: 'critical' }),
    ]

    const result = filterAndSortAlerts(alerts, '', 'critical')

    expect(result.map(a => a.id).sort()).toEqual(['1', '4'])
  })

  it('combines query and severity filters (AND)', () => {
    const alerts: Alert[] = [
      mkAlert({ id: '1', severity: 'critical', ruleName: 'DiskFull' }),
      mkAlert({ id: '2', severity: 'warning', ruleName: 'DiskFull' }),
      mkAlert({ id: '3', severity: 'critical', ruleName: 'CPU' }),
    ]

    const result = filterAndSortAlerts(alerts, 'disk', 'critical')

    expect(result.map(a => a.id)).toEqual(['1'])
  })

  it('sorts by severity ascending order (critical=0 first)', () => {
    const alerts: Alert[] = [
      mkAlert({ id: 'info', severity: 'info', firedAt: '2026-01-10T00:00:00Z' }),
      mkAlert({ id: 'warn', severity: 'warning', firedAt: '2026-01-10T00:00:00Z' }),
      mkAlert({ id: 'crit', severity: 'critical', firedAt: '2026-01-10T00:00:00Z' }),
    ]

    const result = filterAndSortAlerts(alerts, '', 'all')

    expect(result.map(a => a.id)).toEqual(['crit', 'warn', 'info'])
  })

  it('sorts by recency (most recent first) within the same severity', () => {
    const alerts: Alert[] = [
      mkAlert({ id: 'old', severity: 'warning', firedAt: '2026-01-01T00:00:00Z' }),
      mkAlert({ id: 'new', severity: 'warning', firedAt: '2026-06-01T00:00:00Z' }),
      mkAlert({ id: 'mid', severity: 'warning', firedAt: '2026-03-01T00:00:00Z' }),
    ]

    const result = filterAndSortAlerts(alerts, '', 'all')

    expect(result.map(a => a.id)).toEqual(['new', 'mid', 'old'])
  })

  it('returns empty array when nothing matches', () => {
    const alerts: Alert[] = [mkAlert({ id: '1', ruleName: 'X' })]

    expect(filterAndSortAlerts(alerts, 'nomatch', 'all')).toEqual([])
  })

  it('handles an empty alerts array', () => {
    expect(filterAndSortAlerts([], '', 'all')).toEqual([])
    expect(filterAndSortAlerts([], 'query', 'critical')).toEqual([])
  })

  it('preserves the generic subtype through filter+sort', () => {
    type MyAlert = Alert & { extra: number }
    const alerts: MyAlert[] = [
      { ...mkAlert({ id: '1', severity: 'warning' }), extra: 42 },
      { ...mkAlert({ id: '2', severity: 'critical' }), extra: 7 },
    ]

    const result = filterAndSortAlerts(alerts, '', 'all')

    expect(result[0].extra).toBe(7)
    expect(result[1].extra).toBe(42)
  })
})
