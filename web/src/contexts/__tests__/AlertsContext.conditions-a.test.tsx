import React from 'react'
/**
 * AlertsContext Tests
 *
 * Exercises the AlertsProvider, useAlertsContext hook, rule CRUD,
 * alert lifecycle (create/acknowledge/resolve/delete), condition
 * evaluation for every supported condition type, deduplication,
 * localStorage persistence, quota-exceeded handling, AI diagnosis,
 * demo-mode cleanup, notification sending, and stats computation.
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
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: vi.fn(() => false),
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

// Stub the lazy-loaded AlertsDataFetcher — calls onData with injected MCP data
// The `mockMCPData` variable is written by individual tests before rendering.
let mockMCPData: {
  gpuNodes: Array<{ cluster: string; gpuCount: number; gpuAllocated: number }>
  podIssues: Array<{ name: string; cluster?: string; namespace?: string; status?: string; restarts?: number; reason?: string; issues?: string[] }>
  clusters: Array<{ name: string; healthy?: boolean; reachable?: boolean; nodeCount?: number; server?: string; errorType?: string; errorMessage?: string; lastSeen?: string; issues?: string[] }>
  isLoading: boolean
  error: string | null
} = { gpuNodes: [], podIssues: [], clusters: [], isLoading: false, error: null }

vi.mock('../AlertsDataFetcher', () => ({
  __esModule: true,
  default: ({ onData }: { onData: (d: typeof mockMCPData) => void }) => {
     
    const { useEffect } = require('react')
    useEffect(() => { onData(mockMCPData) }, [onData])
    return null
  },
}))

// ── Import after mocks ────────────────────────────────────────────────────

import { AlertsProvider, useAlertsContext } from '../AlertsContext'
import type { AlertRule, Alert } from '../../types/alerts'

// ── Helpers ────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: ReactNode }) {
  return <AlertsProvider>{children}</AlertsProvider>
}

/** Create a minimal AlertRule with sensible defaults. */
function makeRule(overrides: Partial<AlertRule> = {}): Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: overrides.name ?? 'Test Rule',
    description: overrides.description ?? 'A test rule',
    enabled: overrides.enabled ?? true,
    condition: overrides.condition ?? { type: 'gpu_usage', threshold: 90 },
    severity: overrides.severity ?? 'warning',
    channels: overrides.channels ?? [{ type: 'browser', enabled: true, config: {} }],
    aiDiagnose: overrides.aiDiagnose ?? false,
  }
}

/** Flush microtasks and deferred MCP updates after render/evaluation. */
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
  // Suppress console.error/warn noise from storage and notification code
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'debug').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})


