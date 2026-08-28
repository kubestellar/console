import React from 'react'
/**
 * AlertsContext — filter and notification tests (A6–A11)
 *
 * Covers: pod_crash namespace filter, gpu_usage cluster filter,
 * gpu_usage zero-GPU skip, disk_pressure notifications,
 * cluster_unreachable error label variants, and certificate-skip logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockStartMission = vi.fn(() => 'mission-123')

vi.mock('../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: mockStartMission }),
}))

let mockIsDemoMode = false
vi.mock('../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: vi.fn(() => mockIsDemoMode),
}))

vi.mock('../../hooks/useDeepLink', () => ({
  sendNotificationWithDeepLink: vi.fn(),
}))

vi.mock('../notifications', () => ({
  shouldDispatchBrowserNotification: vi.fn(() => true),
  isClusterUnreachable: vi.fn(() => false),
  dispatchNotification: vi.fn(),
  sendNotifications: vi.fn(),
  sendBatchedNotifications: vi.fn(),
  getNotificationCooldown: vi.fn(() => 300000),
  PERSISTENT_CLUSTER_CONDITIONS: new Set(['certificate_error', 'cluster_unreachable']),
}))

vi.mock('../../lib/runbooks/builtins', () => ({
  findRunbookForCondition: vi.fn(() => undefined),
}))

vi.mock('../../lib/runbooks/executor', () => ({
  executeRunbook: vi.fn(() => Promise.resolve({ enrichedPrompt: null, stepResults: [] })),
}))

vi.mock('../../lib/utils/concurrency', () => ({
  settledWithConcurrency: vi.fn((fns: (() => Promise<unknown>)[]) =>
    Promise.allSettled(fns.map(fn => fn()))
  ),
}))

let mockMCPData: {
  gpuNodes: Array<{ cluster: string; gpuCount: number; gpuAllocated: number }>
  podIssues: Array<{ name: string; cluster?: string; namespace?: string; status?: string; restarts?: number; reason?: string; issues?: string[] }>
  clusters: Array<{ name: string; healthy?: boolean; reachable?: boolean; nodeCount?: number; server?: string; errorType?: string; errorMessage?: string; lastSeen?: string; issues?: string[] }>
  isLoading: boolean
  error: string | null
} = { gpuNodes: [], podIssues: [], clusters: [], isLoading: false, error: null }

vi.mock('../AlertsDataFetcher', () => ({
  __esModule: true,
  default: function MockAlertsDataFetcher({ onData }: { onData: (d: typeof mockMCPData) => void }) {
    React.useEffect(() => { onData(mockMCPData) }, [onData])
    return null
  },
}))

// ── Import after mocks ────────────────────────────────────────────────────

import { AlertsProvider, useAlertsContext } from '../AlertsContext'
import type { AlertRule } from '../../types/alerts'

// ── Helpers ────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: ReactNode }) {
  return <AlertsProvider>{children}</AlertsProvider>
}

const MCP_DATA_FLUSH_MS = 20

async function flushTimers() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(MCP_DATA_FLUSH_MS)
    await Promise.resolve()
    await Promise.resolve()
  })
}

// ── Setup / Teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  localStorage.clear()
  mockIsDemoMode = false
  mockMCPData = { gpuNodes: [], podIssues: [], clusters: [], isLoading: false, error: null }
  mockStartMission.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'debug').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ═══════════════════════════════════════════════════════════════════════════
// Tests — filters and notifications (A6–A11)
// ═══════════════════════════════════════════════════════════════════════════

describe('AlertsContext — filters and notifications (A6–A11)', () => {
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

    mockMCPData = {
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

    mockMCPData = {
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

    mockMCPData = {
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

    mockMCPData = {
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

    mockMCPData = {
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

    mockMCPData = {
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

    mockMCPData = {
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
})
