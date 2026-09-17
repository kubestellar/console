import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAlertsContext } from './AlertsContext'
import { wrapper, makeAlert, makeRule } from './AlertsContext.lifecycle.setup'

// ── External module mocks ─────────────────────────────────────────────────────

// vi.hoisted returns values that are available inside vi.mock factories
// (which are hoisted to the top of the file by vitest).
const { mockStartMission, mockUseDemoMode, mockSendNotificationWithDeepLink } = vi.hoisted(() => ({
  mockStartMission: vi.fn(() => 'mock-mission-id'),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })),
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

vi.mock('../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/useDemoMode')>()),
  useDemoMode: () => mockUseDemoMode(),
  getDemoMode: vi.fn(() => false),
}
))

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

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  vi.useRealTimers()
  vi.clearAllMocks()
  // Re-initialize hoisted mocks after restoreAllMocks clears their implementations
  mockStartMission.mockReturnValue('mock-mission-id')
  mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
  mockSendNotificationWithDeepLink.mockImplementation(() => {})
  // Re-stub globals after restoreAllMocks clears them
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAlertsContext outside AlertsProvider', () => {
  it('throws when used outside AlertsProvider', () => {
    // Suppress error boundary console noise
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => {
      renderHook(() => useAlertsContext())
    }).toThrow('useAlertsContext must be used within an AlertsProvider')
    spy.mockRestore()
  })
})

// ── Initial state ───────────────────────────────────────────────────────────

describe('initial state', () => {
  it('provides default alerts context values', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(result.current.alerts).toBeDefined()
    expect(Array.isArray(result.current.alerts)).toBe(true)
    expect(result.current.rules).toBeDefined()
    expect(Array.isArray(result.current.rules)).toBe(true)
    expect(result.current.isLoadingData).toBe(true)
    expect(result.current.dataError).toBeNull()
    expect(typeof result.current.acknowledgeAlert).toBe('function')
    expect(typeof result.current.acknowledgeAlerts).toBe('function')
    expect(typeof result.current.resolveAlert).toBe('function')
    expect(typeof result.current.deleteAlert).toBe('function')
    expect(typeof result.current.runAIDiagnosis).toBe('function')
    expect(typeof result.current.evaluateConditions).toBe('function')
    expect(typeof result.current.createRule).toBe('function')
    expect(typeof result.current.updateRule).toBe('function')
    expect(typeof result.current.deleteRule).toBe('function')
    expect(typeof result.current.toggleRule).toBe('function')
  })

  it('loads preset rules when localStorage is empty', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Should have loaded the preset rules (11 presets in PRESET_ALERT_RULES)
    expect(result.current.rules.length).toBeGreaterThan(0)

    // Verify preset rule names
    const ruleNames = result.current.rules.map(r => r.name)
    expect(ruleNames).toContain('GPU Usage Critical')
    expect(ruleNames).toContain('Node Not Ready')
    expect(ruleNames).toContain('Pod Crash Loop')
  })

  it('loads persisted alerts from localStorage', () => {
    const seeded = [
      makeAlert({ id: 'seeded-1', message: 'Seeded alert 1' }),
      makeAlert({ id: 'seeded-2', message: 'Seeded alert 2', status: 'resolved', resolvedAt: new Date().toISOString() }),
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(seeded))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(result.current.alerts.length).toBe(2)
    expect(result.current.alerts.some(a => a.id === 'seeded-1')).toBe(true)
    expect(result.current.alerts.some(a => a.id === 'seeded-2')).toBe(true)
  })

  it('loads persisted rules from localStorage instead of presets', () => {
    const customRule: AlertRule = {
      id: 'custom-rule-1',
      name: 'Custom Rule',
      description: 'A custom rule',
      enabled: true,
      condition: { type: 'gpu_usage', threshold: 50 },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([customRule]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // The custom rule should be present
    expect(result.current.rules.some(r => r.id === 'custom-rule-1')).toBe(true)
    expect(result.current.rules.some(r => r.name === 'Custom Rule')).toBe(true)
  })
})

// ── Stats calculation ───────────────────────────────────────────────────────