describe('AlertsContext — additional coverage (memory, cert, dns)', () => {
  // ── A1. Memory pressure condition ────────────────────────────────────

  it('evaluateConditions: memory_pressure fires alert for MemoryPressure issue', async () => {
    const rule: AlertRule = {
      id: 'mp-rule',
      name: 'Memory Pressure',
      description: '',
      enabled: true,
      condition: { type: 'memory_pressure' },
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
      clusters: [{ name: 'mem-cluster', healthy: true, nodeCount: 3, issues: ['MemoryPressure on worker-2'] }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers()

    await act(async () => {
      result.current.evaluateConditions()
    })

    const mpAlerts = result.current.alerts.filter(a => a.ruleId === 'mp-rule')
    expect(mpAlerts.length).toBe(1)
    expect(mpAlerts[0].message).toContain('MemoryPressure')
    expect(mpAlerts[0].cluster).toBe('mem-cluster')
  })

  it('evaluateConditions: memory_pressure auto-resolves when issue clears', async () => {
    const rule: AlertRule = {
      id: 'mp-resolve',
      name: 'Memory Pressure',
      description: '',
      enabled: true,
      condition: { type: 'memory_pressure' },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    const firingAlert: Alert = {
      id: 'mp-firing',
      ruleId: 'mp-resolve',
      ruleName: 'Memory Pressure',
      severity: 'critical',
      status: 'firing',
      message: 'MemoryPressure on worker-2',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
      cluster: 'mem-cluster',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([firingAlert]))

    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'mem-cluster', healthy: true, nodeCount: 3, issues: [] }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers()

    await act(async () => {
      result.current.evaluateConditions()
    })

    const resolved = result.current.alerts.find(a => a.id === 'mp-firing')
    expect(resolved?.status).toBe('resolved')
  })

  // ── A2. Certificate error condition ──────────────────────────────────

  it('evaluateConditions: certificate_error fires alert for cert errors', async () => {
    const rule: AlertRule = {
      id: 'cert-rule',
      name: 'Certificate Error',
      description: '',
      enabled: true,
      condition: { type: 'certificate_error' },
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
      clusters: [{ name: 'cert-cluster', healthy: false, nodeCount: 1, errorType: 'certificate', errorMessage: 'x509: certificate expired', server: 'https://cert-cluster:6443' }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers()

    await act(async () => {
      result.current.evaluateConditions()
    })

    const certAlerts = result.current.alerts.filter(a => a.ruleId === 'cert-rule')
    expect(certAlerts.length).toBe(1)
    expect(certAlerts[0].message).toContain('Certificate error')
    expect(certAlerts[0].message).toContain('x509: certificate expired')
  })

  it('evaluateConditions: certificate_error auto-resolves when cert is valid', async () => {
    const rule: AlertRule = {
      id: 'cert-resolve',
      name: 'Certificate Error',
      description: '',
      enabled: true,
      condition: { type: 'certificate_error' },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    const firingAlert: Alert = {
      id: 'cert-firing',
      ruleId: 'cert-resolve',
      ruleName: 'Certificate Error',
      severity: 'critical',
      status: 'firing',
      message: 'cert error',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
      cluster: 'cert-cluster',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([firingAlert]))

    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'cert-cluster', healthy: true, nodeCount: 1 }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers()

    await act(async () => {
      result.current.evaluateConditions()
    })

    const resolved = result.current.alerts.find(a => a.id === 'cert-firing')
    expect(resolved?.status).toBe('resolved')
  })

  // ── A3. Cluster unreachable condition ────────────────────────────────

  it('evaluateConditions: cluster_unreachable fires alert for unreachable cluster', async () => {
    const rule: AlertRule = {
      id: 'cu-rule',
      name: 'Cluster Unreachable',
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
      clusters: [{ name: 'dead-cluster', healthy: false, reachable: false, nodeCount: 0, errorType: 'timeout', errorMessage: 'dial timeout', server: 'https://dead:6443', lastSeen: '5 minutes ago' }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers()

    await act(async () => {
      result.current.evaluateConditions()
    })

    const cuAlerts = result.current.alerts.filter(a => a.ruleId === 'cu-rule')
    expect(cuAlerts.length).toBe(1)
    expect(cuAlerts[0].message).toContain('connection timed out')
  })

  it('evaluateConditions: cluster_unreachable auto-resolves when cluster becomes reachable', async () => {
    const rule: AlertRule = {
      id: 'cu-resolve',
      name: 'Cluster Unreachable',
      description: '',
      enabled: true,
      condition: { type: 'cluster_unreachable' },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    const firingAlert: Alert = {
      id: 'cu-firing',
      ruleId: 'cu-resolve',
      ruleName: 'Cluster Unreachable',
      severity: 'critical',
      status: 'firing',
      message: 'unreachable',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
      cluster: 'dead-cluster',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([firingAlert]))

    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'dead-cluster', healthy: true, reachable: true, nodeCount: 3 }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers()

    await act(async () => {
      result.current.evaluateConditions()
    })

    const resolved = result.current.alerts.find(a => a.id === 'cu-firing')
    expect(resolved?.status).toBe('resolved')
  })

  // ── A4. DNS failure condition ────────────────────────────────────────

  it('evaluateConditions: dns_failure fires alert for unhealthy CoreDNS pods', async () => {
    const rule: AlertRule = {
      id: 'dns-rule',
      name: 'DNS Failure',
      description: '',
      enabled: true,
      condition: { type: 'dns_failure' },
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
      podIssues: [
        { name: 'coredns-abc123', cluster: 'dns-cluster', namespace: 'kube-system', status: 'CrashLoopBackOff', restarts: 5, issues: ['OOMKilled'] },
      ],
      clusters: [{ name: 'dns-cluster', healthy: true, nodeCount: 3 }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await flushTimers()

    await act(async () => {
      result.current.evaluateConditions()
    })

    const dnsAlerts = result.current.alerts.filter(a => a.ruleId === 'dns-rule')
    expect(dnsAlerts.length).toBe(1)
    expect(dnsAlerts[0].message).toContain('DNS failure')
    expect(dnsAlerts[0].message).toContain('CoreDNS')
  })

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

    mockMCPData = {
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
})
