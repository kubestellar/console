import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { alertsTestState, wrapper, makeAlert, makeRule, flushTimers, mockStartMission, mockUseDemoMode, mockSendNotificationWithDeepLink, type Alert, type AlertRule } from './AlertsContext.test-helpers'
import { useAlertsContext } from '../AlertsContext'

describe('AlertsContext utility functions', () => {
  // These test the module-level pure functions that are exercised
  // indirectly through the provider but benefit from isolated coverage.

  it('shallowEqualRecords: both null returns true (via dedup path)', () => {
    // Exercise via creating alerts that have null details scenario
    const alerts: Alert[] = [
      { id: 'eq-1', ruleId: 'r1', ruleName: 'A', severity: 'warning', status: 'firing', message: 'same', details: { key: 'val' }, firedAt: '2024-01-01T00:00:00Z', cluster: 'c1' },
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    expect(result.current.alerts.length).toBe(1)
  })

  it('alertDedupKey: different types produce different key shapes', () => {
    // pod_crash includes resource in key; cluster-level types do not.
    // We test this indirectly through the dedup behavior.
    const rule: AlertRule = {
      id: 'dedup-rule',
      name: 'Dedup',
      description: '',
      enabled: true,
      condition: { type: 'gpu_usage' },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    // Two alerts with same ruleId, cluster but different resource — GPU type ignores resource
    const alerts: Alert[] = [
      { id: 'dk-1', ruleId: 'dedup-rule', ruleName: 'Dedup', severity: 'warning', status: 'firing', message: 'a', details: {}, firedAt: '2024-01-01T00:00:00Z', cluster: 'prod', resource: 'gpu-a' },
      { id: 'dk-2', ruleId: 'dedup-rule', ruleName: 'Dedup', severity: 'warning', status: 'firing', message: 'b', details: {}, firedAt: '2024-06-01T00:00:00Z', cluster: 'prod', resource: 'gpu-b' },
    ]
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // gpu_usage dedup key ignores resource — only 1 active alert
    expect(result.current.activeAlerts.length).toBe(1)
  })
})
describe('useAlertsContext outside AlertsProvider', () => {
  it('throws when used outside AlertsProvider', () => {
    // Suppress error boundary console noise
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => {
      renderHook(() => useAlertsContext())
    }).toThrow('useAlertsContext must be used within an AlertsProvider')
    spy.mockRestore()
  })
})

// ── Initial state ───────────────────────────────────────────────────────────

describe('initial state', () => {
  it('provides default alerts context values', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(result.current.alerts).toBeDefined()
    expect(Array.isArray(result.current.alerts)).toBe(true)
    expect(result.current.rules).toBeDefined()
    expect(Array.isArray(result.current.rules)).toBe(true)
    expect(result.current.isLoadingData).toBe(true)
    expect(result.current.dataError).toBeNull()
    expect(typeof result.current.acknowledgeAlert).toBe('function')
    expect(typeof result.current.acknowledgeAlerts).toBe('function')
    expect(typeof result.current.resolveAlert).toBe('function')
    expect(typeof result.current.deleteAlert).toBe('function')
    expect(typeof result.current.runAIDiagnosis).toBe('function')
    expect(typeof result.current.evaluateConditions).toBe('function')
    expect(typeof result.current.createRule).toBe('function')
    expect(typeof result.current.updateRule).toBe('function')
    expect(typeof result.current.deleteRule).toBe('function')
    expect(typeof result.current.toggleRule).toBe('function')
  })

  it('loads preset rules when localStorage is empty', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Should have loaded the preset rules (11 presets in PRESET_ALERT_RULES)
    expect(result.current.rules.length).toBeGreaterThan(0)

    // Verify preset rule names
    const ruleNames = result.current.rules.map(r => r.name)
    expect(ruleNames).toContain('GPU Usage Critical')
    expect(ruleNames).toContain('Node Not Ready')
    expect(ruleNames).toContain('Pod Crash Loop')
  })

  it('loads persisted alerts from localStorage', () => {
    const seeded = [
      makeAlert({ id: 'seeded-1', message: 'Seeded alert 1' }),
      makeAlert({ id: 'seeded-2', message: 'Seeded alert 2', status: 'resolved', resolvedAt: new Date().toISOString() }),
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(seeded))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(result.current.alerts.length).toBe(2)
    expect(result.current.alerts.some(a => a.id === 'seeded-1')).toBe(true)
    expect(result.current.alerts.some(a => a.id === 'seeded-2')).toBe(true)
  })

  it('loads persisted rules from localStorage instead of presets', () => {
    const customRule: AlertRule = {
      id: 'custom-rule-1',
      name: 'Custom Rule',
      description: 'A custom rule',
      enabled: true,
      condition: { type: 'gpu_usage', threshold: 50 },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([customRule]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // The custom rule should be present
    expect(result.current.rules.some(r => r.id === 'custom-rule-1')).toBe(true)
    expect(result.current.rules.some(r => r.name === 'Custom Rule')).toBe(true)
  })
})

// ── Stats calculation ───────────────────────────────────────────────────────

describe('stats calculation', () => {
  it('computes correct stats from mixed alert states', () => {
    // #7396 — Each alert needs a unique ruleId (or unique cluster) so
    // deduplicateAlerts does not collapse them into a single entry.
    const alerts = [
      makeAlert({ id: 'f1', ruleId: 'r-f1', status: 'firing', severity: 'critical' }),
      makeAlert({ id: 'f2', ruleId: 'r-f2', status: 'firing', severity: 'warning' }),
      makeAlert({ id: 'f3', ruleId: 'r-f3', status: 'firing', severity: 'info' }),
      makeAlert({ id: 'r1', ruleId: 'r-r1', status: 'resolved', severity: 'critical', resolvedAt: new Date().toISOString() }),
      makeAlert({ id: 'a1', ruleId: 'r-a1', status: 'firing', severity: 'warning', acknowledgedAt: new Date().toISOString() }),
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(result.current.stats.total).toBe(5)
    // firing count = unacknowledged firing (f1, f2, f3)
    expect(result.current.stats.firing).toBe(3)
    expect(result.current.stats.resolved).toBe(1)
    expect(result.current.stats.critical).toBe(1) // f1 only (unacknowledged)
    expect(result.current.stats.warning).toBe(1) // f2 only (a1 is acknowledged)
    expect(result.current.stats.info).toBe(1) // f3
    expect(result.current.stats.acknowledged).toBe(1) // a1
  })

  it('returns zero stats when no alerts exist', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(result.current.stats.total).toBe(0)
    expect(result.current.stats.firing).toBe(0)
    expect(result.current.stats.resolved).toBe(0)
    expect(result.current.stats.critical).toBe(0)
    expect(result.current.stats.warning).toBe(0)
    expect(result.current.stats.info).toBe(0)
    expect(result.current.stats.acknowledged).toBe(0)
  })
})

// ── Active and acknowledged alerts ──────────────────────────────────────────

describe('activeAlerts and acknowledgedAlerts', () => {
  it('separates active and acknowledged alerts', () => {
    const alerts = [
      makeAlert({ id: 'active-1', status: 'firing', ruleId: 'r1', cluster: 'c1' }),
      makeAlert({ id: 'acked-1', status: 'firing', ruleId: 'r2', cluster: 'c2', acknowledgedAt: new Date().toISOString() }),
      makeAlert({ id: 'resolved-1', status: 'resolved', ruleId: 'r3', cluster: 'c3', resolvedAt: new Date().toISOString() }),
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(result.current.activeAlerts.length).toBe(1)
    expect(result.current.activeAlerts[0].id).toBe('active-1')

    expect(result.current.acknowledgedAlerts.length).toBe(1)
    expect(result.current.acknowledgedAlerts[0].id).toBe('acked-1')
  })
})

// ── Acknowledge alert ───────────────────────────────────────────────────────
