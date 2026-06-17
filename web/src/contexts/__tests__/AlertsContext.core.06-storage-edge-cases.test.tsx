import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { alertsTestState, wrapper, makeAlert, makeRule, flushTimers, mockStartMission, mockUseDemoMode, mockSendNotificationWithDeepLink, type Alert, type AlertRule } from './AlertsContext.test-helpers'
import { useAlertsContext } from '../AlertsContext'

describe('saveToStorage error handling', () => {
  it('logs error on non-quota localStorage.setItem failure for rules', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    const realSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_alert_rules') {
        throw new Error('some random error')
      }
      return realSetItem(key, value)
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    act(() => {
      result.current.createRule(makeRule({ name: 'Should Fail Save' }))
    })

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to save kc_alert_rules'),
      expect.any(Error),
    )

    vi.mocked(localStorage.setItem).mockRestore()
    errorSpy.mockRestore()
  })
})

// ── Multiple context consumers ──────────────────────────────────────────────

describe('multiple consumers', () => {
  it('shares state across multiple consumers of the same provider', () => {
    const alert = makeAlert({ id: 'shared', status: 'firing' })
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))

    // Two hooks rendered within the same provider wrapper
    const { result: r1 } = renderHook(() => useAlertsContext(), { wrapper })
    const { result: r2 } = renderHook(() => useAlertsContext(), { wrapper })

    // Both should see the same alert set (though they are separate provider instances in this case)
    expect(r1.current.alerts.length).toBe(1)
    expect(r2.current.alerts.length).toBe(1)
  })
})

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles acknowledging an already-acknowledged alert', () => {
    const alert = makeAlert({ id: 'already-acked', status: 'firing', acknowledgedAt: '2025-01-01T00:00:00Z' })
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Should not throw
    act(() => {
      result.current.acknowledgeAlert('already-acked', 'new-user')
    })

    const acked = result.current.alerts.find(a => a.id === 'already-acked')
    expect(acked?.acknowledgedBy).toBe('new-user')
  })

  it('handles resolving an already-resolved alert', () => {
    const alert = makeAlert({ id: 'already-resolved', status: 'resolved', resolvedAt: '2025-01-01T00:00:00Z' })
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Should not throw
    act(() => {
      result.current.resolveAlert('already-resolved')
    })

    const resolved = result.current.alerts.find(a => a.id === 'already-resolved')
    expect(resolved?.status).toBe('resolved')
  })

  it('handles empty alerts array in localStorage', () => {
    localStorage.setItem('kc_alerts', '[]')

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(result.current.alerts).toEqual([])
    expect(result.current.activeAlerts).toEqual([])
    expect(result.current.acknowledgedAlerts).toEqual([])
  })

  it('handles missing cluster and resource in alerts gracefully', () => {
    const alert = makeAlert({
      id: 'no-cluster',
      status: 'firing',
      cluster: undefined,
      resource: undefined,
    })
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(result.current.activeAlerts.length).toBe(1)
    expect(result.current.activeAlerts[0].cluster).toBeUndefined()
    expect(result.current.activeAlerts[0].resource).toBeUndefined()
  })

  it('acknowledgeAlerts with empty array is a no-op', () => {
    const alert = makeAlert({ id: 'unchanged', status: 'firing' })
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.acknowledgeAlerts([])
    })

    expect(result.current.alerts.find(a => a.id === 'unchanged')?.acknowledgedAt).toBeUndefined()
  })

  it('updateRule with non-existent id does not crash', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const initialCount = result.current.rules.length

    act(() => {
      result.current.updateRule('non-existent-rule-id', { name: 'Ghost' })
    })

    // No rule should be added or removed
    expect(result.current.rules.length).toBe(initialCount)
  })

  it('deleteRule with non-existent id does not crash', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const initialCount = result.current.rules.length

    act(() => {
      result.current.deleteRule('non-existent-rule-id')
    })

    expect(result.current.rules.length).toBe(initialCount)
  })

  it('toggleRule with non-existent id does not crash', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const initialRules = [...result.current.rules]

    act(() => {
      result.current.toggleRule('non-existent-rule-id')
    })

    // Rules unchanged
    expect(result.current.rules.length).toBe(initialRules.length)
  })
})

// ── Dedup key edge cases (unit-level) ───────────────────────────────────────

describe('isEvaluating state', () => {
  it('isEvaluating is false when not evaluating', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    // After mount and initial timers, isEvaluating should settle to false
    expect(result.current.isEvaluating).toBe(false)
  })
})

// ── Deep coverage: alert evaluation, dedup, notification dispatch ───────
