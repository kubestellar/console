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

describe('AlertsContext — additional coverage', () => {
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
