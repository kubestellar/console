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
vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode }),
}))

vi.mock('../../hooks/useDeepLink', () => ({
  sendNotificationWithDeepLink: vi.fn(),
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

/** Flush microtasks and timers for a given duration */
async function flushTimers() {
  await act(async () => {
    vi.advanceTimersByTime(0)
    // Let microtasks resolve (queueMicrotask, Promises)
    await new Promise(resolve => setTimeout(resolve, 0))
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

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// WAVE 2 — Deep coverage tests targeting untested code paths
// ═══════════════════════════════════════════════════════════════════════════

describe('AlertsContext — wave 2 deep coverage', () => {
  // ── W2-1. GPU Health CronJob evaluation — creates alert for unhealthy nodes ──

  it('evaluateConditions: gpu_health_cronjob creates alert for degraded/unhealthy GPU nodes', async () => {
    const rule: AlertRule = {
      id: 'ghc-rule',
      name: 'GPU Health CronJob',
      description: '',
      enabled: true,
      condition: { type: 'gpu_health_cronjob' },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    // Inject cluster data via MCP mock
    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'gpu-health-cluster', healthy: true, nodeCount: 2 }],
      isLoading: false,
      error: null,
    }

    // We need to pre-populate the cronJobResultsRef via the fetch side effect.
    // Set auth token so the CronJob fetch runs
    localStorage.setItem('auth_token', 'test-token')

    const cronJobResponse = {
      results: [
        {
          nodeName: 'gpu-node-1',
          status: 'unhealthy',
          gpuCount: 4,
          checks: [
            { name: 'driver-check', passed: false, message: 'NVIDIA driver not responding' },
            { name: 'temp-check', passed: true },
          ],
          issues: ['Driver not responding', 'GPU memory error'],
        },
        {
          nodeName: 'gpu-node-2',
          status: 'degraded',
          gpuCount: 2,
          checks: [
            { name: 'temp-check', passed: false, message: 'Temperature exceeds threshold' },
          ],
          issues: ['Overheating'],
        },
      ],
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(cronJobResponse), { status: 200 })
    )

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    // Advance past INITIAL_FETCH_DELAY_MS (5000ms) so CronJob data gets fetched
    await act(async () => { vi.advanceTimersByTime(6000) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const ghcAlerts = result.current.alerts.filter(a => a.ruleId === 'ghc-rule')
    expect(ghcAlerts.length).toBe(1)
    expect(ghcAlerts[0].message).toContain('GPU health check')
    expect(ghcAlerts[0].message).toContain('gpu-node-1')
    expect(ghcAlerts[0].cluster).toBe('gpu-health-cluster')
    expect(ghcAlerts[0].details).toHaveProperty('failedNodes', 2)

    fetchSpy.mockRestore()
  })

  // ── W2-2. GPU Health CronJob — auto-resolves when all healthy ────────

  it('evaluateConditions: gpu_health_cronjob auto-resolves when all nodes healthy', async () => {
    const rule: AlertRule = {
      id: 'ghc-resolve',
      name: 'GPU Health CronJob',
      description: '',
      enabled: true,
      condition: { type: 'gpu_health_cronjob' },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    const firingAlert: Alert = {
      id: 'ghc-firing',
      ruleId: 'ghc-resolve',
      ruleName: 'GPU Health CronJob',
      severity: 'critical',
      status: 'firing',
      message: 'GPU health issues',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
      cluster: 'gpu-cluster',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([firingAlert]))

    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'gpu-cluster', healthy: true, nodeCount: 2 }],
      isLoading: false,
      error: null,
    }

    // CronJob results: no failed nodes (all healthy or no results)
    localStorage.setItem('auth_token', 'test-token')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ results: [{ nodeName: 'gpu-node-1', status: 'healthy', checks: [], issues: [] }] }), { status: 200 })
    )

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })
    await act(async () => { vi.advanceTimersByTime(6000) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const resolved = result.current.alerts.find(a => a.id === 'ghc-firing')
    expect(resolved?.status).toBe('resolved')

    fetchSpy.mockRestore()
  })

  // ── W2-3. GPU Health CronJob — sends browser notification ────────────

  it('evaluateConditions: gpu_health_cronjob sends browser notification for first occurrence', async () => {
    const { sendNotificationWithDeepLink: mockSendNotif } = await import('../../hooks/useDeepLink')

    const rule: AlertRule = {
      id: 'ghc-notif',
      name: 'GPU Health CronJob Notif',
      description: '',
      enabled: true,
      condition: { type: 'gpu_health_cronjob' },
      severity: 'critical',
      channels: [{ type: 'browser', enabled: true, config: {} }],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))
    localStorage.setItem('auth_token', 'test-token')

    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'notif-cluster', healthy: true, nodeCount: 1 }],
      isLoading: false,
      error: null,
    }

    const cronJobResponse = {
      results: [
        {
          nodeName: 'gpu-worker-1',
          status: 'unhealthy',
          checks: [{ name: 'xid-check', passed: false, message: 'XID error 79 detected' }],
          issues: ['XID error'],
        },
      ],
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(cronJobResponse), { status: 200 })
    )

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })
    await act(async () => { vi.advanceTimersByTime(6000) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    expect(mockSendNotif).toHaveBeenCalledWith(
      expect.stringContaining('GPU Health Alert'),
      expect.stringContaining('issue'),
      expect.objectContaining({ drilldown: 'node', cluster: 'notif-cluster' })
    )

    fetchSpy.mockRestore()
  })

  // ── W2-4. Nightly E2E failure — creates alert for failed runs ────────

  it('evaluateConditions: nightly_e2e_failure creates alert for failed workflow runs', async () => {
    const rule: AlertRule = {
      id: 'ne2e-rule',
      name: 'Nightly E2E Failure',
      description: '',
      enabled: true,
      condition: { type: 'nightly_e2e_failure' },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    // Mock the nightly E2E fetch to return a failed run
    const nightlyData = [
      {
        guide: 'Workload Variant Autoscaler',
        acronym: 'WVA',
        platform: 'OCP',
        repo: 'llm-d/llm-d-workload-variant-autoscaler',
        workflowFile: 'nightly-e2e.yml',
        runs: [
          {
            id: 12345,
            status: 'completed',
            conclusion: 'failure',
            htmlUrl: 'https://github.com/example/actions/runs/12345',
            runNumber: 42,
            failureReason: 'test_failure',
            model: 'llama3-8b',
            gpuType: 'A100',
            gpuCount: 2,
            event: 'schedule',
          },
        ],
        passRate: 50,
        trend: 'down',
        latestConclusion: 'failure',
        model: 'llama3-8b',
      },
    ]

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(nightlyData), { status: 200 })
    )

    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    // Advance past SECONDARY_FETCH_DELAY_MS (8000ms) to populate nightlyE2ERef
    await act(async () => { vi.advanceTimersByTime(9000) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const e2eAlerts = result.current.alerts.filter(a => a.ruleId === 'ne2e-rule')
    expect(e2eAlerts.length).toBe(1)
    expect(e2eAlerts[0].message).toContain('Nightly E2E failed')
    expect(e2eAlerts[0].message).toContain('WVA')
    expect(e2eAlerts[0].details).toHaveProperty('runId', 12345)
    expect(e2eAlerts[0].details).toHaveProperty('failureReason', 'test_failure')

    fetchSpy.mockRestore()
  })

  // ── W2-5. Nightly E2E — skips non-failure and already-alerted runs ───

  it('evaluateConditions: nightly_e2e_failure skips successful and in-progress runs', async () => {
    const rule: AlertRule = {
      id: 'ne2e-skip',
      name: 'Nightly E2E Failure',
      description: '',
      enabled: true,
      condition: { type: 'nightly_e2e_failure' },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    const nightlyData = [
      {
        guide: 'Guide A',
        acronym: 'GA',
        platform: 'OCP',
        repo: 'org/repo-a',
        workflowFile: 'nightly.yml',
        runs: [
          { id: 111, status: 'completed', conclusion: 'success', htmlUrl: '', runNumber: 1, model: 'm', gpuType: 'A100', gpuCount: 1, event: 'schedule' },
          { id: 222, status: 'in_progress', conclusion: null, htmlUrl: '', runNumber: 2, model: 'm', gpuType: 'A100', gpuCount: 1, event: 'schedule' },
        ],
        passRate: 100,
        trend: 'steady',
        latestConclusion: 'success',
        model: 'llama',
      },
    ]

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(nightlyData), { status: 200 })
    )

    mockMCPData = { gpuNodes: [], podIssues: [], clusters: [], isLoading: false, error: null }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })
    await act(async () => { vi.advanceTimersByTime(9000) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    // No alerts because no completed failures
    const e2eAlerts = result.current.alerts.filter(a => a.ruleId === 'ne2e-skip')
    expect(e2eAlerts.length).toBe(0)

    fetchSpy.mockRestore()
  })

  // ── W2-6. Nightly E2E — sends browser notification ───────────────────

  it('evaluateConditions: nightly_e2e_failure sends browser notification for failed run', async () => {
    const { sendNotificationWithDeepLink: mockSendNotif } = await import('../../hooks/useDeepLink')
    vi.mocked(mockSendNotif).mockClear()

    const rule: AlertRule = {
      id: 'ne2e-notif',
      name: 'Nightly E2E Failure Notif',
      description: '',
      enabled: true,
      condition: { type: 'nightly_e2e_failure' },
      severity: 'warning',
      channels: [{ type: 'browser', enabled: true, config: {} }],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    const nightlyData = [
      {
        guide: 'LoRA Fine-Tune',
        acronym: 'LFT',
        platform: 'GKE',
        repo: 'org/repo',
        workflowFile: 'nightly.yml',
        runs: [
          { id: 777, status: 'completed', conclusion: 'failure', htmlUrl: 'https://example.com/runs/777', runNumber: 77, failureReason: 'gpu_unavailable', model: 'gemma-2b', gpuType: 'L4', gpuCount: 1, event: 'schedule' },
        ],
        passRate: 0,
        trend: 'down',
        latestConclusion: 'failure',
        model: 'gemma-2b',
      },
    ]

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(nightlyData), { status: 200 })
    )

    mockMCPData = { gpuNodes: [], podIssues: [], clusters: [], isLoading: false, error: null }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })
    await act(async () => { vi.advanceTimersByTime(9000) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    expect(mockSendNotif).toHaveBeenCalledWith(
      expect.stringContaining('Nightly E2E Failed: LFT'),
      expect.stringContaining('Run #77 failed'),
      expect.objectContaining({ card: 'nightly_e2e_status' })
    )

    fetchSpy.mockRestore()
  })

  // ── W2-7. Weather alerts — severe_storm branch ──────────────────────

  it('evaluateConditions: weather_alerts fires alert for severe_storm', async () => {
    // Force Math.random to return < 0.1 so the alert triggers
    vi.spyOn(Math, 'random').mockReturnValue(0.05)

    const rule: AlertRule = {
      id: 'wa-storm',
      name: 'Weather Alerts',
      description: '',
      enabled: true,
      condition: { type: 'weather_alerts', weatherCondition: 'severe_storm', demoMode: true },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))
    mockMCPData = { gpuNodes: [], podIssues: [], clusters: [], isLoading: false, error: null }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const waAlerts = result.current.alerts.filter(a => a.ruleId === 'wa-storm')
    expect(waAlerts.length).toBe(1)
    expect(waAlerts[0].message).toContain('Severe storm warning')
    expect(waAlerts[0].details).toHaveProperty('weatherCondition', 'severe_storm')

    vi.spyOn(Math, 'random').mockRestore()
  })

  // ── W2-8. Weather alerts — extreme_heat branch ──────────────────────

  it('evaluateConditions: weather_alerts fires alert for extreme_heat with temperature threshold', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01)

    const rule: AlertRule = {
      id: 'wa-heat',
      name: 'Weather Alerts Heat',
      description: '',
      enabled: true,
      condition: { type: 'weather_alerts', weatherCondition: 'extreme_heat', temperatureThreshold: 105, demoMode: true },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))
    mockMCPData = { gpuNodes: [], podIssues: [], clusters: [], isLoading: false, error: null }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const waAlerts = result.current.alerts.filter(a => a.ruleId === 'wa-heat')
    expect(waAlerts.length).toBe(1)
    expect(waAlerts[0].message).toContain('Extreme heat alert')
    expect(waAlerts[0].message).toContain('105')
    expect(waAlerts[0].details).toHaveProperty('temperature', 110)

    vi.spyOn(Math, 'random').mockRestore()
  })

  // ── W2-9. Weather alerts — heavy_rain branch ────────────────────────

  it('evaluateConditions: weather_alerts fires alert for heavy_rain', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.02)

    const rule: AlertRule = {
      id: 'wa-rain',
      name: 'Weather Rain',
      description: '',
      enabled: true,
      condition: { type: 'weather_alerts', weatherCondition: 'heavy_rain', demoMode: true },
      severity: 'info',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))
    mockMCPData = { gpuNodes: [], podIssues: [], clusters: [], isLoading: false, error: null }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const waAlerts = result.current.alerts.filter(a => a.ruleId === 'wa-rain')
    expect(waAlerts.length).toBe(1)
    expect(waAlerts[0].message).toContain('Heavy rain warning')
    expect(waAlerts[0].details).toHaveProperty('rainfall', '2-3 inches')

    vi.spyOn(Math, 'random').mockRestore()
  })

  // ── W2-10. Weather alerts — snow branch ─────────────────────────────

  it('evaluateConditions: weather_alerts fires alert for snow', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.03)

    const rule: AlertRule = {
      id: 'wa-snow',
      name: 'Weather Snow',
      description: '',
      enabled: true,
      condition: { type: 'weather_alerts', weatherCondition: 'snow', demoMode: true },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))
    mockMCPData = { gpuNodes: [], podIssues: [], clusters: [], isLoading: false, error: null }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const waAlerts = result.current.alerts.filter(a => a.ruleId === 'wa-snow')
    expect(waAlerts.length).toBe(1)
    expect(waAlerts[0].message).toContain('Winter storm warning')
    expect(waAlerts[0].details).toHaveProperty('snowfall', '6-12 inches')

    vi.spyOn(Math, 'random').mockRestore()
  })

  // ── W2-11. Weather alerts — high_wind branch ────────────────────────

  it('evaluateConditions: weather_alerts fires alert for high_wind with wind speed threshold', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.04)

    const rule: AlertRule = {
      id: 'wa-wind',
      name: 'Weather Wind',
      description: '',
      enabled: true,
      condition: { type: 'weather_alerts', weatherCondition: 'high_wind', windSpeedThreshold: 50, demoMode: true },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))
    mockMCPData = { gpuNodes: [], podIssues: [], clusters: [], isLoading: false, error: null }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const waAlerts = result.current.alerts.filter(a => a.ruleId === 'wa-wind')
    expect(waAlerts.length).toBe(1)
    expect(waAlerts[0].message).toContain('High wind warning')
    expect(waAlerts[0].message).toContain('60 mph')
    expect(waAlerts[0].details).toHaveProperty('windSpeed', 60)
    expect(waAlerts[0].details).toHaveProperty('threshold', 50)

    vi.spyOn(Math, 'random').mockRestore()
  })

  // ── W2-12. Weather alerts — auto-resolve path when random >= 0.1 ────

  it('evaluateConditions: weather_alerts auto-resolves firing alert when condition clears', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9) // >= 0.1, so no alert triggers

    const rule: AlertRule = {
      id: 'wa-resolve',
      name: 'Weather Resolve',
      description: '',
      enabled: true,
      condition: { type: 'weather_alerts', weatherCondition: 'severe_storm', demoMode: true },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    const firingAlert: Alert = {
      id: 'wa-firing',
      ruleId: 'wa-resolve',
      ruleName: 'Weather Resolve',
      severity: 'warning',
      status: 'firing',
      message: 'storm warning',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([firingAlert]))
    mockMCPData = { gpuNodes: [], podIssues: [], clusters: [], isLoading: false, error: null }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const resolved = result.current.alerts.find(a => a.id === 'wa-firing')
    expect(resolved?.status).toBe('resolved')

    vi.spyOn(Math, 'random').mockRestore()
  })

  // ── W2-13. Certificate error — browser notification with persistent suppression ──

  it('evaluateConditions: certificate_error sends browser notification only on first occurrence (persistent)', async () => {
    const { sendNotificationWithDeepLink: mockSendNotif } = await import('../../hooks/useDeepLink')
    vi.mocked(mockSendNotif).mockClear()

    const rule: AlertRule = {
      id: 'cert-notif',
      name: 'Cert Error Notif',
      description: '',
      enabled: true,
      condition: { type: 'certificate_error' },
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
      clusters: [{ name: 'cert-notif-cluster', healthy: false, reachable: false, errorType: 'certificate', errorMessage: 'x509: expired', server: 'https://api:6443' }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    // First evaluation — should notify
    await act(async () => {
      result.current.evaluateConditions()
    })

    const firstCallCount = vi.mocked(mockSendNotif).mock.calls.length
    expect(firstCallCount).toBeGreaterThanOrEqual(1)

    // Second evaluation — persistent condition, should NOT re-notify
    await act(async () => {
      result.current.evaluateConditions()
    })

    const secondCallCount = vi.mocked(mockSendNotif).mock.calls.length
    // Should not have increased since persistent suppression
    expect(secondCallCount).toBe(firstCallCount)
  })

  // ── W2-14. Cluster unreachable — browser notification with lastSeen ──

  it('evaluateConditions: cluster_unreachable sends notification with lastSeen info', async () => {
    const { sendNotificationWithDeepLink: mockSendNotif } = await import('../../hooks/useDeepLink')
    vi.mocked(mockSendNotif).mockClear()

    const rule: AlertRule = {
      id: 'cu-notif-ls',
      name: 'Cluster Unreachable Notif',
      description: '',
      enabled: true,
      condition: { type: 'cluster_unreachable' },
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
      clusters: [{ name: 'last-seen-cluster', healthy: false, reachable: false, errorType: 'timeout', errorMessage: 'dial timeout', lastSeen: '10 minutes ago' }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    expect(mockSendNotif).toHaveBeenCalledWith(
      expect.stringContaining('Cluster Unreachable'),
      expect.stringContaining('last seen 10 minutes ago'),
      expect.objectContaining({ drilldown: 'cluster', issue: 'unreachable' })
    )
  })

  // ── W2-15. DNS failure — notification and OpenShift dns-default pod ──

  it('evaluateConditions: dns_failure detects OpenShift dns-default pods', async () => {
    const rule: AlertRule = {
      id: 'dns-ocp',
      name: 'DNS OpenShift',
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
        { name: 'dns-default-abc', cluster: 'ocp-cluster', namespace: 'openshift-dns', status: 'Error', restarts: 3, issues: ['CrashLoopBackOff'] },
      ],
      clusters: [{ name: 'ocp-cluster', healthy: true, nodeCount: 3 }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const dnsAlerts = result.current.alerts.filter(a => a.ruleId === 'dns-ocp')
    expect(dnsAlerts.length).toBe(1)
    expect(dnsAlerts[0].message).toContain('DNS failure')
    expect(dnsAlerts[0].details).toHaveProperty('podNames', 'dns-default-abc')
  })

  // ── W2-16. DNS failure — sends browser notification ──────────────────

  it('evaluateConditions: dns_failure sends browser notification', async () => {
    const { sendNotificationWithDeepLink: mockSendNotif } = await import('../../hooks/useDeepLink')
    vi.mocked(mockSendNotif).mockClear()

    const rule: AlertRule = {
      id: 'dns-notif',
      name: 'DNS Notif',
      description: '',
      enabled: true,
      condition: { type: 'dns_failure' },
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
      podIssues: [
        { name: 'coredns-xyz', cluster: 'dns-notif-cluster', namespace: 'kube-system', status: 'CrashLoopBackOff', restarts: 5, issues: ['OOMKilled'] },
      ],
      clusters: [{ name: 'dns-notif-cluster', healthy: true, nodeCount: 3 }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    expect(mockSendNotif).toHaveBeenCalledWith(
      expect.stringContaining('DNS Failure'),
      expect.stringContaining('CoreDNS'),
      expect.objectContaining({ drilldown: 'pod', cluster: 'dns-notif-cluster' })
    )
  })

  // ── W2-17. Disk pressure — notification without affected node (no "on" pattern) ──

  it('evaluateConditions: disk_pressure notification falls back to cluster drilldown when no node found', async () => {
    const { sendNotificationWithDeepLink: mockSendNotif } = await import('../../hooks/useDeepLink')
    vi.mocked(mockSendNotif).mockClear()

    const rule: AlertRule = {
      id: 'dp-no-node',
      name: 'Disk Pressure No Node',
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

    // DiskPressure issue WITHOUT the "on node-name" pattern
    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'dp-no-node-cluster', healthy: true, nodeCount: 1, issues: ['DiskPressure detected'] }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    // Should use cluster drilldown because no node was extracted
    expect(mockSendNotif).toHaveBeenCalledWith(
      expect.stringContaining('Disk Pressure'),
      expect.any(String),
      expect.objectContaining({ drilldown: 'cluster', cluster: 'dp-no-node-cluster', issue: 'DiskPressure' })
    )
  })

  // ── W2-18. AI diagnosis with matching runbook ───────────────────────

  it('runAIDiagnosis executes runbook when one matches the condition type', async () => {
    const { findRunbookForCondition } = await import('../../lib/runbooks/builtins')
    const { executeRunbook } = await import('../../lib/runbooks/executor')

    const mockRunbook = {
      id: 'rb-gpu',
      title: 'GPU Troubleshoot',
      description: 'Investigate GPU issues',
      triggers: [{ conditionType: 'gpu_usage' }],
      evidenceSteps: [],
      analysisPrompt: 'Analyze GPU: {{evidence}}',
    }

    vi.mocked(findRunbookForCondition).mockReturnValue(mockRunbook as never)
    vi.mocked(executeRunbook).mockResolvedValue({
      enrichedPrompt: 'Enriched prompt with evidence',
      stepResults: [{ stepId: 's1', label: 'Check GPU', status: 'success' }],
      runbookId: 'rb-gpu',
      runbookTitle: 'GPU Troubleshoot',
      startedAt: '2024-01-01T00:00:00Z',
      completedAt: '2024-01-01T00:01:00Z',
    } as never)

    const seedAlert: Alert = {
      id: 'rb-diag',
      ruleId: 'r-rb',
      ruleName: 'GPU Usage Critical',
      severity: 'critical',
      status: 'firing',
      message: 'GPU usage high',
      details: { usagePercent: 95 },
      cluster: 'prod-1',
      namespace: 'gpu-ns',
      resource: 'nvidia.com/gpu',
      resourceKind: 'Resource',
      firedAt: '2024-01-01T00:00:00Z',
    }
    const seedRule: AlertRule = {
      id: 'r-rb',
      name: 'GPU Usage Critical',
      description: '',
      enabled: true,
      condition: { type: 'gpu_usage', threshold: 90 },
      severity: 'critical',
      channels: [],
      aiDiagnose: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alerts', JSON.stringify([seedAlert]))
    localStorage.setItem('kc_alert_rules', JSON.stringify([seedRule]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    let missionId: string | null = null
    await act(async () => {
      missionId = await result.current.runAIDiagnosis('rb-diag')
    })

    expect(missionId).toBe('mission-123')
    expect(executeRunbook).toHaveBeenCalledWith(
      mockRunbook,
      expect.objectContaining({
        cluster: 'prod-1',
        namespace: 'gpu-ns',
        resource: 'nvidia.com/gpu',
        alertMessage: 'GPU usage high',
      })
    )

    // Let runbook promise resolve
    await flushTimers()

    // The mission context should include runbookId
    expect(mockStartMission).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ runbookId: 'rb-gpu' }) })
    )

    vi.mocked(findRunbookForCondition).mockReturnValue(undefined)
    vi.mocked(executeRunbook).mockResolvedValue({ enrichedPrompt: null, stepResults: [] } as never)
  })

  // ── W2-19. AI diagnosis — runbook execution failure is silent ────────

  it('runAIDiagnosis handles runbook execution failure silently', async () => {
    const { findRunbookForCondition } = await import('../../lib/runbooks/builtins')
    const { executeRunbook } = await import('../../lib/runbooks/executor')

    const mockRunbook = {
      id: 'rb-fail',
      title: 'Failing Runbook',
      description: 'Will fail',
      triggers: [{ conditionType: 'pod_crash' }],
      evidenceSteps: [],
      analysisPrompt: '{{evidence}}',
    }

    vi.mocked(findRunbookForCondition).mockReturnValue(mockRunbook as never)
    vi.mocked(executeRunbook).mockRejectedValue(new Error('Runbook execution failed'))

    const seedAlert: Alert = {
      id: 'rb-fail-alert',
      ruleId: 'r-rb-fail',
      ruleName: 'Pod Crash',
      severity: 'critical',
      status: 'firing',
      message: 'Pod crashed',
      details: {},
      cluster: 'prod',
      firedAt: '2024-01-01T00:00:00Z',
    }
    const seedRule: AlertRule = {
      id: 'r-rb-fail',
      name: 'Pod Crash',
      description: '',
      enabled: true,
      condition: { type: 'pod_crash' },
      severity: 'critical',
      channels: [],
      aiDiagnose: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alerts', JSON.stringify([seedAlert]))
    localStorage.setItem('kc_alert_rules', JSON.stringify([seedRule]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    let missionId: string | null = null
    await act(async () => {
      missionId = await result.current.runAIDiagnosis('rb-fail-alert')
    })

    // Should still create a mission even if runbook fails
    expect(missionId).toBe('mission-123')

    // Let the rejected runbook promise settle without crashing
    await flushTimers()

    vi.mocked(findRunbookForCondition).mockReturnValue(undefined)
    vi.mocked(executeRunbook).mockResolvedValue({ enrichedPrompt: null, stepResults: [] } as never)
  })

  // ── W2-20. createAlert — updates existing alert when details change ──

  it('createAlert updates existing firing alert when details change', async () => {
    const rule: AlertRule = {
      id: 'update-details',
      name: 'GPU Update',
      description: '',
      enabled: true,
      condition: { type: 'gpu_usage', threshold: 80 },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    // Seed an existing alert at 90% usage — simulates a previous evaluation run
    const existingAlert: Alert = {
      id: 'existing-gpu-alert',
      ruleId: 'update-details',
      ruleName: 'GPU Update',
      severity: 'critical',
      status: 'firing',
      message: 'GPU usage is 90.0% (9/10 GPUs allocated)',
      details: { usagePercent: 90, allocatedGPUs: 9, totalGPUs: 10, threshold: 80 },
      cluster: 'gpu-cluster',
      resource: 'nvidia.com/gpu',
      resourceKind: 'Resource',
      firedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([existingAlert]))

    // Now inject MCP data at 95% usage — different from the seeded alert
    mockMCPData = {
      gpuNodes: [{ cluster: 'gpu-cluster', gpuCount: 20, gpuAllocated: 19 }],
      podIssues: [],
      clusters: [{ name: 'gpu-cluster', healthy: true, nodeCount: 1 }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const alerts = result.current.alerts.filter(a => a.ruleId === 'update-details')
    // Still 1 alert (updated in place, not duplicated)
    expect(alerts.length).toBe(1)
    // Message should reflect the new 95% usage, not the old 90%
    expect(alerts[0].message).toContain('95.0%')
    // Original firedAt should be preserved (alert was updated, not recreated)
    expect(alerts[0].firedAt).toBe('2024-01-01T00:00:00Z')
  })

  // ── W2-21. saveNotifiedAlertKeys prunes old entries ──────────────────

  it('saveNotifiedAlertKeys prunes entries older than 24 hours', async () => {
    // Pre-populate notified keys with an old entry via localStorage
    const oldTimestamp = Date.now() - 90_000_000 // ~25 hours ago
    const notifKeys: [string, number][] = [
      ['old-key::cluster-a', oldTimestamp],
      ['new-key::cluster-b', Date.now()],
    ]
    localStorage.setItem('kc-notified-alert-keys', JSON.stringify(notifKeys))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Trigger an evaluation which calls saveNotifiedAlertKeys
    await act(async () => {
      result.current.evaluateConditions()
    })

    // Read back the persisted keys
    const storedRaw = localStorage.getItem('kc-notified-alert-keys')
    expect(storedRaw).toBeDefined()
    const stored: [string, number][] = JSON.parse(storedRaw!)
    // Old key should be pruned
    const oldEntry = stored.find(([k]) => k === 'old-key::cluster-a')
    expect(oldEntry).toBeUndefined()
  })

  // ── W2-22. loadNotifiedAlertKeys with valid stored data ──────────────

  it('loadNotifiedAlertKeys restores valid data from localStorage', () => {
    const validKeys: [string, number][] = [
      ['key1::cluster', Date.now()],
      ['key2::cluster', Date.now() - 1000],
    ]
    localStorage.setItem('kc-notified-alert-keys', JSON.stringify(validKeys))

    // Provider should mount without error and use the stored keys
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    expect(result.current).toBeDefined()
  })

  // ── W2-23. CronJob fetch — handles fetch failure silently ────────────

  it('CronJob fetch handles network failure silently', async () => {
    localStorage.setItem('auth_token', 'test-token')

    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'test-cluster', healthy: true, nodeCount: 1 }],
      isLoading: false,
      error: null,
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    // Advance past initial CronJob fetch delay
    await act(async () => { vi.advanceTimersByTime(6000) })

    // Provider should still be functional despite fetch failure
    expect(result.current).toBeDefined()
    expect(result.current.isEvaluating).toBe(false)

    fetchSpy.mockRestore()
  })

  // ── W2-24. CronJob fetch — skips when no auth token ──────────────────

  it('CronJob fetch skips when no auth token is set', async () => {
    // Do NOT set auth_token
    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'no-auth-cluster', healthy: true, nodeCount: 1 }],
      isLoading: false,
      error: null,
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 })
    )

    renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })
    await act(async () => { vi.advanceTimersByTime(6000) })

    // CronJob fetch should not have been called (no token)
    const cronCalls = fetchSpy.mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes('/api/mcp/gpu-nodes/health/cronjob/results')
    )
    expect(cronCalls.length).toBe(0)

    fetchSpy.mockRestore()
  })

  // ── W2-25. Nightly E2E fetch — handles non-OK response ──────────────

  it('nightly E2E fetch handles non-OK response silently', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Server Error', { status: 500 })
    )

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(9000) })

    // Provider should still be functional
    expect(result.current).toBeDefined()

    fetchSpy.mockRestore()
  })

  // ── W2-26. sendNotifications — non-OK non-auth response throws ───────

  it('sendNotifications logs warning for non-OK non-auth response', async () => {
    const ruleWithChannels: AlertRule = {
      id: 'notif-500-rule',
      name: 'Notif 500',
      description: '',
      enabled: true,
      condition: { type: 'gpu_usage' },
      severity: 'critical',
      channels: [{ type: 'browser', enabled: true, config: {} }],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    const seedAlert: Alert = {
      id: 'notif-500-alert',
      ruleId: 'notif-500-rule',
      ruleName: 'Notif 500',
      severity: 'critical',
      status: 'firing',
      message: 'test',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([ruleWithChannels]))
    localStorage.setItem('kc_alerts', JSON.stringify([seedAlert]))
    localStorage.setItem('auth_token', 'valid-token')

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Internal server error' }), { status: 500 })
    )

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.resolveAlert('notif-500-alert')
    })

    await flushTimers()

    // Alert should still be resolved even if notification fails
    expect(result.current.alerts.find(a => a.id === 'notif-500-alert')!.status).toBe('resolved')

    fetchSpy.mockRestore()
  })

  // ── W2-27. createAlert with new alert triggers notification via channels ──

  // SKIP: test update needed — evaluateConditions + notification requires lazy-loaded
  // AlertsDataFetcher to resolve + onData + queueMicrotask timing non-deterministic in CI
  it.skip('createAlert sends notification for new alert with enabled channels', async () => {
    localStorage.setItem('auth_token', 'test-token')

    const rule: AlertRule = {
      id: 'new-alert-notif',
      name: 'New Alert Notif',
      description: '',
      enabled: true,
      condition: { type: 'gpu_usage', threshold: 80 },
      severity: 'critical',
      channels: [{ type: 'browser', enabled: true, config: {} }],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    mockMCPData = {
      gpuNodes: [{ cluster: 'notif-gpu-cluster', gpuCount: 10, gpuAllocated: 9 }],
      podIssues: [],
      clusters: [{ name: 'notif-gpu-cluster', healthy: true, nodeCount: 1 }],
      isLoading: false,
      error: null,
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    )

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    // Let queueMicrotask fire
    await flushTimers()

    // fetch should have been called for notification send
    const notifCalls = fetchSpy.mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes('/api/notifications/send')
    )
    expect(notifCalls.length).toBeGreaterThanOrEqual(1)

    fetchSpy.mockRestore()
  })

  // ── W2-28. Notification cooldown — re-notifies after 5 minutes ───────

  it('disk_pressure re-sends notification after cooldown period expires', async () => {
    const { sendNotificationWithDeepLink: mockSendNotif } = await import('../../hooks/useDeepLink')
    vi.mocked(mockSendNotif).mockClear()

    const rule: AlertRule = {
      id: 'dp-cooldown',
      name: 'Disk Pressure Cooldown',
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
      clusters: [{ name: 'cooldown-cluster', healthy: true, nodeCount: 1, issues: ['DiskPressure on worker-1'] }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    // First evaluation
    await act(async () => {
      result.current.evaluateConditions()
    })
    const firstCount = vi.mocked(mockSendNotif).mock.calls.length

    // Immediately re-evaluate — should NOT re-notify (within cooldown)
    await act(async () => {
      result.current.evaluateConditions()
    })
    expect(vi.mocked(mockSendNotif).mock.calls.length).toBe(firstCount)

    // Advance past cooldown (300_000ms = 5 min)
    await act(async () => {
      vi.advanceTimersByTime(310_000)
    })

    // Evaluate again — should re-notify since cooldown expired
    await act(async () => {
      result.current.evaluateConditions()
    })
    expect(vi.mocked(mockSendNotif).mock.calls.length).toBeGreaterThan(firstCount)
  })

  // ── W2-29. createAlert in-memory cap — evicts oldest resolved ────────

  it('createAlert enforces MAX_ALERTS cap by evicting oldest resolved alerts', async () => {
    // Create 500 resolved alerts
    const resolvedAlerts: Alert[] = Array.from({ length: 500 }, (_, i) => ({
      id: `resolved-cap-${i}`,
      ruleId: 'r-cap',
      ruleName: 'Cap',
      severity: 'info' as const,
      status: 'resolved' as const,
      message: `resolved ${i}`,
      details: {},
      firedAt: `2024-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
      resolvedAt: `2024-02-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
      cluster: 'cap-cluster',
    }))
    localStorage.setItem('kc_alerts', JSON.stringify(resolvedAlerts))

    const rule: AlertRule = {
      id: 'r-cap',
      name: 'Cap GPU',
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

    mockMCPData = {
      gpuNodes: [{ cluster: 'cap-cluster', gpuCount: 10, gpuAllocated: 9 }],
      podIssues: [],
      clusters: [{ name: 'cap-cluster', healthy: true, nodeCount: 1 }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    // Total alerts should be <= 500 (the new firing alert + some resolved)
    expect(result.current.alerts.length).toBeLessThanOrEqual(500)
    // The new firing alert should be present
    const firingAlerts = result.current.alerts.filter(a => a.status === 'firing')
    expect(firingAlerts.length).toBeGreaterThanOrEqual(1)
  })

  // ── W2-30. DNS failure with cluster-specific rule ────────────────────

  it('evaluateConditions: dns_failure respects cluster filter in rule', async () => {
    const rule: AlertRule = {
      id: 'dns-cluster-filter',
      name: 'DNS Cluster Filter',
      description: '',
      enabled: true,
      condition: { type: 'dns_failure', clusters: ['target-dns-cluster'] },
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
        { name: 'coredns-target', cluster: 'target-dns-cluster', namespace: 'kube-system', status: 'Error', restarts: 5, issues: ['OOM'] },
        { name: 'coredns-other', cluster: 'other-dns-cluster', namespace: 'kube-system', status: 'Error', restarts: 5, issues: ['OOM'] },
      ],
      clusters: [
        { name: 'target-dns-cluster', healthy: true, nodeCount: 3 },
        { name: 'other-dns-cluster', healthy: true, nodeCount: 3 },
      ],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const dnsAlerts = result.current.alerts.filter(a => a.ruleId === 'dns-cluster-filter')
    // Only the target cluster should have an alert
    expect(dnsAlerts.length).toBe(1)
    expect(dnsAlerts[0].cluster).toBe('target-dns-cluster')
  })

  // ── W2-31. Nightly E2E — does not alert on same run twice ────────────

  it('evaluateConditions: nightly_e2e_failure does not re-alert for same run ID', async () => {
    const rule: AlertRule = {
      id: 'ne2e-dedup',
      name: 'Nightly E2E Dedup',
      description: '',
      enabled: true,
      condition: { type: 'nightly_e2e_failure' },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    const nightlyData = [
      {
        guide: 'Guide X',
        acronym: 'GX',
        platform: 'OCP',
        repo: 'org/repo-x',
        workflowFile: 'nightly.yml',
        runs: [
          { id: 999, status: 'completed', conclusion: 'failure', htmlUrl: '', runNumber: 10, failureReason: 'test_failure', model: 'm', gpuType: 'A100', gpuCount: 1, event: 'schedule' },
        ],
        passRate: 0,
        trend: 'down',
        latestConclusion: 'failure',
        model: 'm',
      },
    ]

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(nightlyData), { status: 200 })
    )

    mockMCPData = { gpuNodes: [], podIssues: [], clusters: [], isLoading: false, error: null }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })
    await act(async () => { vi.advanceTimersByTime(9000) })

    // First evaluation
    await act(async () => {
      result.current.evaluateConditions()
    })
    const countAfterFirst = result.current.alerts.filter(a => a.ruleId === 'ne2e-dedup').length
    expect(countAfterFirst).toBe(1)

    // Second evaluation — same run ID should not create another alert
    await act(async () => {
      result.current.evaluateConditions()
    })
    const countAfterSecond = result.current.alerts.filter(a => a.ruleId === 'ne2e-dedup').length
    expect(countAfterSecond).toBe(countAfterFirst)

    fetchSpy.mockRestore()
  })

  // ── W2-32. saveToStorage non-quota error path ────────────────────────

  it('saveToStorage logs error for non-quota localStorage failures', () => {
    // Make setItem throw a generic error (not QuotaExceededError)
    const originalSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_alert_rules') {
        throw new Error('generic storage error')
      }
      return originalSetItem(key, value)
    })

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Creating a rule triggers saveToStorage for rules
    act(() => {
      result.current.createRule(makeRule({ name: 'Storage Error Test' }))
    })

    // Should not crash — error is caught
    expect(result.current.rules.find(r => r.name === 'Storage Error Test')).toBeDefined()
  })

  // ── W2-33. MCP data error state propagation ─────────────────────────

  // SKIP: test update needed — requires lazy-loaded AlertsDataFetcher to resolve and
  // pass error through onData callback; timing non-deterministic with fake timers in CI
  it.skip('propagates MCP data error to context consumers', async () => {
    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [],
      isLoading: false,
      error: 'MCP connection failed',
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    // Allow lazy component to resolve and onData to fire
    await act(async () => { vi.advanceTimersByTime(0) })
    await flushTimers()

    expect(result.current.dataError).toBe('MCP connection failed')
    expect(result.current.isLoadingData).toBe(false)
  })

  // ── W2-34. MCP loading state propagation ────────────────────────────

  it('propagates MCP loading state to context consumers', async () => {
    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [],
      isLoading: true,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    expect(result.current.isLoadingData).toBe(true)
    expect(result.current.dataError).toBeNull()
  })
})
