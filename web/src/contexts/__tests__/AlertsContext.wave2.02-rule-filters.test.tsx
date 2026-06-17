import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { alertsTestState, wrapper, makeAlert, makeRule, flushTimers, mockStartMission, mockUseDemoMode, mockSendNotificationWithDeepLink, type Alert, type AlertRule } from './AlertsContext.test-helpers'
import { useAlertsContext } from '../AlertsContext'

describe('AlertsContext — additional coverage', () => {
  // ── A5. Disabled rules are skipped ───────────────────────────────────

  it('evaluateConditions skips disabled rules', async () => {
    const rule: AlertRule = {
      id: 'disabled-rule',
      name: 'Disabled GPU',
      description: '',
      enabled: false,
      condition: { type: 'gpu_usage', threshold: 1 }, // very low threshold
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

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

    // No alert because the rule is disabled
    const alerts = result.current.alerts.filter(a => a.ruleId === 'disabled-rule')
    expect(alerts.length).toBe(0)
  })

  // ── A6. Pod crash with namespace filter ──────────────────────────────

  it('evaluateConditions: pod_crash respects namespace filter in rule', async () => {
    const rule: AlertRule = {
      id: 'pod-ns-rule',
      name: 'Pod Crash NS',
      description: '',
      enabled: true,
      condition: { type: 'pod_crash', threshold: 3, namespaces: ['production'] },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    alertsTestState.mockMCPData = {
      gpuNodes: [],
      podIssues: [
        { name: 'pod-in-prod', cluster: 'prod', namespace: 'production', status: 'CrashLoopBackOff', restarts: 10 },
        { name: 'pod-in-dev', cluster: 'prod', namespace: 'development', status: 'CrashLoopBackOff', restarts: 10 },
      ],
      clusters: [{ name: 'prod', healthy: true, nodeCount: 3 }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers()

    await act(async () => {
      result.current.evaluateConditions()
    })

    const podAlerts = result.current.alerts.filter(a => a.ruleId === 'pod-ns-rule')
    // Only the pod in 'production' namespace should trigger
    expect(podAlerts.length).toBe(1)
    expect(podAlerts[0].resource).toBe('pod-in-prod')
  })

  // ── A7. GPU usage with cluster filter ────────────────────────────────

  it('evaluateConditions: gpu_usage respects cluster filter in rule', async () => {
    const rule: AlertRule = {
      id: 'gpu-cluster-rule',
      name: 'GPU Usage Filtered',
      description: '',
      enabled: true,
      condition: { type: 'gpu_usage', threshold: 80, clusters: ['target-cluster'] },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    alertsTestState.mockMCPData = {
      gpuNodes: [
        { cluster: 'target-cluster', gpuCount: 10, gpuAllocated: 9 },
        { cluster: 'other-cluster', gpuCount: 10, gpuAllocated: 9 },
      ],
      podIssues: [],
      clusters: [
        { name: 'target-cluster', healthy: true, nodeCount: 1 },
        { name: 'other-cluster', healthy: true, nodeCount: 1 },
      ],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers()

    await act(async () => {
      result.current.evaluateConditions()
    })

    const gpuAlerts = result.current.alerts.filter(a => a.ruleId === 'gpu-cluster-rule')
    // Only target-cluster should trigger
    expect(gpuAlerts.length).toBe(1)
    expect(gpuAlerts[0].cluster).toBe('target-cluster')
  })

  // ── A8. GPU usage skips clusters with zero GPUs ──────────────────────

  it('evaluateConditions: gpu_usage skips clusters with no GPUs', async () => {
    const rule: AlertRule = {
      id: 'gpu-zero-rule',
      name: 'GPU Zero',
      description: '',
      enabled: true,
      condition: { type: 'gpu_usage', threshold: 50 },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    alertsTestState.mockMCPData = {
      gpuNodes: [], // no GPU nodes
      podIssues: [],
      clusters: [{ name: 'cpu-only', healthy: true, nodeCount: 3 }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers()

    await act(async () => {
      result.current.evaluateConditions()
    })

    // No alert because totalGPUs is 0
    const alerts = result.current.alerts.filter(a => a.ruleId === 'gpu-zero-rule')
    expect(alerts.length).toBe(0)
  })

})
