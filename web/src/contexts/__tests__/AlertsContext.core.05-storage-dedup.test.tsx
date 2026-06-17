import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { alertsTestState, wrapper, makeAlert, makeRule, flushTimers, mockStartMission, mockUseDemoMode, mockSendNotificationWithDeepLink, type Alert, type AlertRule } from './AlertsContext.test-helpers'
import { useAlertsContext } from '../AlertsContext'

describe('loadFromStorage error handling', () => {
  it('returns default value when localStorage contains corrupt JSON', () => {
    localStorage.setItem('kc_alerts', 'not valid json {{{')

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Should fall back to empty array
    expect(result.current.alerts.length).toBe(0)

    errorSpy.mockRestore()
  })

  it('returns default value when rules contain corrupt JSON', () => {
    localStorage.setItem('kc_alert_rules', 'corrupted!!!!')

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Should fall back to preset rules (empty stored = load presets)
    expect(result.current.rules.length).toBeGreaterThan(0)

    errorSpy.mockRestore()
  })
})

// ── Notification dedup key persistence ──────────────────────────────────────

describe('notification dedup key persistence', () => {
  it('loads notification dedup keys from localStorage', () => {
    // Seed notified alert keys
    const now = Date.now()
    const keys: [string, number][] = [['rule1::cluster1', now]]
    localStorage.setItem('kc-notified-alert-keys', JSON.stringify(keys))

    // Should not throw when loading
    expect(() => {
      renderHook(() => useAlertsContext(), { wrapper })
    }).not.toThrow()
  })

  it('handles corrupt notification dedup data gracefully', () => {
    localStorage.setItem('kc-notified-alert-keys', 'not json!!!')

    // Should not throw
    expect(() => {
      renderHook(() => useAlertsContext(), { wrapper })
    }).not.toThrow()
  })
})

// ── Alert deduplication ─────────────────────────────────────────────────────

describe('alert deduplication', () => {
  it('deduplicates pod_crash alerts by (ruleId, cluster, resource)', () => {
    // Two pod_crash alerts for the same pod should keep only the most recent
    const rule: AlertRule = {
      id: 'pod-rule',
      name: 'Pod Crash',
      description: '',
      enabled: true,
      condition: { type: 'pod_crash', threshold: 5 },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const older = makeAlert({
      id: 'pod-old',
      ruleId: 'pod-rule',
      status: 'firing',
      cluster: 'c1',
      resource: 'my-pod-1',
      firedAt: '2024-01-01T00:00:00Z',
    })
    const newer = makeAlert({
      id: 'pod-new',
      ruleId: 'pod-rule',
      status: 'firing',
      cluster: 'c1',
      resource: 'my-pod-1',
      firedAt: '2025-01-01T00:00:00Z',
    })

    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([older, newer]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // activeAlerts should deduplicate, keeping the newer one
    expect(result.current.activeAlerts.length).toBe(1)
    expect(result.current.activeAlerts[0].id).toBe('pod-new')
  })

  it('deduplicates cluster-level alerts by (ruleId, cluster) only', () => {
    const rule: AlertRule = {
      id: 'gpu-rule',
      name: 'GPU Usage',
      description: '',
      enabled: true,
      condition: { type: 'gpu_usage', threshold: 90 },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const alert1 = makeAlert({
      id: 'gpu-1',
      ruleId: 'gpu-rule',
      status: 'firing',
      cluster: 'cluster-a',
      resource: 'nvidia.com/gpu',
      firedAt: '2024-06-01T00:00:00Z',
    })
    const alert2 = makeAlert({
      id: 'gpu-2',
      ruleId: 'gpu-rule',
      status: 'firing',
      cluster: 'cluster-a',
      resource: 'nvidia.com/gpu-updated',
      firedAt: '2025-01-01T00:00:00Z',
    })

    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([alert1, alert2]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // For gpu_usage (non-pod_crash), dedup by (ruleId, cluster) ignoring resource
    expect(result.current.activeAlerts.length).toBe(1)
    expect(result.current.activeAlerts[0].id).toBe('gpu-2') // newer
  })

  it('keeps pod_crash alerts for different pods as separate entries', () => {
    const rule: AlertRule = {
      id: 'pod-rule',
      name: 'Pod Crash',
      description: '',
      enabled: true,
      condition: { type: 'pod_crash', threshold: 5 },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const pod1 = makeAlert({
      id: 'pod-a',
      ruleId: 'pod-rule',
      status: 'firing',
      cluster: 'c1',
      resource: 'pod-alpha',
      firedAt: '2025-01-01T00:00:00Z',
    })
    const pod2 = makeAlert({
      id: 'pod-b',
      ruleId: 'pod-rule',
      status: 'firing',
      cluster: 'c1',
      resource: 'pod-beta',
      firedAt: '2025-01-01T00:00:00Z',
    })

    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([pod1, pod2]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Different resources = different dedup keys for pod_crash
    expect(result.current.activeAlerts.length).toBe(2)
  })
})

// ── saveToStorage error handling ────────────────────────────────────────────
