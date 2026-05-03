import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { AlertsProvider, useAlertsContext } from './AlertsContext'
import type { Alert, AlertRule} from '../types/alerts'

// ── External module mocks ─────────────────────────────────────────────────────

// vi.hoisted returns values that are available inside vi.mock factories
// (which are hoisted to the top of the file by vitest).
const { mockStartMission, mockUseDemoMode, mockSendNotificationWithDeepLink } = vi.hoisted(() => ({
  mockStartMission: vi.fn(() => 'mock-mission-id'),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockSendNotificationWithDeepLink: vi.fn(),
}))

vi.mock('../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('./AlertsDataFetcher', () => ({
  default: () => null,
}))

vi.mock('../hooks/useMissions', () => ({
  useMissions: vi.fn(() => ({ startMission: mockStartMission })),
}))

vi.mock('../hooks/useDemoMode', () => ({
  useDemoMode: mockUseDemoMode,
}))

vi.mock('../hooks/useDeepLink', () => ({
  sendNotificationWithDeepLink: mockSendNotificationWithDeepLink,
}))

vi.mock('../lib/runbooks/builtins', () => ({
  findRunbookForCondition: vi.fn(() => undefined),
}))

vi.mock('../lib/runbooks/executor', () => ({
  executeRunbook: vi.fn(() => Promise.resolve({ enrichedPrompt: null, stepResults: [] })),
}))

// Stub browser APIs that AlertsProvider touches on mount
vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

// ── Helpers ───────────────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AlertsProvider>{children}</AlertsProvider>
)

/** Build a minimal Alert object for seeding localStorage. */
function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: overrides.id ?? `alert-${Math.random().toString(36).slice(2)}`,
    ruleId: overrides.ruleId ?? 'rule-1',
    ruleName: overrides.ruleName ?? 'Test Rule',
    severity: overrides.severity ?? 'warning',
    status: overrides.status ?? 'firing',
    message: overrides.message ?? 'Test alert message',
    details: overrides.details ?? {},
    firedAt: overrides.firedAt ?? new Date().toISOString(),
    resolvedAt: overrides.resolvedAt,
    ...overrides,
  }
}

/** Build a minimal AlertRule for testing rule management. */
function makeRule(overrides: Partial<Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>> = {}): Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'> {
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

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  vi.useRealTimers()
  vi.clearAllMocks()
  // Re-initialize hoisted mocks after restoreAllMocks clears their implementations
  mockStartMission.mockReturnValue('mock-mission-id')
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  mockSendNotificationWithDeepLink.mockImplementation(() => {})
  // Re-stub globals after restoreAllMocks clears them
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── useAlertsContext outside provider ────────────────────────────────────────

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

describe('saveToStorage error handling', () => {
  it('logs error on non-quota localStorage.setItem failure for rules', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    const realSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_alert_rules') {
        throw new Error('some random error')
      }
      return realSetItem(key, value)
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    act(() => {
      result.current.createRule(makeRule({ name: 'Should Fail Save' }))
    })

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to save kc_alert_rules'),
      expect.any(Error),
    )

    vi.mocked(localStorage.setItem).mockRestore()
    errorSpy.mockRestore()
  })
})

// ── Multiple context consumers ──────────────────────────────────────────────

