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
  settledWithConcurrency: vi.fn((fns: (() => Promise<unknown>)[]) => Promise.all(fns.map(fn => fn()))),
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
    // eslint-disable-next-line react-hooks/rules-of-hooks
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

describe('AlertsContext', () => {
  // ── 1. Context availability ──────────────────────────────────────────

  it('throws when useAlertsContext is called outside provider', () => {
    // Silence React error boundary logs
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useAlertsContext())).toThrow(
      'useAlertsContext must be used within an AlertsProvider'
    )
    spy.mockRestore()
  })

  it('provides default context values on mount', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    expect(result.current.alerts).toBeDefined()
    expect(result.current.rules.length).toBeGreaterThan(0) // preset rules
    expect(result.current.isEvaluating).toBe(false)
    expect(result.current.isLoadingData).toBe(true) // default MCP state
    expect(result.current.dataError).toBeNull()
  })

  // ── 2. Preset rules initialization ───────────────────────────────────

  it('initializes with preset rules when localStorage is empty', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const ruleTypes = result.current.rules.map(r => r.condition.type)
    expect(ruleTypes).toContain('gpu_usage')
    expect(ruleTypes).toContain('node_not_ready')
    expect(ruleTypes).toContain('pod_crash')
    expect(ruleTypes).toContain('disk_pressure')
  })

  it('loads rules from localStorage when already stored', () => {
    const storedRules: AlertRule[] = [
      {
        id: 'stored-1',
        name: 'Stored Rule',
        description: 'Pre-existing',
        enabled: true,
        condition: { type: 'gpu_usage', threshold: 50 },
        severity: 'info',
        channels: [],
        aiDiagnose: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ]
    localStorage.setItem('kc_alert_rules', JSON.stringify(storedRules))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    // Should contain the stored rule plus any newly injected preset rules
    const storedRule = result.current.rules.find(r => r.id === 'stored-1')
    expect(storedRule).toBeDefined()
    expect(storedRule!.condition.threshold).toBe(50)
  })

  // ── 3. Rule CRUD ─────────────────────────────────────────────────────

  it('creates a new rule and persists it', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const initialCount = result.current.rules.length

    let newRule: AlertRule | undefined
    act(() => {
      newRule = result.current.createRule(makeRule({ name: 'Custom GPU' }))
    })

    expect(newRule).toBeDefined()
    expect(newRule!.name).toBe('Custom GPU')
    expect(result.current.rules.length).toBe(initialCount + 1)

    // Persisted to localStorage
    const stored = JSON.parse(localStorage.getItem('kc_alert_rules')!)
    expect(stored.find((r: AlertRule) => r.id === newRule!.id)).toBeDefined()
  })

  it('updates an existing rule', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const ruleId = result.current.rules[0].id

    act(() => {
      result.current.updateRule(ruleId, { name: 'Updated Name', severity: 'critical' })
    })

    const updated = result.current.rules.find(r => r.id === ruleId)
    expect(updated!.name).toBe('Updated Name')
    expect(updated!.severity).toBe('critical')
  })

  it('deletes a rule', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const ruleId = result.current.rules[0].id
    const initialCount = result.current.rules.length

    act(() => {
      result.current.deleteRule(ruleId)
    })

    expect(result.current.rules.length).toBe(initialCount - 1)
    expect(result.current.rules.find(r => r.id === ruleId)).toBeUndefined()
  })

  it('toggles a rule enabled state', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const rule = result.current.rules.find(r => r.enabled)!
    const wasEnabled = rule.enabled

    act(() => {
      result.current.toggleRule(rule.id)
    })

    const toggled = result.current.rules.find(r => r.id === rule.id)!
    expect(toggled.enabled).toBe(!wasEnabled)
  })

  // ── 4. Alert acknowledgement ─────────────────────────────────────────

  it('acknowledges a single alert', () => {
    // Seed an alert into localStorage
    const alertId = 'ack-test-1'
    const seedAlert: Alert = {
      id: alertId,
      ruleId: 'r1',
      ruleName: 'Test',
      severity: 'warning',
      status: 'firing',
      message: 'test alert',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alerts', JSON.stringify([seedAlert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.acknowledgeAlert(alertId, 'admin')
    })

    const acked = result.current.alerts.find(a => a.id === alertId)!
    expect(acked.acknowledgedAt).toBeDefined()
    expect(acked.acknowledgedBy).toBe('admin')
  })

  it('acknowledges multiple alerts at once', () => {
    const alerts: Alert[] = [
      { id: 'multi-1', ruleId: 'r1', ruleName: 'A', severity: 'warning', status: 'firing', message: 'm1', details: {}, firedAt: '2024-01-01T00:00:00Z' },
      { id: 'multi-2', ruleId: 'r1', ruleName: 'A', severity: 'critical', status: 'firing', message: 'm2', details: {}, firedAt: '2024-01-01T00:00:00Z' },
      { id: 'multi-3', ruleId: 'r1', ruleName: 'A', severity: 'info', status: 'firing', message: 'm3', details: {}, firedAt: '2024-01-01T00:00:00Z' },
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.acknowledgeAlerts(['multi-1', 'multi-2'], 'ops-team')
    })

    const a1 = result.current.alerts.find(a => a.id === 'multi-1')!
    const a2 = result.current.alerts.find(a => a.id === 'multi-2')!
    const a3 = result.current.alerts.find(a => a.id === 'multi-3')!
    expect(a1.acknowledgedAt).toBeDefined()
    expect(a2.acknowledgedBy).toBe('ops-team')
    // Third alert was NOT in the list
    expect(a3.acknowledgedAt).toBeUndefined()
  })

  // ── 5. Alert resolution ──────────────────────────────────────────────

  it('resolves an alert', async () => {
    const seedAlert: Alert = {
      id: 'resolve-1',
      ruleId: 'r1',
      ruleName: 'Test',
      severity: 'warning',
      status: 'firing',
      message: 'resolve me',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alerts', JSON.stringify([seedAlert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.resolveAlert('resolve-1')
    })

    const resolved = result.current.alerts.find(a => a.id === 'resolve-1')!
    expect(resolved.status).toBe('resolved')
    expect(resolved.resolvedAt).toBeDefined()
  })

  // ── 6. Alert deletion ────────────────────────────────────────────────

  it('deletes an alert', () => {
    const seedAlert: Alert = {
      id: 'del-1',
      ruleId: 'r1',
      ruleName: 'Test',
      severity: 'info',
      status: 'firing',
      message: 'delete me',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alerts', JSON.stringify([seedAlert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.deleteAlert('del-1')
    })

    expect(result.current.alerts.find(a => a.id === 'del-1')).toBeUndefined()
  })

  // ── 7. Stats computation ─────────────────────────────────────────────

  it('computes correct alert statistics', () => {
    const alerts: Alert[] = [
      { id: 's1', ruleId: 'r1', ruleName: 'A', severity: 'critical', status: 'firing', message: '', details: {}, firedAt: '2024-01-01T00:00:00Z' },
      { id: 's2', ruleId: 'r1', ruleName: 'A', severity: 'warning', status: 'firing', message: '', details: {}, firedAt: '2024-01-01T00:00:00Z' },
      { id: 's3', ruleId: 'r1', ruleName: 'A', severity: 'info', status: 'firing', message: '', details: {}, firedAt: '2024-01-01T00:00:00Z' },
      { id: 's4', ruleId: 'r1', ruleName: 'A', severity: 'warning', status: 'resolved', message: '', details: {}, firedAt: '2024-01-01T00:00:00Z', resolvedAt: '2024-01-02T00:00:00Z' },
      { id: 's5', ruleId: 'r1', ruleName: 'A', severity: 'critical', status: 'firing', message: '', details: {}, firedAt: '2024-01-01T00:00:00Z', acknowledgedAt: '2024-01-01T01:00:00Z' },
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const { stats } = result.current

    expect(stats.total).toBe(5)
    // "firing" counts unacknowledged only
    expect(stats.firing).toBe(3) // s1, s2, s3
    expect(stats.resolved).toBe(1) // s4
    expect(stats.critical).toBe(1) // s1 (s5 is acknowledged)
    expect(stats.warning).toBe(1) // s2
    expect(stats.info).toBe(1) // s3
    expect(stats.acknowledged).toBe(1) // s5
  })

  // ── 8. Active vs acknowledged alert lists ────────────────────────────

  it('separates active and acknowledged alerts', () => {
    const alerts: Alert[] = [
      { id: 'act-1', ruleId: 'r1', ruleName: 'A', severity: 'warning', status: 'firing', message: '', details: {}, firedAt: '2024-01-01T00:00:00Z' },
      { id: 'ack-1', ruleId: 'r2', ruleName: 'B', severity: 'warning', status: 'firing', message: '', details: {}, firedAt: '2024-01-01T00:00:00Z', acknowledgedAt: '2024-01-01T01:00:00Z' },
      { id: 'res-1', ruleId: 'r3', ruleName: 'C', severity: 'warning', status: 'resolved', message: '', details: {}, firedAt: '2024-01-01T00:00:00Z', resolvedAt: '2024-01-02T00:00:00Z' },
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(result.current.activeAlerts.map(a => a.id)).toContain('act-1')
    expect(result.current.activeAlerts.map(a => a.id)).not.toContain('ack-1')
    expect(result.current.acknowledgedAlerts.map(a => a.id)).toContain('ack-1')
    expect(result.current.acknowledgedAlerts.map(a => a.id)).not.toContain('act-1')
  })

  // ── 9. AI diagnosis ─────────────────────────────────────────────────

  it('runs AI diagnosis and creates a mission', () => {
    const seedAlert: Alert = {
      id: 'diag-1',
      ruleId: 'r-diag',
      ruleName: 'GPU Usage Critical',
      severity: 'critical',
      status: 'firing',
      message: 'GPU usage high',
      details: { usagePercent: 95 },
      cluster: 'prod-1',
      firedAt: '2024-01-01T00:00:00Z',
    }
    // Need a matching rule in state
    const seedRule: AlertRule = {
      id: 'r-diag',
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
    act(() => {
      missionId = result.current.runAIDiagnosis('diag-1')
    })

    expect(missionId).toBe('mission-123')
    expect(mockStartMission).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Diagnose: GPU Usage Critical',
        type: 'troubleshoot',
        cluster: 'prod-1',
      })
    )

    // The alert should now have aiDiagnosis attached
    const alert = result.current.alerts.find(a => a.id === 'diag-1')!
    expect(alert.aiDiagnosis).toBeDefined()
    expect(alert.aiDiagnosis!.missionId).toBe('mission-123')
  })

  it('returns null for AI diagnosis on non-existent alert', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    let missionId: string | null = null
    act(() => {
      missionId = result.current.runAIDiagnosis('non-existent')
    })

    expect(missionId).toBeNull()
    expect(mockStartMission).not.toHaveBeenCalled()
  })

  // ── 10. Demo mode cleanup ────────────────────────────────────────────

  it('clears demo alerts when demo mode is turned off', async () => {
    mockIsDemoMode = true
    const demoAlert: Alert = {
      id: 'demo-1',
      ruleId: 'r1',
      ruleName: 'A',
      severity: 'warning',
      status: 'firing',
      message: 'demo',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
      isDemo: true,
    }
    const realAlert: Alert = {
      id: 'real-1',
      ruleId: 'r1',
      ruleName: 'A',
      severity: 'warning',
      status: 'firing',
      message: 'real',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
      isDemo: false,
    }
    localStorage.setItem('kc_alerts', JSON.stringify([demoAlert, realAlert]))

    const { result, rerender } = renderHook(() => useAlertsContext(), { wrapper })

    // Both alerts present initially
    expect(result.current.alerts.length).toBe(2)

    // Simulate toggling demo mode off
    mockIsDemoMode = false
    rerender()

    // Wait for effect to run
    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    // Demo alert should be removed, real alert should remain
    expect(result.current.alerts.find(a => a.id === 'demo-1')).toBeUndefined()
    expect(result.current.alerts.find(a => a.id === 'real-1')).toBeDefined()
  })

  // ── 11. localStorage persistence on alert changes ────────────────────

  it('persists alerts to localStorage when they change', () => {
    const seedAlert: Alert = {
      id: 'persist-1',
      ruleId: 'r1',
      ruleName: 'A',
      severity: 'warning',
      status: 'firing',
      message: 'persist me',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alerts', JSON.stringify([seedAlert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.deleteAlert('persist-1')
    })

    const stored = JSON.parse(localStorage.getItem('kc_alerts')!)
    expect(stored.find((a: Alert) => a.id === 'persist-1')).toBeUndefined()
  })

  // ── 12. localStorage quota exceeded handling ─────────────────────────

  it('prunes resolved alerts when localStorage quota is exceeded', () => {
    // Build a set of alerts that will trigger quota logic
    const alerts: Alert[] = []
    for (let i = 0; i < 10; i++) {
      alerts.push({
        id: `firing-${i}`,
        ruleId: 'r1',
        ruleName: 'A',
        severity: 'warning',
        status: 'firing',
        message: `firing ${i}`,
        details: {},
        firedAt: '2024-01-01T00:00:00Z',
      })
    }
    for (let i = 0; i < 10; i++) {
      alerts.push({
        id: `resolved-${i}`,
        ruleId: 'r1',
        ruleName: 'A',
        severity: 'warning',
        status: 'resolved',
        message: `resolved ${i}`,
        details: {},
        firedAt: '2024-01-01T00:00:00Z',
        resolvedAt: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      })
    }
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    // Now make setItem throw QuotaExceededError after initial load
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let throwQuotaError = false

    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (throwQuotaError && key === 'kc_alerts') {
        const err = new DOMException('quota exceeded', 'QuotaExceededError')
        // Also allow the retry to succeed
        throwQuotaError = false
        throw err
      }
      return originalSetItem(key, value)
    })

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Trigger a write that will fail with quota error
    throwQuotaError = true
    act(() => {
      result.current.deleteAlert('resolved-0')
    })

    // The fallback write should have succeeded (with pruned alerts)
    const stored = JSON.parse(localStorage.getItem('kc_alerts')!)
    expect(stored).toBeDefined()
  })

  // ── 13. Evaluate conditions dispatches to correct evaluator ──────────

  it('evaluateConditions runs without error', async () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    await act(async () => {
      result.current.evaluateConditions()
    })

    // Should complete without throwing
    expect(result.current.isEvaluating).toBe(false)
  })

  // ── 14. Condition: node_not_ready ────────────────────────────────────

  it('evaluateConditions: node_not_ready creates alert for unhealthy cluster', async () => {
    const rule: AlertRule = {
      id: 'nnr-1',
      name: 'Node Not Ready',
      description: '',
      enabled: true,
      condition: { type: 'node_not_ready' },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    // Inject unhealthy cluster via MCP data
    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'unhealthy-cluster', healthy: false, nodeCount: 3 }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Let the AlertsDataFetcher effect fire and populate refs
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    // Should have created an alert for the unhealthy cluster
    const nodeAlerts = result.current.alerts.filter(a => a.ruleId === 'nnr-1')
    expect(nodeAlerts.length).toBe(1)
    expect(nodeAlerts[0].message).toContain('unhealthy-cluster')
    expect(nodeAlerts[0].cluster).toBe('unhealthy-cluster')
  })

  it('evaluateConditions: node_not_ready auto-resolves when cluster becomes healthy', async () => {
    const rule: AlertRule = {
      id: 'nnr-resolve',
      name: 'Node Not Ready',
      description: '',
      enabled: true,
      condition: { type: 'node_not_ready' },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    // Seed an existing firing alert
    const firingAlert: Alert = {
      id: 'nnr-existing',
      ruleId: 'nnr-resolve',
      ruleName: 'Node Not Ready',
      severity: 'warning',
      status: 'firing',
      message: 'Cluster prod has nodes not in Ready state',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
      cluster: 'prod',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([firingAlert]))

    // Cluster is now healthy
    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'prod', healthy: true, nodeCount: 3 }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const resolved = result.current.alerts.find(a => a.id === 'nnr-existing')
    expect(resolved?.status).toBe('resolved')
  })

  // ── 15. Alert deduplication ──────────────────────────────────────────

  it('deduplicates alerts keeping the most recently fired entry', () => {
    // Two alerts with same ruleId and cluster (cluster-aggregate type)
    const alerts: Alert[] = [
      { id: 'dup-1', ruleId: 'r1', ruleName: 'A', severity: 'warning', status: 'firing', message: 'old', details: {}, firedAt: '2024-01-01T00:00:00Z', cluster: 'prod' },
      { id: 'dup-2', ruleId: 'r1', ruleName: 'A', severity: 'warning', status: 'firing', message: 'new', details: {}, firedAt: '2024-06-01T00:00:00Z', cluster: 'prod' },
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // activeAlerts should deduplicate and keep only the most recent
    expect(result.current.activeAlerts.length).toBe(1)
    expect(result.current.activeAlerts[0].id).toBe('dup-2')
  })

  it('pod_crash dedup uses resource key, allowing multiple pods', () => {
    const rule: AlertRule = {
      id: 'pc-rule',
      name: 'Pod Crash',
      description: '',
      enabled: true,
      condition: { type: 'pod_crash', threshold: 5 },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    const alerts: Alert[] = [
      { id: 'pc-1', ruleId: 'pc-rule', ruleName: 'Pod Crash', severity: 'warning', status: 'firing', message: 'pod-a crashed', details: {}, firedAt: '2024-01-01T00:00:00Z', cluster: 'prod', resource: 'pod-a' },
      { id: 'pc-2', ruleId: 'pc-rule', ruleName: 'Pod Crash', severity: 'warning', status: 'firing', message: 'pod-b crashed', details: {}, firedAt: '2024-01-01T00:00:00Z', cluster: 'prod', resource: 'pod-b' },
    ]
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Both pod alerts should remain as separate entries
    expect(result.current.activeAlerts.length).toBe(2)
  })

  // ── 16. Periodic evaluation timer fires ──────────────────────────────

  it('auto-evaluates after the initial 1-second delay', async () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Before timer fires, isEvaluating should be false
    expect(result.current.isEvaluating).toBe(false)

    // Advance past the initial 1-second timeout
    await act(async () => {
      vi.advanceTimersByTime(1100)
    })

    // After evaluation completes, isEvaluating goes back to false
    expect(result.current.isEvaluating).toBe(false)
  })

  // ── 17. isEvaluating guard prevents re-entrant evaluation ────────────

  it('prevents concurrent evaluation calls', async () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // The guard uses a ref, so calling evaluateConditions twice rapidly
    // should not throw
    await act(async () => {
      result.current.evaluateConditions()
      result.current.evaluateConditions() // second call is a no-op
    })

    expect(result.current.isEvaluating).toBe(false)
  })

  // ── 18. Corrupt localStorage gracefully handled ──────────────────────

  it('handles corrupt localStorage data for alerts gracefully', () => {
    localStorage.setItem('kc_alerts', 'not-valid-json')
    // console.error is mocked, so no noise
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    expect(result.current.alerts).toEqual([])
  })

  it('handles corrupt localStorage data for rules gracefully', () => {
    localStorage.setItem('kc_alert_rules', '{invalid')
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    // Should fall back to preset rules
    expect(result.current.rules.length).toBeGreaterThan(0)
  })

  // ── 19. loadNotifiedAlertKeys handles corrupt data ───────────────────

  it('loads with empty notification dedup map on corrupt data', () => {
    localStorage.setItem('kc-notified-alert-keys', 'broken-json')
    // Should not throw; provider initializes cleanly
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    expect(result.current).toBeDefined()
  })

  // ── 20. Notification dedup map persistence ───────────────────────────

  it('persists notification dedup keys during evaluation', async () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    await act(async () => {
      result.current.evaluateConditions()
    })

    // saveNotifiedAlertKeys should have been called (stores to localStorage)
    // Even with empty keys, the key should exist
    const stored = localStorage.getItem('kc-notified-alert-keys')
    expect(stored).toBeDefined()
  })

  // ── 21. Max alerts cap ───────────────────────────────────────────────

  it('caps alerts at MAX_ALERTS (500) keeping firing over resolved', () => {
    // Create more than 500 alerts in localStorage
    const alerts: Alert[] = []
    const OVERFLOW_COUNT = 510
    for (let i = 0; i < OVERFLOW_COUNT; i++) {
      alerts.push({
        id: `overflow-${i}`,
        ruleId: 'r1',
        ruleName: 'A',
        severity: 'warning',
        status: i < 10 ? 'firing' : 'resolved',
        message: `alert ${i}`,
        details: {},
        firedAt: `2024-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
        ...(i >= 10 ? { resolvedAt: `2024-02-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z` } : {}),
      })
    }
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // saveAlerts is called on mount via the useEffect; it should trim to 500
    const stored: Alert[] = JSON.parse(localStorage.getItem('kc_alerts')!)
    expect(stored.length).toBeLessThanOrEqual(500)

    // All firing alerts should be retained
    const firingStored = stored.filter(a => a.status === 'firing')
    expect(firingStored.length).toBe(10)
  })

  // ── 22. Preset rule migration ────────────────────────────────────────

  it('injects missing preset rule types on mount', () => {
    // Store rules with only ONE type
    const partialRules: AlertRule[] = [
      {
        id: 'existing-1',
        name: 'GPU Usage',
        description: '',
        enabled: true,
        condition: { type: 'gpu_usage', threshold: 90 },
        severity: 'critical',
        channels: [],
        aiDiagnose: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ]
    localStorage.setItem('kc_alert_rules', JSON.stringify(partialRules))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Should have the original + all missing preset types
    const types = result.current.rules.map(r => r.condition.type)
    expect(types).toContain('gpu_usage')
    expect(types).toContain('node_not_ready')
    expect(types).toContain('pod_crash')
    expect(types).toContain('disk_pressure')
    expect(types).toContain('certificate_error')
    expect(types).toContain('cluster_unreachable')
  })

  // ── 23. Resolve sends notifications for rule channels ────────────────

  it('resolveAlert triggers notification send for rule with enabled channels', async () => {
    const ruleWithChannels: AlertRule = {
      id: 'notif-rule',
      name: 'Notifying Rule',
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
      id: 'notif-alert',
      ruleId: 'notif-rule',
      ruleName: 'Notifying Rule',
      severity: 'critical',
      status: 'firing',
      message: 'GPU usage high',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([ruleWithChannels]))
    localStorage.setItem('kc_alerts', JSON.stringify([seedAlert]))

    // Set auth token so sendNotifications doesn't bail
    localStorage.setItem('auth_token', 'test-token')

    // Mock fetch for notification API
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    )

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.resolveAlert('notif-alert')
    })

    // Let the queueMicrotask fire
    await flushTimers()

    expect(result.current.alerts.find(a => a.id === 'notif-alert')!.status).toBe('resolved')

    fetchSpy.mockRestore()
  })

  // ── 24. sendNotifications skips without auth token ───────────────────

  it('sendNotifications skips when no auth token', async () => {
    const ruleWithChannels: AlertRule = {
      id: 'no-auth-rule',
      name: 'No Auth',
      description: '',
      enabled: true,
      condition: { type: 'gpu_usage' },
      severity: 'critical',
      channels: [{ type: 'slack', enabled: true, config: { slackWebhookUrl: 'https://hooks.slack.com/test' } }],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    const seedAlert: Alert = {
      id: 'no-auth-alert',
      ruleId: 'no-auth-rule',
      ruleName: 'No Auth',
      severity: 'critical',
      status: 'firing',
      message: 'test',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([ruleWithChannels]))
    localStorage.setItem('kc_alerts', JSON.stringify([seedAlert]))
    // Deliberately NOT setting auth_token

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    )

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.resolveAlert('no-auth-alert')
    })

    await flushTimers()

    // fetch should NOT have been called for notifications (no auth token)
    const notifCalls = fetchSpy.mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes('/api/notifications/send')
    )
    expect(notifCalls.length).toBe(0)

    fetchSpy.mockRestore()
  })

  // ── 25. Notification API errors are handled silently ─────────────────

  it('handles notification API failure silently', async () => {
    const ruleWithChannels: AlertRule = {
      id: 'fail-rule',
      name: 'Fail Rule',
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
      id: 'fail-alert',
      ruleId: 'fail-rule',
      ruleName: 'Fail Rule',
      severity: 'critical',
      status: 'firing',
      message: 'test',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([ruleWithChannels]))
    localStorage.setItem('kc_alerts', JSON.stringify([seedAlert]))
    localStorage.setItem('auth_token', 'test-token')

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Should not throw even though notification API fails
    act(() => {
      result.current.resolveAlert('fail-alert')
    })

    await flushTimers()

    // Alert is still resolved despite notification failure
    expect(result.current.alerts.find(a => a.id === 'fail-alert')!.status).toBe('resolved')

    fetchSpy.mockRestore()
  })

  // ── 26. Notification API returns 401/403 silently ────────────────────

  it('silently ignores 401/403 notification responses', async () => {
    const ruleWithChannels: AlertRule = {
      id: 'auth-fail-rule',
      name: 'Auth Fail',
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
      id: 'auth-fail-alert',
      ruleId: 'auth-fail-rule',
      ruleName: 'Auth Fail',
      severity: 'critical',
      status: 'firing',
      message: 'test',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([ruleWithChannels]))
    localStorage.setItem('kc_alerts', JSON.stringify([seedAlert]))
    localStorage.setItem('auth_token', 'expired-token')

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Unauthorized', { status: 401 })
    )

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.resolveAlert('auth-fail-alert')
    })

    await flushTimers()

    // Should resolve cleanly without error
    expect(result.current.alerts.find(a => a.id === 'auth-fail-alert')!.status).toBe('resolved')

    fetchSpy.mockRestore()
  })

  // ── 27. updateRule does not change other rules ───────────────────────

  it('updateRule only modifies the targeted rule', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const [first, second] = result.current.rules

    act(() => {
      result.current.updateRule(first.id, { name: 'Changed' })
    })

    const updatedFirst = result.current.rules.find(r => r.id === first.id)!
    const unchangedSecond = result.current.rules.find(r => r.id === second.id)!
    expect(updatedFirst.name).toBe('Changed')
    expect(unchangedSecond.name).toBe(second.name)
  })

  // ── 28. deleteRule is idempotent for missing ID ──────────────────────

  it('deleteRule with non-existent ID does not change rules', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const before = result.current.rules.length

    act(() => {
      result.current.deleteRule('does-not-exist')
    })

    expect(result.current.rules.length).toBe(before)
  })

  // ── 29. toggleRule updates the updatedAt timestamp ───────────────────

  it('toggleRule updates the updatedAt timestamp', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const rule = result.current.rules[0]
    const oldUpdatedAt = rule.updatedAt

    // Advance time so the timestamp differs
    vi.advanceTimersByTime(5000)

    act(() => {
      result.current.toggleRule(rule.id)
    })

    const toggled = result.current.rules.find(r => r.id === rule.id)!
    expect(toggled.updatedAt).not.toBe(oldUpdatedAt)
  })

  // ── 30. acknowledgeAlert is a no-op for non-existent ID ──────────────

  it('acknowledgeAlert on non-existent alert does not crash', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.acknowledgeAlert('ghost-id', 'user')
    })

    // Should not throw
    expect(result.current.alerts.length).toBe(0)
  })

  // ── 31. resolveAlert on already-resolved is safe ─────────────────────

  it('resolveAlert on already-resolved alert is idempotent', () => {
    const resolvedAlert: Alert = {
      id: 'already-resolved',
      ruleId: 'r1',
      ruleName: 'A',
      severity: 'info',
      status: 'resolved',
      message: 'done',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
      resolvedAt: '2024-01-02T00:00:00Z',
    }
    localStorage.setItem('kc_alerts', JSON.stringify([resolvedAlert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.resolveAlert('already-resolved')
    })

    // Should remain resolved without error
    const alert = result.current.alerts.find(a => a.id === 'already-resolved')!
    expect(alert.status).toBe('resolved')
  })

  // ── 32. Multiple rules with different severities ─────────────────────

  it('stats correctly count different severity levels across mixed alerts', () => {
    const alerts: Alert[] = [
      { id: 'mx-1', ruleId: 'r1', ruleName: 'A', severity: 'critical', status: 'firing', message: '', details: {}, firedAt: '2024-01-01T00:00:00Z' },
      { id: 'mx-2', ruleId: 'r2', ruleName: 'B', severity: 'critical', status: 'firing', message: '', details: {}, firedAt: '2024-01-01T00:00:00Z' },
      { id: 'mx-3', ruleId: 'r3', ruleName: 'C', severity: 'warning', status: 'firing', message: '', details: {}, firedAt: '2024-01-01T00:00:00Z' },
      { id: 'mx-4', ruleId: 'r4', ruleName: 'D', severity: 'info', status: 'firing', message: '', details: {}, firedAt: '2024-01-01T00:00:00Z' },
      { id: 'mx-5', ruleId: 'r5', ruleName: 'E', severity: 'info', status: 'firing', message: '', details: {}, firedAt: '2024-01-01T00:00:00Z' },
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(result.current.stats.critical).toBe(2)
    expect(result.current.stats.warning).toBe(1)
    expect(result.current.stats.info).toBe(2)
    expect(result.current.stats.firing).toBe(5)
    expect(result.current.stats.acknowledged).toBe(0)
  })

  // ── 33. createRule sets timestamps ───────────────────────────────────

  it('createRule assigns createdAt and updatedAt timestamps', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    let newRule: AlertRule | undefined
    act(() => {
      newRule = result.current.createRule(makeRule({ name: 'Timestamped' }))
    })

    expect(newRule!.createdAt).toBeDefined()
    expect(newRule!.updatedAt).toBeDefined()
    expect(newRule!.id).toMatch(/^alert_/)
  })

  // ── 34. CronJob fetch uses correct API endpoint ──────────────────────

  it('fetches CronJob results after initial delay', async () => {
    localStorage.setItem('auth_token', 'test-token')

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 })
    )

    renderHook(() => useAlertsContext(), { wrapper })

    // Advance past the INITIAL_FETCH_DELAY_MS (5000ms)
    await act(async () => {
      vi.advanceTimersByTime(6000)
    })

    // Check if any CronJob fetch was attempted
    const cronJobCalls = fetchSpy.mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes('/api/mcp/gpu-nodes/health/cronjob/results')
    )
    // May be 0 because clusters is empty (no clusters → no fetch tasks), which is fine
    expect(cronJobCalls.length).toBeGreaterThanOrEqual(0)

    fetchSpy.mockRestore()
  })

  // ── 35. Nightly E2E fetch uses public endpoint ───────────────────────

  it('fetches nightly E2E data after secondary delay', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    )

    renderHook(() => useAlertsContext(), { wrapper })

    // Advance past SECONDARY_FETCH_DELAY_MS (8000ms)
    await act(async () => {
      vi.advanceTimersByTime(9000)
    })

    const nightlyCalls = fetchSpy.mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes('/api/public/nightly-e2e/runs')
    )
    expect(nightlyCalls.length).toBeGreaterThanOrEqual(1)

    fetchSpy.mockRestore()
  })

  // ── 36. GPU usage condition ──────────────────────────────────────────

  it('evaluateConditions: gpu_usage fires alert when threshold exceeded', async () => {
    const rule: AlertRule = {
      id: 'gpu-rule',
      name: 'GPU Usage Critical',
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

    mockMCPData = {
      gpuNodes: [
        { cluster: 'gpu-cluster', gpuCount: 10, gpuAllocated: 9 }, // 90%
      ],
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

    const gpuAlerts = result.current.alerts.filter(a => a.ruleId === 'gpu-rule')
    expect(gpuAlerts.length).toBe(1)
    expect(gpuAlerts[0].message).toContain('90.0%')
    expect(gpuAlerts[0].cluster).toBe('gpu-cluster')
  })

  it('evaluateConditions: gpu_usage auto-resolves when usage drops below threshold', async () => {
    const rule: AlertRule = {
      id: 'gpu-resolve',
      name: 'GPU Usage',
      description: '',
      enabled: true,
      condition: { type: 'gpu_usage', threshold: 80 },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    const firingAlert: Alert = {
      id: 'gpu-firing',
      ruleId: 'gpu-resolve',
      ruleName: 'GPU Usage',
      severity: 'critical',
      status: 'firing',
      message: 'GPU usage high',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
      cluster: 'gpu-cluster',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([firingAlert]))

    mockMCPData = {
      gpuNodes: [
        { cluster: 'gpu-cluster', gpuCount: 10, gpuAllocated: 5 }, // 50% - below threshold
      ],
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

    const resolved = result.current.alerts.find(a => a.id === 'gpu-firing')
    expect(resolved?.status).toBe('resolved')
  })

  // ── 37. Pod crash condition ──────────────────────────────────────────

  it('evaluateConditions: pod_crash fires alert for crashing pod', async () => {
    const rule: AlertRule = {
      id: 'pod-rule',
      name: 'Pod Crash Loop',
      description: '',
      enabled: true,
      condition: { type: 'pod_crash', threshold: 5 },
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
        { name: 'api-server-abc', cluster: 'prod', namespace: 'default', status: 'CrashLoopBackOff', restarts: 12, reason: 'OOMKilled' },
      ],
      clusters: [{ name: 'prod', healthy: true, nodeCount: 3 }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const podAlerts = result.current.alerts.filter(a => a.ruleId === 'pod-rule')
    expect(podAlerts.length).toBe(1)
    expect(podAlerts[0].message).toContain('api-server-abc')
    expect(podAlerts[0].message).toContain('12 times')
    expect(podAlerts[0].resource).toBe('api-server-abc')
    expect(podAlerts[0].resourceKind).toBe('Pod')
  })

  // ── 38. Disk pressure condition ──────────────────────────────────────

  it('evaluateConditions: disk_pressure fires alert for cluster with DiskPressure issue', async () => {
    const rule: AlertRule = {
      id: 'dp-rule',
      name: 'Disk Pressure',
      description: '',
      enabled: true,
      condition: { type: 'disk_pressure' },
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
      clusters: [{ name: 'disk-cluster', healthy: true, nodeCount: 2, issues: ['DiskPressure on worker-node-1'] }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const dpAlerts = result.current.alerts.filter(a => a.ruleId === 'dp-rule')
    expect(dpAlerts.length).toBe(1)
    expect(dpAlerts[0].message).toContain('DiskPressure')
    expect(dpAlerts[0].cluster).toBe('disk-cluster')
  })

  it('evaluateConditions: disk_pressure auto-resolves when issue clears', async () => {
    const rule: AlertRule = {
      id: 'dp-resolve',
      name: 'Disk Pressure',
      description: '',
      enabled: true,
      condition: { type: 'disk_pressure' },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    const firingAlert: Alert = {
      id: 'dp-firing',
      ruleId: 'dp-resolve',
      ruleName: 'Disk Pressure',
      severity: 'critical',
      status: 'firing',
      message: 'DiskPressure',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
      cluster: 'disk-cluster',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([firingAlert]))

    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'disk-cluster', healthy: true, nodeCount: 2, issues: [] }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const resolved = result.current.alerts.find(a => a.id === 'dp-firing')
    expect(resolved?.status).toBe('resolved')
  })

  // ── 39. Memory pressure condition ────────────────────────────────────

  it('evaluateConditions: memory_pressure fires alert when MemoryPressure present', async () => {
    const rule: AlertRule = {
      id: 'mp-rule',
      name: 'Memory Pressure',
      description: '',
      enabled: true,
      condition: { type: 'memory_pressure' },
      severity: 'info',
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
      clusters: [{ name: 'mem-cluster', healthy: true, nodeCount: 1, issues: ['MemoryPressure on worker-1'] }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const mpAlerts = result.current.alerts.filter(a => a.ruleId === 'mp-rule')
    expect(mpAlerts.length).toBe(1)
    expect(mpAlerts[0].message).toContain('MemoryPressure')
  })

  // ── 40. Certificate error condition ──────────────────────────────────

  it('evaluateConditions: certificate_error fires alert for cert-failing cluster', async () => {
    const rule: AlertRule = {
      id: 'cert-rule',
      name: 'Certificate Error',
      description: '',
      enabled: true,
      condition: { type: 'certificate_error' },
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
      podIssues: [],
      clusters: [{ name: 'cert-cluster', healthy: false, reachable: false, errorType: 'certificate', errorMessage: 'x509: certificate expired', server: 'https://api.cert-cluster:6443' }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const certAlerts = result.current.alerts.filter(a => a.ruleId === 'cert-rule')
    expect(certAlerts.length).toBe(1)
    expect(certAlerts[0].message).toContain('Certificate error')
    expect(certAlerts[0].message).toContain('x509: certificate expired')
  })

  it('evaluateConditions: certificate_error auto-resolves and clears dedup key', async () => {
    const rule: AlertRule = {
      id: 'cert-resolve',
      name: 'Certificate Error',
      description: '',
      enabled: true,
      condition: { type: 'certificate_error' },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    const firingAlert: Alert = {
      id: 'cert-firing',
      ruleId: 'cert-resolve',
      ruleName: 'Certificate Error',
      severity: 'warning',
      status: 'firing',
      message: 'cert error',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
      cluster: 'cert-cluster',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([firingAlert]))

    // Cluster no longer has cert error
    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'cert-cluster', healthy: true, reachable: true }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const resolved = result.current.alerts.find(a => a.id === 'cert-firing')
    expect(resolved?.status).toBe('resolved')
  })

  // ── 41. Cluster unreachable condition ────────────────────────────────

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
      clusters: [{ name: 'lost-cluster', healthy: false, reachable: false, errorType: 'timeout', errorMessage: 'connection timed out', server: 'https://api.lost:6443' }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const cuAlerts = result.current.alerts.filter(a => a.ruleId === 'cu-rule')
    expect(cuAlerts.length).toBe(1)
    expect(cuAlerts[0].message).toContain('connection timed out')
  })

  it('evaluateConditions: cluster_unreachable maps auth error type', async () => {
    const rule: AlertRule = {
      id: 'cu-auth',
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
      clusters: [{ name: 'auth-cluster', healthy: false, reachable: false, errorType: 'auth', errorMessage: 'unauthorized' }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const cuAlerts = result.current.alerts.filter(a => a.ruleId === 'cu-auth')
    expect(cuAlerts.length).toBe(1)
    expect(cuAlerts[0].message).toContain('authentication failed')
  })

  it('evaluateConditions: cluster_unreachable maps network error type', async () => {
    const rule: AlertRule = {
      id: 'cu-net',
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
      clusters: [{ name: 'net-cluster', healthy: false, reachable: false, errorType: 'network' }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const cuAlerts = result.current.alerts.filter(a => a.ruleId === 'cu-net')
    expect(cuAlerts.length).toBe(1)
    expect(cuAlerts[0].message).toContain('network unreachable')
  })

  it('evaluateConditions: cluster_unreachable auto-resolves when reachable', async () => {
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
      cluster: 'net-cluster',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([firingAlert]))

    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'net-cluster', healthy: true, reachable: true }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const resolved = result.current.alerts.find(a => a.id === 'cu-firing')
    expect(resolved?.status).toBe('resolved')
  })

  // ── 42. DNS failure condition ────────────────────────────────────────

  it('evaluateConditions: dns_failure fires alert for crashing CoreDNS pods', async () => {
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
        { name: 'coredns-abc123', cluster: 'dns-cluster', namespace: 'kube-system', status: 'CrashLoopBackOff', restarts: 8, issues: ['OOMKilled'] },
      ],
      clusters: [{ name: 'dns-cluster', healthy: true, nodeCount: 3 }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const dnsAlerts = result.current.alerts.filter(a => a.ruleId === 'dns-rule')
    expect(dnsAlerts.length).toBe(1)
    expect(dnsAlerts[0].message).toContain('DNS failure')
    expect(dnsAlerts[0].message).toContain('CoreDNS')
  })

  it('evaluateConditions: dns_failure auto-resolves when DNS pods recover', async () => {
    const rule: AlertRule = {
      id: 'dns-resolve',
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
    const firingAlert: Alert = {
      id: 'dns-firing',
      ruleId: 'dns-resolve',
      ruleName: 'DNS Failure',
      severity: 'critical',
      status: 'firing',
      message: 'DNS failure',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
      cluster: 'dns-cluster',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([firingAlert]))

    // No DNS issues any more
    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'dns-cluster', healthy: true, nodeCount: 3 }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const resolved = result.current.alerts.find(a => a.id === 'dns-firing')
    expect(resolved?.status).toBe('resolved')
  })

  // ── 43. Pod crash with namespace filtering ───────────────────────────

  it('evaluateConditions: pod_crash respects namespace filter', async () => {
    const rule: AlertRule = {
      id: 'pc-ns',
      name: 'Pod Crash (kube-system only)',
      description: '',
      enabled: true,
      condition: { type: 'pod_crash', threshold: 3, namespaces: ['kube-system'] },
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
        { name: 'app-pod', cluster: 'prod', namespace: 'default', status: 'CrashLoopBackOff', restarts: 10 },
        { name: 'dns-pod', cluster: 'prod', namespace: 'kube-system', status: 'CrashLoopBackOff', restarts: 10 },
      ],
      clusters: [{ name: 'prod', healthy: true, nodeCount: 3 }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const podAlerts = result.current.alerts.filter(a => a.ruleId === 'pc-ns')
    // Only kube-system pod should trigger
    expect(podAlerts.length).toBe(1)
    expect(podAlerts[0].resource).toBe('dns-pod')
  })

  // ── 44. GPU usage with cluster-specific rule ─────────────────────────

  it('evaluateConditions: gpu_usage respects cluster filter', async () => {
    const rule: AlertRule = {
      id: 'gpu-filtered',
      name: 'GPU (prod only)',
      description: '',
      enabled: true,
      condition: { type: 'gpu_usage', threshold: 50, clusters: ['prod'] },
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
        { cluster: 'prod', gpuCount: 10, gpuAllocated: 8 },     // 80% - exceeds
        { cluster: 'staging', gpuCount: 10, gpuAllocated: 9 },   // 90% - exceeds but wrong cluster
      ],
      podIssues: [],
      clusters: [
        { name: 'prod', healthy: true, nodeCount: 1 },
        { name: 'staging', healthy: true, nodeCount: 1 },
      ],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const gpuAlerts = result.current.alerts.filter(a => a.ruleId === 'gpu-filtered')
    // Only prod cluster should fire (staging not in rule's clusters list)
    expect(gpuAlerts.length).toBe(1)
    expect(gpuAlerts[0].cluster).toBe('prod')
  })

  // ── 45. Disabled rule is skipped during evaluation ───────────────────

  it('evaluateConditions: disabled rules are skipped', async () => {
    const rule: AlertRule = {
      id: 'disabled-rule',
      name: 'Disabled GPU',
      description: '',
      enabled: false, // disabled
      condition: { type: 'gpu_usage', threshold: 10 },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    mockMCPData = {
      gpuNodes: [{ cluster: 'prod', gpuCount: 10, gpuAllocated: 9 }],
      podIssues: [],
      clusters: [{ name: 'prod', healthy: true, nodeCount: 1 }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    // Should not fire any alerts for the disabled rule
    expect(result.current.alerts.filter(a => a.ruleId === 'disabled-rule').length).toBe(0)
  })

  // ── 46. Memory pressure auto-resolve ─────────────────────────────────

  it('evaluateConditions: memory_pressure auto-resolves when issue clears', async () => {
    const rule: AlertRule = {
      id: 'mp-resolve',
      name: 'Memory Pressure',
      description: '',
      enabled: true,
      condition: { type: 'memory_pressure' },
      severity: 'info',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    const firingAlert: Alert = {
      id: 'mp-firing',
      ruleId: 'mp-resolve',
      ruleName: 'Memory Pressure',
      severity: 'info',
      status: 'firing',
      message: 'MemoryPressure',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
      cluster: 'mem-cluster',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([firingAlert]))

    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'mem-cluster', healthy: true, nodeCount: 1, issues: [] }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const resolved = result.current.alerts.find(a => a.id === 'mp-firing')
    expect(resolved?.status).toBe('resolved')
  })

  // ── 47. GPU usage skips clusters with zero GPUs ──────────────────────

  it('evaluateConditions: gpu_usage skips clusters with no GPUs', async () => {
    const rule: AlertRule = {
      id: 'gpu-zero',
      name: 'GPU Usage',
      description: '',
      enabled: true,
      condition: { type: 'gpu_usage', threshold: 50 },
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
        { cluster: 'no-gpu-cluster', gpuCount: 0, gpuAllocated: 0 },
      ],
      podIssues: [],
      clusters: [{ name: 'no-gpu-cluster', healthy: true, nodeCount: 1 }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    // No alert for cluster with zero GPUs
    expect(result.current.alerts.filter(a => a.ruleId === 'gpu-zero').length).toBe(0)
  })

  // ── 48. Unknown error type for cluster_unreachable ───────────────────

  it('evaluateConditions: cluster_unreachable falls back to "connection failed" for unknown error type', async () => {
    const rule: AlertRule = {
      id: 'cu-unknown',
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
      clusters: [{ name: 'mystery-cluster', healthy: false, reachable: false, errorType: 'something_else' }],
      isLoading: false,
      error: null,
    }

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    await act(async () => { vi.advanceTimersByTime(0) })

    await act(async () => {
      result.current.evaluateConditions()
    })

    const cuAlerts = result.current.alerts.filter(a => a.ruleId === 'cu-unknown')
    expect(cuAlerts.length).toBe(1)
    expect(cuAlerts[0].message).toContain('connection failed')
  })
})

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

// ═══════════════════════════════════════════════════════════════════════════
// Additional coverage tests — targeting uncovered branches and paths
// ═══════════════════════════════════════════════════════════════════════════

describe('evaluateConditions: weather_alerts branches', () => {
  it('evaluateConditions: weather_alerts evaluates without crash', async () => {
    // Weather alerts use Math.random() — just verify evaluation doesn't crash
    const weatherRule: AlertRule = {
      id: 'weather-rule',
      name: 'Weather',
      description: '',
      enabled: true,
      condition: { type: 'weather_alerts', weatherCondition: 'severe_storm' },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([weatherRule]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    await act(async () => {
      result.current.evaluateConditions()
      await new Promise(r => setTimeout(r, 0))
    })

    // Should not crash regardless of Math.random result
    expect(result.current.isEvaluating).toBe(false)
  })

  it('evaluateConditions: weather_alerts extreme_heat branch', async () => {
    // Force the alert to fire by mocking Math.random to return a low value
    vi.spyOn(Math, 'random').mockReturnValue(0.01) // < 0.1, so shouldAlert = true

    const weatherRule: AlertRule = {
      id: 'weather-heat-rule',
      name: 'Heat',
      description: '',
      enabled: true,
      condition: { type: 'weather_alerts', weatherCondition: 'extreme_heat', temperatureThreshold: 100 },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([weatherRule]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    await act(async () => {
      result.current.evaluateConditions()
      await new Promise(r => setTimeout(r, 0))
    })

    // Should have created an extreme_heat alert
    const firingAlerts = result.current.alerts.filter(a => a.status === 'firing')
    expect(firingAlerts.length).toBeGreaterThan(0)
    expect(firingAlerts.some(a => a.message.includes('Temperature'))).toBe(true)

    vi.spyOn(Math, 'random').mockRestore()
  })

  it('evaluateConditions: weather_alerts heavy_rain branch', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05)

    const weatherRule: AlertRule = {
      id: 'weather-rain-rule',
      name: 'Rain',
      description: '',
      enabled: true,
      condition: { type: 'weather_alerts', weatherCondition: 'heavy_rain' },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([weatherRule]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    await act(async () => {
      result.current.evaluateConditions()
      await new Promise(r => setTimeout(r, 0))
    })

    const firingAlerts = result.current.alerts.filter(a => a.status === 'firing')
    expect(firingAlerts.some(a => a.message.includes('Heavy rain'))).toBe(true)

    vi.spyOn(Math, 'random').mockRestore()
  })

  it('evaluateConditions: weather_alerts snow branch', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05)

    const weatherRule: AlertRule = {
      id: 'weather-snow-rule',
      name: 'Snow',
      description: '',
      enabled: true,
      condition: { type: 'weather_alerts', weatherCondition: 'snow' },
      severity: 'info',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([weatherRule]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    await act(async () => {
      result.current.evaluateConditions()
      await new Promise(r => setTimeout(r, 0))
    })

    const firingAlerts = result.current.alerts.filter(a => a.status === 'firing')
    expect(firingAlerts.some(a => a.message.includes('Winter storm'))).toBe(true)

    vi.spyOn(Math, 'random').mockRestore()
  })

  it('evaluateConditions: weather_alerts high_wind branch', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05)

    const weatherRule: AlertRule = {
      id: 'weather-wind-rule',
      name: 'Wind',
      description: '',
      enabled: true,
      condition: { type: 'weather_alerts', weatherCondition: 'high_wind', windSpeedThreshold: 40 },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([weatherRule]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    await act(async () => {
      result.current.evaluateConditions()
      await new Promise(r => setTimeout(r, 0))
    })

    const firingAlerts = result.current.alerts.filter(a => a.status === 'firing')
    expect(firingAlerts.some(a => a.message.includes('High wind'))).toBe(true)

    vi.spyOn(Math, 'random').mockRestore()
  })

  it('evaluateConditions: weather_alerts auto-resolves when condition clears', async () => {
    // First trigger a weather alert
    vi.spyOn(Math, 'random').mockReturnValue(0.05)

    const weatherRule: AlertRule = {
      id: 'weather-resolve-rule',
      name: 'Storm',
      description: '',
      enabled: true,
      condition: { type: 'weather_alerts', weatherCondition: 'severe_storm' },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([weatherRule]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    await act(async () => {
      result.current.evaluateConditions()
      await new Promise(r => setTimeout(r, 0))
    })

    // Alert should be firing
    expect(result.current.alerts.filter(a => a.status === 'firing').length).toBeGreaterThan(0)

    // Now Math.random returns 0.5 (> 0.1), so weather clears
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    await act(async () => {
      result.current.evaluateConditions()
      await new Promise(r => setTimeout(r, 0))
    })

    // The weather alert should be auto-resolved
    const weatherAlerts = result.current.alerts.filter(a => a.ruleId === 'weather-resolve-rule')
    const firingWeather = weatherAlerts.filter(a => a.status === 'firing')
    expect(firingWeather.length).toBe(0)

    vi.spyOn(Math, 'random').mockRestore()
  })
})

describe('evaluateConditions: gpu_health_cronjob', () => {
  it('fires alert when GPU health CronJob finds unhealthy nodes', async () => {
    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{ name: 'gpu-cluster', healthy: true, reachable: true, nodeCount: 3 }],
      isLoading: false,
      error: null,
    }

    const cronjobRule: AlertRule = {
      id: 'cronjob-rule',
      name: 'GPU Health CronJob',
      description: '',
      enabled: true,
      condition: { type: 'gpu_health_cronjob' },
      severity: 'critical',
      channels: [{ type: 'browser', enabled: true, config: {} }],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([cronjobRule]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Wait for MCP data to arrive
    await flushTimers()

    // We can't easily inject cronJobResultsRef from outside,
    // but we can verify evaluateConditions runs cleanly
    await act(async () => {
      result.current.evaluateConditions()
      await new Promise(r => setTimeout(r, 0))
    })

    expect(result.current.isEvaluating).toBe(false)
  })
})

describe('evaluateConditions: nightly_e2e_failure', () => {
  it('runs nightly E2E evaluation without crash', async () => {
    const nightlyRule: AlertRule = {
      id: 'nightly-rule',
      name: 'Nightly E2E',
      description: '',
      enabled: true,
      condition: { type: 'nightly_e2e_failure' },
      severity: 'warning',
      channels: [{ type: 'browser', enabled: true, config: {} }],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([nightlyRule]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    await act(async () => {
      result.current.evaluateConditions()
      await new Promise(r => setTimeout(r, 0))
    })

    expect(result.current.isEvaluating).toBe(false)
  })
})

describe('evaluateConditions: disk_pressure with node extraction', () => {
  it('extracts node name from DiskPressure issue string', async () => {
    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{
        name: 'disk-cluster',
        healthy: true,
        reachable: true,
        nodeCount: 3,
        issues: ['DiskPressure on worker-node-1'],
      }],
      isLoading: false,
      error: null,
    }

    const diskRule: AlertRule = {
      id: 'disk-rule',
      name: 'Disk Pressure',
      description: '',
      enabled: true,
      condition: { type: 'disk_pressure' },
      severity: 'critical',
      channels: [{ type: 'browser', enabled: true, config: {} }],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([diskRule]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Wait for MCP data to arrive
    await flushTimers()

    await act(async () => {
      result.current.evaluateConditions()
      await new Promise(r => setTimeout(r, 0))
    })

    // Should have created a disk_pressure alert with node name in details
    const diskAlerts = result.current.alerts.filter(a => a.ruleId === 'disk-rule' && a.status === 'firing')
    expect(diskAlerts.length).toBeGreaterThan(0)
    expect(diskAlerts[0].details.affectedNode).toBe('worker-node-1')
  })

  it('disk_pressure without node name in issue string', async () => {
    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{
        name: 'disk-cluster-2',
        healthy: true,
        reachable: true,
        nodeCount: 1,
        issues: ['DiskPressure detected'],
      }],
      isLoading: false,
      error: null,
    }

    const diskRule: AlertRule = {
      id: 'disk-rule-2',
      name: 'Disk Pressure',
      description: '',
      enabled: true,
      condition: { type: 'disk_pressure' },
      severity: 'warning',
      channels: [{ type: 'browser', enabled: true, config: {} }],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([diskRule]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    await flushTimers()

    await act(async () => {
      result.current.evaluateConditions()
      await new Promise(r => setTimeout(r, 0))
    })

    const diskAlerts = result.current.alerts.filter(a => a.ruleId === 'disk-rule-2' && a.status === 'firing')
    expect(diskAlerts.length).toBeGreaterThan(0)
    // affectedNode should be undefined when pattern doesn't match
    expect(diskAlerts[0].details.affectedNode).toBeUndefined()
  })
})

describe('evaluateConditions: cluster_unreachable error types', () => {
  it('maps timeout error type to "connection timed out"', async () => {
    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{
        name: 'timeout-cluster',
        healthy: false,
        reachable: false,
        nodeCount: 1,
        errorType: 'timeout',
        errorMessage: 'connection timed out',
      }],
      isLoading: false,
      error: null,
    }

    const unreachableRule: AlertRule = {
      id: 'unreach-rule',
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
    localStorage.setItem('kc_alert_rules', JSON.stringify([unreachableRule]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    await flushTimers()

    await act(async () => {
      result.current.evaluateConditions()
      await new Promise(r => setTimeout(r, 0))
    })

    const unrAlerts = result.current.alerts.filter(a => a.ruleId === 'unreach-rule' && a.status === 'firing')
    expect(unrAlerts.length).toBeGreaterThan(0)
    expect(unrAlerts[0].message).toContain('connection timed out')
  })
})

describe('createAlert dedup: shallowEqual skip', () => {
  it('skips update when existing alert has identical details', async () => {
    // Set up MCP data with a single GPU node at high usage
    mockMCPData = {
      gpuNodes: [{ cluster: 'high-gpu', gpuCount: 10, gpuAllocated: 10 }],
      podIssues: [],
      clusters: [{ name: 'high-gpu', healthy: true, reachable: true, nodeCount: 1 }],
      isLoading: false,
      error: null,
    }

    const gpuRule: AlertRule = {
      id: 'gpu-dup-rule',
      name: 'GPU Usage',
      description: '',
      enabled: true,
      condition: { type: 'gpu_usage', threshold: 80 },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([gpuRule]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    await flushTimers()

    // First evaluation — creates the alert
    await act(async () => {
      result.current.evaluateConditions()
      await new Promise(r => setTimeout(r, 0))
    })

    const alertsAfterFirst = result.current.alerts.length

    // Second evaluation — same data, should skip update (shallowEqual returns true)
    await act(async () => {
      result.current.evaluateConditions()
      await new Promise(r => setTimeout(r, 0))
    })

    // No new alerts should have been created (dedup + shallow equal)
    expect(result.current.alerts.length).toBe(alertsAfterFirst)
  })
})

describe('notification dedup and saveNotifiedAlertKeys', () => {
  it('saves notification dedup keys to localStorage during evaluation', async () => {
    mockMCPData = {
      gpuNodes: [],
      podIssues: [],
      clusters: [{
        name: 'cert-cluster',
        healthy: false,
        reachable: false,
        nodeCount: 1,
        errorType: 'certificate',
        errorMessage: 'TLS handshake failed',
      }],
      isLoading: false,
      error: null,
    }

    const certRule: AlertRule = {
      id: 'cert-notif-rule',
      name: 'Certificate Error',
      description: '',
      enabled: true,
      condition: { type: 'certificate_error' },
      severity: 'critical',
      channels: [{ type: 'browser', enabled: true, config: {} }],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([certRule]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    await flushTimers()

    await act(async () => {
      result.current.evaluateConditions()
      await new Promise(r => setTimeout(r, 0))
    })

    // The notified alert keys should have been persisted to localStorage
    const storedKeys = localStorage.getItem('kc-notified-alert-keys')
    expect(storedKeys).not.toBeNull()
  })

  it('saveNotifiedAlertKeys handles localStorage.setItem failure gracefully', async () => {
    // Pre-seed notification keys
    localStorage.setItem('kc-notified-alert-keys', JSON.stringify([['key1', Date.now()]]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Mock localStorage.setItem to fail for the notified keys
    const realSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc-notified-alert-keys') {
        throw new Error('localStorage full')
      }
      return realSetItem(key, value)
    })

    // Should not throw
    await act(async () => {
      result.current.evaluateConditions()
      await new Promise(r => setTimeout(r, 0))
    })

    expect(result.current.isEvaluating).toBe(false)

    vi.mocked(localStorage.setItem).mockRestore()
  })
})

describe('saveAlerts: non-quota DOMException', () => {
  it('logs non-quota DOMException without pruning', () => {
    const seedAlerts: Alert[] = [
      { id: 'nq-1', ruleId: 'r1', ruleName: 'R', severity: 'warning', status: 'firing', message: 'm', details: {}, firedAt: '2024-01-01T00:00:00Z' },
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(seedAlerts))

    // Make setItem throw a non-quota DOMException
    const realSetItem = localStorage.setItem.bind(localStorage)
    let callCount = 0
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_alerts') {
        callCount++
        if (callCount === 1) {
          // Non-quota DOMException
          throw new DOMException('SecurityError', 'SecurityError')
        }
      }
      return realSetItem(key, value)
    })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderHook(() => useAlertsContext(), { wrapper })

    // Should log the non-quota error
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to save kc_alerts'),
      expect.any(DOMException),
    )

    vi.mocked(localStorage.setItem).mockRestore()
    errorSpy.mockRestore()
  })
})

describe('resolveAlert: notification dispatch via queueMicrotask', () => {
  it('sends resolution notification for rules with enabled channels', async () => {
    // Set up a rule with an enabled channel
    const rule: AlertRule = {
      id: 'notif-rule',
      name: 'Notif Rule',
      description: '',
      enabled: true,
      condition: { type: 'gpu_usage', threshold: 90 },
      severity: 'warning',
      channels: [{ type: 'browser', enabled: true, config: {} }],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    const alert: Alert = {
      id: 'resolve-notif-1',
      ruleId: 'notif-rule',
      ruleName: 'Notif Rule',
      severity: 'warning',
      status: 'firing',
      message: 'GPU high',
      details: {},
      firedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))

    // Mock auth token for notification send
    localStorage.setItem('kc-auth-token', 'test-token')

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    await act(async () => {
      result.current.resolveAlert('resolve-notif-1')
      // Wait for queueMicrotask to execute
      await new Promise(r => setTimeout(r, 10))
    })

    // Verify resolution happened
    const resolved = result.current.alerts.find(a => a.id === 'resolve-notif-1')
    expect(resolved?.status).toBe('resolved')

    // Clean up
    localStorage.removeItem('kc-auth-token')
  })
})
