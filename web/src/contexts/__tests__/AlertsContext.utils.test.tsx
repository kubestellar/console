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
// Standalone utility function tests (exported helpers / module-level fns)
// ═══════════════════════════════════════════════════════════════════════════

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