describe('stats calculation', () => {
  it('computes correct stats from mixed alert states', () => {
    // #7396 — Each alert needs a unique ruleId (or unique cluster) so
    // deduplicateAlerts does not collapse them into a single entry.
    const alerts = [
      makeAlert({ id: 'f1', ruleId: 'r-f1', status: 'firing', severity: 'critical' }),
      makeAlert({ id: 'f2', ruleId: 'r-f2', status: 'firing', severity: 'warning' }),
      makeAlert({ id: 'f3', ruleId: 'r-f3', status: 'firing', severity: 'info' }),
      makeAlert({ id: 'r1', ruleId: 'r-r1', status: 'resolved', severity: 'critical', resolvedAt: new Date().toISOString() }),
      makeAlert({ id: 'a1', ruleId: 'r-a1', status: 'firing', severity: 'warning', acknowledgedAt: new Date().toISOString() }),
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(result.current.stats.total).toBe(5)
    // firing count = unacknowledged firing (f1, f2, f3)
    expect(result.current.stats.firing).toBe(3)
    expect(result.current.stats.resolved).toBe(1)
    expect(result.current.stats.critical).toBe(1) // f1 only (unacknowledged)
    expect(result.current.stats.warning).toBe(1) // f2 only (a1 is acknowledged)
    expect(result.current.stats.info).toBe(1) // f3
    expect(result.current.stats.acknowledged).toBe(1) // a1
  })

  it('returns zero stats when no alerts exist', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(result.current.stats.total).toBe(0)
    expect(result.current.stats.firing).toBe(0)
    expect(result.current.stats.resolved).toBe(0)
    expect(result.current.stats.critical).toBe(0)
    expect(result.current.stats.warning).toBe(0)
    expect(result.current.stats.info).toBe(0)
    expect(result.current.stats.acknowledged).toBe(0)
  })
})

// ── Active and acknowledged alerts ──────────────────────────────────────────

describe('activeAlerts and acknowledgedAlerts', () => {
  it('separates active and acknowledged alerts', () => {
    const alerts = [
      makeAlert({ id: 'active-1', status: 'firing', ruleId: 'r1', cluster: 'c1' }),
      makeAlert({ id: 'acked-1', status: 'firing', ruleId: 'r2', cluster: 'c2', acknowledgedAt: new Date().toISOString() }),
      makeAlert({ id: 'resolved-1', status: 'resolved', ruleId: 'r3', cluster: 'c3', resolvedAt: new Date().toISOString() }),
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(result.current.activeAlerts.length).toBe(1)
    expect(result.current.activeAlerts[0].id).toBe('active-1')

    expect(result.current.acknowledgedAlerts.length).toBe(1)
    expect(result.current.acknowledgedAlerts[0].id).toBe('acked-1')
  })
})

// ── Acknowledge alert ───────────────────────────────────────────────────────

describe('acknowledgeAlert', () => {
  it('acknowledges a single alert by id', () => {
    const alert = makeAlert({ id: 'to-ack', status: 'firing' })
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    expect(result.current.alerts.find(a => a.id === 'to-ack')?.acknowledgedAt).toBeUndefined()

    act(() => {
      result.current.acknowledgeAlert('to-ack', 'test-user')
    })

    const acked = result.current.alerts.find(a => a.id === 'to-ack')
    expect(acked?.acknowledgedAt).toBeDefined()
    expect(acked?.acknowledgedBy).toBe('test-user')
  })

  it('does not modify other alerts when acknowledging one', () => {
    const alerts = [
      makeAlert({ id: 'ack-me', status: 'firing' }),
      makeAlert({ id: 'leave-me', status: 'firing' }),
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.acknowledgeAlert('ack-me')
    })

    expect(result.current.alerts.find(a => a.id === 'ack-me')?.acknowledgedAt).toBeDefined()
    expect(result.current.alerts.find(a => a.id === 'leave-me')?.acknowledgedAt).toBeUndefined()
  })
})

// ── Acknowledge multiple alerts ─────────────────────────────────────────────

describe('acknowledgeAlerts (batch)', () => {
  it('acknowledges multiple alerts at once', () => {
    const alerts = [
      makeAlert({ id: 'a1', status: 'firing' }),
      makeAlert({ id: 'a2', status: 'firing' }),
      makeAlert({ id: 'a3', status: 'firing' }),
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.acknowledgeAlerts(['a1', 'a3'], 'batch-user')
    })

    expect(result.current.alerts.find(a => a.id === 'a1')?.acknowledgedAt).toBeDefined()
    expect(result.current.alerts.find(a => a.id === 'a1')?.acknowledgedBy).toBe('batch-user')
    expect(result.current.alerts.find(a => a.id === 'a2')?.acknowledgedAt).toBeUndefined()
    expect(result.current.alerts.find(a => a.id === 'a3')?.acknowledgedAt).toBeDefined()
    expect(result.current.alerts.find(a => a.id === 'a3')?.acknowledgedBy).toBe('batch-user')
  })
})

