import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { alertsTestState, wrapper, makeAlert, makeRule, flushTimers, mockStartMission, mockUseDemoMode, mockSendNotificationWithDeepLink, type Alert, type AlertRule } from './AlertsContext.test-helpers'
import { useAlertsContext } from '../AlertsContext'

describe('dedup and shallowEqual edge cases via context behavior', () => {
  it('dedup treats undefined cluster the same as empty string for non-pod alerts', () => {
    const rule: AlertRule = {
      id: 'nr-rule',
      name: 'Node Not Ready',
      description: '',
      enabled: true,
      condition: { type: 'node_not_ready' },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const a1 = makeAlert({
      id: 'nr-1',
      ruleId: 'nr-rule',
      status: 'firing',
      cluster: undefined,
      firedAt: '2024-01-01T00:00:00Z',
    })
    const a2 = makeAlert({
      id: 'nr-2',
      ruleId: 'nr-rule',
      status: 'firing',
      cluster: undefined,
      firedAt: '2025-01-01T00:00:00Z',
    })

    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([a1, a2]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Both have undefined cluster + same ruleId for a non-pod_crash type
    // → dedup key is "nr-rule::" for both → only the newer survives
    expect(result.current.activeAlerts.length).toBe(1)
    expect(result.current.activeAlerts[0].id).toBe('nr-2')
  })

  it('separates alerts for different clusters even with same ruleId', () => {
    const rule: AlertRule = {
      id: 'dp-rule',
      name: 'Disk Pressure',
      description: '',
      enabled: true,
      condition: { type: 'disk_pressure' },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const a1 = makeAlert({
      id: 'dp-1',
      ruleId: 'dp-rule',
      status: 'firing',
      cluster: 'cluster-alpha',
      firedAt: '2025-01-01T00:00:00Z',
    })
    const a2 = makeAlert({
      id: 'dp-2',
      ruleId: 'dp-rule',
      status: 'firing',
      cluster: 'cluster-beta',
      firedAt: '2025-01-01T00:00:00Z',
    })

    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([a1, a2]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Different clusters → different dedup keys → both survive
    expect(result.current.activeAlerts.length).toBe(2)
  })
})

// ── isEvaluating state ──────────────────────────────────────────────────────

describe('evaluateConditions', () => {
  it('is callable and does not throw when no data is loaded', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(() => {
      act(() => {
        result.current.evaluateConditions()
      })
    }).not.toThrow()
  })

  it('only evaluates enabled rules', () => {
    // Disable all preset rules by persisting them as disabled
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      for (const rule of result.current.rules) {
        if (rule.enabled) {
          result.current.toggleRule(rule.id)
        }
      }
    })

    // Evaluate with all rules disabled - should produce no new alerts
    const alertsBefore = result.current.alerts.length
    act(() => {
      result.current.evaluateConditions()
    })

    expect(result.current.alerts.length).toBe(alertsBefore)
  })

  it('prevents concurrent evaluation (re-entrant guard)', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Calling evaluateConditions twice in the same tick should not fail
    act(() => {
      result.current.evaluateConditions()
      result.current.evaluateConditions() // second call should be a no-op
    })

    // After the act block, isEvaluating should be false (both completed)
    expect(result.current.isEvaluating).toBe(false)
  })
})

// ── loadFromStorage error handling ──────────────────────────────────────────
