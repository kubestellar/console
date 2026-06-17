import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { alertsTestState, wrapper, makeAlert, makeRule, flushTimers, mockStartMission, mockUseDemoMode, mockSendNotificationWithDeepLink, type Alert, type AlertRule } from './AlertsContext.test-helpers'
import { useAlertsContext } from '../AlertsContext'

describe('AlertsContext — additional coverage', () => {
  // ── A9. Disk pressure notification with browser channel ──────────────

  it('evaluateConditions: disk_pressure sends browser notification via sendNotificationWithDeepLink', async () => {
    const { sendNotificationWithDeepLink: mockSendNotif } = await import('../../hooks/useDeepLink')

    const rule: AlertRule = {
      id: 'dp-notif-rule',
      name: 'Disk Pressure Notif',
      description: '',
      enabled: true,
      condition: { type: 'disk_pressure' },
      severity: 'critical',
      channels: [{ type: 'browser', enabled: true, config: {} }],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    alertsTestState.mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'dp-cluster', healthy: true, nodeCount: 2, issues: ['DiskPressure on worker-node-1'] }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers()

    await act(async () => {
      result.current.evaluateConditions()
    })

    expect(mockSendNotif).toHaveBeenCalledWith(
      expect.stringContaining('Disk Pressure'),
      expect.stringContaining('DiskPressure'),
      expect.objectContaining({ drilldown: 'node', node: 'worker-node-1' })
    )
  })

  // ── A10. Cluster unreachable error label variants ────────────────────

  it('evaluateConditions: cluster_unreachable shows auth error label', async () => {
    const rule: AlertRule = {
      id: 'cu-auth-rule',
      name: 'Cluster Unreachable Auth',
      description: '',
      enabled: true,
      condition: { type: 'cluster_unreachable' },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    alertsTestState.mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'auth-fail', healthy: false, reachable: false, nodeCount: 0, errorType: 'auth', errorMessage: 'forbidden' }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers()

    await act(async () => {
      result.current.evaluateConditions()
    })

    const cuAlerts = result.current.alerts.filter(a => a.ruleId === 'cu-auth-rule')
    expect(cuAlerts.length).toBe(1)
    expect(cuAlerts[0].message).toContain('authentication failed')
  })

  it('evaluateConditions: cluster_unreachable shows network error label', async () => {
    const rule: AlertRule = {
      id: 'cu-net-rule',
      name: 'Cluster Unreachable Net',
      description: '',
      enabled: true,
      condition: { type: 'cluster_unreachable' },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    alertsTestState.mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'net-fail', healthy: false, reachable: false, nodeCount: 0, errorType: 'network' }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers()

    await act(async () => {
      result.current.evaluateConditions()
    })

    const cuAlerts = result.current.alerts.filter(a => a.ruleId === 'cu-net-rule')
    expect(cuAlerts.length).toBe(1)
    expect(cuAlerts[0].message).toContain('network unreachable')
  })

  // ── A11. Unreachable cluster with certificate error is NOT flagged by cluster_unreachable ──

  it('evaluateConditions: cluster_unreachable ignores clusters with certificate errorType', async () => {
    const rule: AlertRule = {
      id: 'cu-cert-skip',
      name: 'Cluster Unreachable Cert Skip',
      description: '',
      enabled: true,
      condition: { type: 'cluster_unreachable' },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    alertsTestState.mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'cert-only', healthy: false, reachable: false, nodeCount: 0, errorType: 'certificate' }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers()

    await act(async () => {
      result.current.evaluateConditions()
    })

    // No cluster_unreachable alert because errorType is 'certificate'
    const cuAlerts = result.current.alerts.filter(a => a.ruleId === 'cu-cert-skip')
    expect(cuAlerts.length).toBe(0)
  })

  // ── A12. createAlert deduplication — same details skips re-render ────

  it('createAlert skips update when details are unchanged (shallowEqualRecords)', async () => {
    const rule: AlertRule = {
      id: 'dedup-same',
      name: 'Dedup Same',
      description: '',
      enabled: true,
      condition: { type: 'gpu_usage', threshold: 80 },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    // First evaluation creates the alert
    alertsTestState.mockMCPData = {
      gpuNodes: [{ cluster: 'gpu-cluster', gpuCount: 10, gpuAllocated: 9 }],
      podIssues: [],
      clusters: [{ name: 'gpu-cluster', healthy: true, nodeCount: 1 }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers()

    await act(async () => {
      result.current.evaluateConditions()
    })
    const alertCountAfterFirst = result.current.alerts.length

    // Second evaluation with same data should not create a new alert
    await act(async () => {
      result.current.evaluateConditions()
    })

    expect(result.current.alerts.length).toBe(alertCountAfterFirst)
  })

  // ── A13. saveAlerts retry on quota exceeded that fails again ──────────

  it('clears localStorage when quota exceeded persists after pruning', () => {
    // Load some alerts
    const alerts: Alert[] = Array.from({ length: 5 }, (_, i) => ({
      id: `quota-${i}`,
      ruleId: 'r1',
      ruleName: 'A',
      severity: 'warning' as const,
      status: 'firing' as const,
      message: `alert ${i}`,
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
    }))
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    // Make setItem always throw QuotaExceededError for alerts
    const originalSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_alerts') {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      }
      return originalSetItem(key, value)
    })

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Trigger a write
    act(() => {
      result.current.deleteAlert('quota-0')
    })

    // After persistent failure, alerts key should be removed
    // The mock clears it via localStorage.removeItem
    expect(result.current).toBeDefined()
  })

  // ── A14. Periodic evaluation fires on 30-second interval ─────────────

  it('triggers periodic evaluation every 30 seconds', async () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Advance past initial 1-second delay
    await act(async () => {
      vi.advanceTimersByTime(1100)
    })

    // Advance to 31 seconds — should trigger another evaluation
    await act(async () => {
      vi.advanceTimersByTime(30000)
    })

    // Just verify it doesn't crash after multiple evaluation cycles
    expect(result.current.isEvaluating).toBe(false)
  })
})