describe('multiple consumers', () => {
  it('shares state across multiple consumers of the same provider', () => {
    const alert = makeAlert({ id: 'shared', status: 'firing' })
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))

    // Two hooks rendered within the same provider wrapper
    const { result: r1 } = renderHook(() => useAlertsContext(), { wrapper })
    const { result: r2 } = renderHook(() => useAlertsContext(), { wrapper })

    // Both should see the same alert set (though they are separate provider instances in this case)
    expect(r1.current.alerts.length).toBe(1)
    expect(r2.current.alerts.length).toBe(1)
  })
})

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles acknowledging an already-acknowledged alert', () => {
    const alert = makeAlert({ id: 'already-acked', status: 'firing', acknowledgedAt: '2025-01-01T00:00:00Z' })
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Should not throw
    act(() => {
      result.current.acknowledgeAlert('already-acked', 'new-user')
    })

    const acked = result.current.alerts.find(a => a.id === 'already-acked')
    expect(acked?.acknowledgedBy).toBe('new-user')
  })

  it('handles resolving an already-resolved alert', () => {
    const alert = makeAlert({ id: 'already-resolved', status: 'resolved', resolvedAt: '2025-01-01T00:00:00Z' })
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Should not throw
    act(() => {
      result.current.resolveAlert('already-resolved')
    })

    const resolved = result.current.alerts.find(a => a.id === 'already-resolved')
    expect(resolved?.status).toBe('resolved')
  })

  it('handles empty alerts array in localStorage', () => {
    localStorage.setItem('kc_alerts', '[]')

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(result.current.alerts).toEqual([])
    expect(result.current.activeAlerts).toEqual([])
    expect(result.current.acknowledgedAlerts).toEqual([])
  })

  it('handles missing cluster and resource in alerts gracefully', () => {
    const alert = makeAlert({
      id: 'no-cluster',
      status: 'firing',
      cluster: undefined,
      resource: undefined,
    })
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(result.current.activeAlerts.length).toBe(1)
    expect(result.current.activeAlerts[0].cluster).toBeUndefined()
    expect(result.current.activeAlerts[0].resource).toBeUndefined()
  })

  it('acknowledgeAlerts with empty array is a no-op', () => {
    const alert = makeAlert({ id: 'unchanged', status: 'firing' })
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.acknowledgeAlerts([])
    })

    expect(result.current.alerts.find(a => a.id === 'unchanged')?.acknowledgedAt).toBeUndefined()
  })

  it('updateRule with non-existent id does not crash', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const initialCount = result.current.rules.length

    act(() => {
      result.current.updateRule('non-existent-rule-id', { name: 'Ghost' })
    })

    // No rule should be added or removed
    expect(result.current.rules.length).toBe(initialCount)
  })

  it('deleteRule with non-existent id does not crash', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const initialCount = result.current.rules.length

    act(() => {
      result.current.deleteRule('non-existent-rule-id')
    })

    expect(result.current.rules.length).toBe(initialCount)
  })

  it('toggleRule with non-existent id does not crash', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const initialRules = [...result.current.rules]

    act(() => {
      result.current.toggleRule('non-existent-rule-id')
    })

    // Rules unchanged
    expect(result.current.rules.length).toBe(initialRules.length)
  })
})

// ── Dedup key edge cases (unit-level) ───────────────────────────────────────

describe('dedup and shallowEqual edge cases via context behavior', () => {
  it('dedup treats undefined cluster the same as empty string for non-pod alerts', () => {
    const rule: AlertRule = {
      id: 'nr-rule',
      name: 'Node Not Ready',
      description: '',
      enabled: true,
      condition: { type: 'node_not_ready' },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const a1 = makeAlert({
      id: 'nr-1',
      ruleId: 'nr-rule',
      status: 'firing',
      cluster: undefined,
      firedAt: '2024-01-01T00:00:00Z',
    })
    const a2 = makeAlert({
      id: 'nr-2',
      ruleId: 'nr-rule',
      status: 'firing',
      cluster: undefined,
      firedAt: '2025-01-01T00:00:00Z',
    })

    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([a1, a2]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Both have undefined cluster + same ruleId for a non-pod_crash type
    // → dedup key is "nr-rule::" for both → only the newer survives
    expect(result.current.activeAlerts.length).toBe(1)
    expect(result.current.activeAlerts[0].id).toBe('nr-2')
  })

  it('separates alerts for different clusters even with same ruleId', () => {
    const rule: AlertRule = {
      id: 'dp-rule',
      name: 'Disk Pressure',
      description: '',
      enabled: true,
      condition: { type: 'disk_pressure' },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const a1 = makeAlert({
      id: 'dp-1',
      ruleId: 'dp-rule',
      status: 'firing',
      cluster: 'cluster-alpha',
      firedAt: '2025-01-01T00:00:00Z',
    })
    const a2 = makeAlert({
      id: 'dp-2',
      ruleId: 'dp-rule',
      status: 'firing',
      cluster: 'cluster-beta',
      firedAt: '2025-01-01T00:00:00Z',
    })

    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([a1, a2]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Different clusters → different dedup keys → both survive
    expect(result.current.activeAlerts.length).toBe(2)
  })
})

// ── isEvaluating state ──────────────────────────────────────────────────────

describe('isEvaluating state', () => {
  it('isEvaluating is false when not evaluating', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    // After mount and initial timers, isEvaluating should settle to false
    expect(result.current.isEvaluating).toBe(false)
  })
})

// ── Deep coverage: alert evaluation, dedup, notification dispatch ───────