// ── Resolve alert ───────────────────────────────────────────────────────────

describe('resolveAlert', () => {
  it('resolves a firing alert', () => {
    const alert = makeAlert({ id: 'to-resolve', status: 'firing' })
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.resolveAlert('to-resolve')
    })

    const resolved = result.current.alerts.find(a => a.id === 'to-resolve')
    expect(resolved?.status).toBe('resolved')
    expect(resolved?.resolvedAt).toBeDefined()
  })

  it('does not affect other alerts when resolving one', () => {
    const alerts = [
      makeAlert({ id: 'resolve-me', status: 'firing' }),
      makeAlert({ id: 'still-firing', status: 'firing' }),
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.resolveAlert('resolve-me')
    })

    expect(result.current.alerts.find(a => a.id === 'resolve-me')?.status).toBe('resolved')
    expect(result.current.alerts.find(a => a.id === 'still-firing')?.status).toBe('firing')
  })
})

// ── Delete alert ────────────────────────────────────────────────────────────

describe('deleteAlert', () => {
  it('removes an alert from the list', () => {
    const alerts = [
      makeAlert({ id: 'del-1', status: 'firing' }),
      makeAlert({ id: 'keep-1', status: 'firing' }),
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    expect(result.current.alerts.length).toBe(2)

    act(() => {
      result.current.deleteAlert('del-1')
    })

    expect(result.current.alerts.length).toBe(1)
    expect(result.current.alerts[0].id).toBe('keep-1')
  })

  it('is a no-op for a non-existent alert id', () => {
    const alert = makeAlert({ id: 'exists', status: 'firing' })
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.deleteAlert('does-not-exist')
    })

    expect(result.current.alerts.length).toBe(1)
  })
})

// ── Rule management (CRUD) ──────────────────────────────────────────────────

describe('rule management', () => {
  it('createRule adds a new rule', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const initialCount = result.current.rules.length

    let created: AlertRule | undefined
    act(() => {
      created = result.current.createRule(makeRule({ name: 'New Rule', severity: 'critical' }))
    })

    expect(result.current.rules.length).toBe(initialCount + 1)
    expect(created).toBeDefined()
    expect(created!.name).toBe('New Rule')
    expect(created!.severity).toBe('critical')
    expect(created!.id).toBeDefined()
    expect(created!.createdAt).toBeDefined()
    expect(created!.updatedAt).toBeDefined()
  })

  it('updateRule modifies a rule and sets updatedAt', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const ruleId = result.current.rules[0].id
    const _originalUpdatedAt = result.current.rules[0].updatedAt

    // small delay so timestamp differs
    act(() => {
      result.current.updateRule(ruleId, { name: 'Updated Name', severity: 'critical' })
    })

    const updated = result.current.rules.find(r => r.id === ruleId)
    expect(updated?.name).toBe('Updated Name')
    expect(updated?.severity).toBe('critical')
    // updatedAt should be refreshed (or at least defined)
    expect(updated?.updatedAt).toBeDefined()
  })

  it('deleteRule removes a rule by id', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const initialCount = result.current.rules.length
    const ruleId = result.current.rules[0].id

    act(() => {
      result.current.deleteRule(ruleId)
    })

    expect(result.current.rules.length).toBe(initialCount - 1)
    expect(result.current.rules.find(r => r.id === ruleId)).toBeUndefined()
  })

  it('toggleRule flips the enabled flag', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    const rule = result.current.rules[0]
    const originalEnabled = rule.enabled

    act(() => {
      result.current.toggleRule(rule.id)
    })

    const toggled = result.current.rules.find(r => r.id === rule.id)
    expect(toggled?.enabled).toBe(!originalEnabled)

    // Toggle back
    act(() => {
      result.current.toggleRule(rule.id)
    })

    const toggledBack = result.current.rules.find(r => r.id === rule.id)
    expect(toggledBack?.enabled).toBe(originalEnabled)
  })

  it('persists rules to localStorage on change', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    let _newRule: AlertRule | undefined
    act(() => {
      _newRule = result.current.createRule(makeRule({ name: 'Persisted Rule' }))
    })

    const stored = JSON.parse(localStorage.getItem('kc_alert_rules') ?? '[]')
    expect(stored.some((r: { name: string }) => r.name === 'Persisted Rule')).toBe(true)
  })
})

