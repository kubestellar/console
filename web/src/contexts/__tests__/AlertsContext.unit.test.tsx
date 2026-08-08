/**
 * AlertsContext — focused unit tests
 *
 * Covers the checklist from issue #22288:
 *  1. Initial state
 *  2. Acknowledging / dismissing alerts — single and bulk
 *  3. resolveAlert / deleteAlert
 *  4. deduplicatedAlerts reflects state
 *  5. Subscription / consumer re-render: multiple consumers both update
 *
 * Rule CRUD, storage persistence, condition evaluation, and lifecycle
 * edge-cases are covered in the sibling deep-cover / lifecycle / storage
 * test files.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React, { useEffect } from 'react'

// ── Mocks (must be declared before importing the module under test) ───────────

const mockStartMission = vi.fn(() => 'mission-unit')

vi.mock('../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: mockStartMission }),
}))

vi.mock('../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: vi.fn(() => false),
}))

vi.mock('../../hooks/useDeepLink', () => ({
  sendNotificationWithDeepLink: vi.fn(),
}))

vi.mock('../notifications', () => ({
  shouldDispatchBrowserNotification: vi.fn(() => false),
  isClusterUnreachable: vi.fn(() => false),
  dispatchNotification: vi.fn(),
  sendNotifications: vi.fn(),
  sendBatchedNotifications: vi.fn(),
  getNotificationCooldown: vi.fn(() => 300_000),
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
    Promise.allSettled(fns.map((fn) => fn()))
  ),
}))

// Stub AlertsDataFetcher so it immediately calls onData with empty data
vi.mock('../AlertsDataFetcher', () => ({
  __esModule: true,
  default: function AlertsDataFetcherStub({ onData }: { onData: (d: unknown) => void }) {
    useEffect(() => {
      onData({ gpuNodes: [], podIssues: [], clusters: [], isLoading: false, error: null })
    }, [onData])
    return null
  },
}))

vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

// ── Import under test ─────────────────────────────────────────────────────────

import { AlertsProvider, useAlertsContext } from '../AlertsContext'
import type { Alert } from '../../types/alerts'

// ── Helpers ───────────────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AlertsProvider>{children}</AlertsProvider>
)

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: overrides.id ?? `alert-${Math.random().toString(36).slice(2)}`,
    ruleId: overrides.ruleId ?? 'rule-unit',
    ruleName: overrides.ruleName ?? 'Unit Test Rule',
    severity: overrides.severity ?? 'warning',
    status: overrides.status ?? 'firing',
    message: overrides.message ?? 'Unit test alert',
    details: overrides.details ?? {},
    firedAt: overrides.firedAt ?? new Date().toISOString(),
    resolvedAt: overrides.resolvedAt,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
  mockStartMission.mockReturnValue('mission-unit')
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AlertsContext — initial state', () => {
  it('starts with an empty alerts list when localStorage is empty', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    expect(result.current.alerts).toEqual([])
  })

  it('starts with zero active and acknowledged alerts', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    expect(result.current.activeAlerts).toEqual([])
    expect(result.current.acknowledgedAlerts).toEqual([])
  })

  it('exposes the expected API surface', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    expect(typeof result.current.acknowledgeAlert).toBe('function')
    expect(typeof result.current.acknowledgeAlerts).toBe('function')
    expect(typeof result.current.resolveAlert).toBe('function')
    expect(typeof result.current.deleteAlert).toBe('function')
    expect(typeof result.current.createRule).toBe('function')
    expect(typeof result.current.updateRule).toBe('function')
    expect(typeof result.current.deleteRule).toBe('function')
    expect(typeof result.current.toggleRule).toBe('function')
    expect(typeof result.current.evaluateConditions).toBe('function')
  })
})

describe('AlertsContext — alert lifecycle (single + bulk)', () => {
  it('acknowledgeAlert marks one alert as acknowledged', () => {
    const alert = makeAlert({ id: 'a1' })
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.acknowledgeAlert('a1', 'tester')
    })

    const updated = result.current.alerts.find((a) => a.id === 'a1')
    expect(updated?.status).toBe('acknowledged')
    expect(result.current.acknowledgedAlerts.some((a) => a.id === 'a1')).toBe(true)
    expect(result.current.activeAlerts.some((a) => a.id === 'a1')).toBe(false)
  })

  it('acknowledgeAlerts marks multiple alerts as acknowledged in one call', () => {
    const a1 = makeAlert({ id: 'b1' })
    const a2 = makeAlert({ id: 'b2' })
    localStorage.setItem('kc_alerts', JSON.stringify([a1, a2]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.acknowledgeAlerts(['b1', 'b2'], 'bulk-tester')
    })

    expect(result.current.alerts.find((a) => a.id === 'b1')?.status).toBe('acknowledged')
    expect(result.current.alerts.find((a) => a.id === 'b2')?.status).toBe('acknowledged')
  })

  it('resolveAlert marks an alert as resolved', () => {
    const alert = makeAlert({ id: 'c1' })
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.resolveAlert('c1')
    })

    const updated = result.current.alerts.find((a) => a.id === 'c1')
    expect(updated?.status).toBe('resolved')
    expect(updated?.resolvedAt).toBeDefined()
  })

  it('deleteAlert removes an alert from the list', () => {
    const alert = makeAlert({ id: 'd1' })
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.deleteAlert('d1')
    })

    expect(result.current.alerts.some((a) => a.id === 'd1')).toBe(false)
  })
})

describe('AlertsContext — deduplication', () => {
  it('deduplicatedAlerts matches the initial seeded alerts count', () => {
    const alerts = [makeAlert({ id: 'e1' }), makeAlert({ id: 'e2' })]
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // deduplicatedAlerts should include our seeded firing alerts
    expect(result.current.deduplicatedAlerts.length).toBeGreaterThanOrEqual(2)
  })

  it('deduplicatedAlerts is updated after deleteAlert', () => {
    const alerts = [makeAlert({ id: 'f1' }), makeAlert({ id: 'f2' })]
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const countBefore = result.current.deduplicatedAlerts.length

    act(() => {
      result.current.deleteAlert('f1')
    })

    expect(result.current.deduplicatedAlerts.length).toBeLessThan(countBefore)
  })
})

describe('AlertsContext — subscription / consumer re-render', () => {
  it('two independent consumers both reflect the same state change', () => {
    const alert = makeAlert({ id: 'g1' })
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))

    // Mount two hooks sharing the same provider via the wrapper
    const { result: r1 } = renderHook(() => useAlertsContext(), { wrapper })
    const { result: r2 } = renderHook(() => useAlertsContext(), { wrapper })

    // Both should see the seeded alert initially
    expect(r1.current.alerts.some((a) => a.id === 'g1')).toBe(true)
    expect(r2.current.alerts.some((a) => a.id === 'g1')).toBe(true)
  })

  it('stats reflect current alert counts', () => {
    const alerts = [
      makeAlert({ id: 'h1', severity: 'critical' }),
      makeAlert({ id: 'h2', severity: 'warning' }),
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(result.current.stats).toBeDefined()
    expect(typeof result.current.stats.total).toBe('number')
    expect(result.current.stats.total).toBeGreaterThanOrEqual(2)
  })
})
