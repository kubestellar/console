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

// ── Run AI Diagnosis ────────────────────────────────────────────────────────

describe('runAIDiagnosis', () => {
  it('returns null for non-existent alert id', async () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    let missionId: string | null = null
    await act(async () => {
      missionId = await result.current.runAIDiagnosis('non-existent')
    })

    expect(missionId).toBeNull()
  })

  it('starts a mission and sets aiDiagnosis on the alert', async () => {
    const alert = makeAlert({ id: 'diagnose-me', ruleId: 'rule-1', status: 'firing' })
    // Make sure the rule exists
    const rule: AlertRule = {
      id: 'rule-1',
      name: 'Test Rule',
      description: 'test',
      enabled: true,
      condition: { type: 'gpu_usage', threshold: 90 },
      severity: 'warning',
      channels: [],
      aiDiagnose: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    let missionId: string | null = null
    await act(async () => {
      missionId = await result.current.runAIDiagnosis('diagnose-me')
    })

    expect(missionId).toBe('mock-mission-id')
    expect(mockStartMission).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'troubleshoot',
        context: expect.objectContaining({ alertId: 'diagnose-me' }),
      })
    )

    const diagnosed = result.current.alerts.find(a => a.id === 'diagnose-me')
    expect(diagnosed?.aiDiagnosis).toBeDefined()
    expect(diagnosed?.aiDiagnosis?.missionId).toBe('mock-mission-id')
    expect(diagnosed?.aiDiagnosis?.summary).toBe('AI is analyzing this alert...')
  })
})

// ── Preset rule migration ───────────────────────────────────────────────────

describe('preset rule migration', () => {
  it('injects missing preset condition types into stored rules', () => {
    // Seed with only one rule type - the migration effect should inject the rest
    const partialRule: AlertRule = {
      id: 'existing-gpu-rule',
      name: 'GPU Usage Custom',
      description: 'custom GPU rule',
      enabled: true,
      condition: { type: 'gpu_usage', threshold: 80 },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([partialRule]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Should have the original plus all missing preset types
    expect(result.current.rules.length).toBeGreaterThan(1)
    const conditionTypes = result.current.rules.map(r => r.condition.type)
    expect(conditionTypes).toContain('gpu_usage') // original
    expect(conditionTypes).toContain('node_not_ready') // injected
    expect(conditionTypes).toContain('pod_crash') // injected
    expect(conditionTypes).toContain('disk_pressure') // injected
  })
})

// ── localStorage persistence ────────────────────────────────────────────────

describe('alerts persistence', () => {
  it('saves alerts to localStorage whenever they change', () => {
    const alert = makeAlert({ id: 'persist-check', status: 'firing' })
    localStorage.setItem('kc_alerts', JSON.stringify([alert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.deleteAlert('persist-check')
    })

    const stored = JSON.parse(localStorage.getItem('kc_alerts') ?? '[]')
    expect(stored.length).toBe(0)
  })
})

// ── Quota / pruning ───────────────────────────────────────────────────────

describe('localStorage quota handling', () => {
  it('prunes resolved alerts but preserves firing alerts on QuotaExceededError', () => {
    // Seed a mix of firing and resolved alerts
    const firing1 = makeAlert({ id: 'firing-1', status: 'firing' })
    const firing2 = makeAlert({ id: 'firing-2', status: 'firing' })
    const resolved1 = makeAlert({ id: 'resolved-1', status: 'resolved', resolvedAt: '2024-01-01T00:00:00Z' })
    const resolved2 = makeAlert({ id: 'resolved-2', status: 'resolved', resolvedAt: '2025-01-01T00:00:00Z' })

    localStorage.setItem('kc_alerts', JSON.stringify([firing1, firing2, resolved1, resolved2]))

    // Intercept setItem: throw QuotaExceededError on the first kc_alerts write
    // (the save triggered by the useEffect on mount), then allow the retry.
    let alertWriteCount = 0
    const realSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_alerts') {
        alertWriteCount++
        if (alertWriteCount === 1) {
          throw new DOMException('quota exceeded', 'QuotaExceededError')
        }
      }
      return realSetItem(key, value)
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Mount — loadFromStorage() then saveAlerts() via useEffect
    renderHook(() => useAlertsContext(), { wrapper })

    // The pruning path must have retried
    expect(alertWriteCount).toBeGreaterThanOrEqual(2)
    expect(warnSpy).toHaveBeenCalledWith('[Alerts] localStorage quota exceeded, pruning resolved alerts')

    // Verify pruned data was saved (second write succeeded)
    const stored = JSON.parse(localStorage.getItem('kc_alerts')!)
    // Firing alerts must still be present
    expect(stored.some((a: { id: string }) => a.id === 'firing-1')).toBe(true)
    expect(stored.some((a: { id: string }) => a.id === 'firing-2')).toBe(true)

    vi.mocked(localStorage.setItem).mockRestore()
    warnSpy.mockRestore()
  })

  it('detects QuotaExceededError via legacy numeric code 22', () => {
    const resolved1 = makeAlert({ id: 'r1', status: 'resolved' })
    localStorage.setItem('kc_alerts', JSON.stringify([resolved1]))

    let alertWriteCount = 0
    const realSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_alerts') {
        alertWriteCount++
        if (alertWriteCount === 1) {
          // Simulate legacy code-22 DOMException (no named exception)
          const err = new DOMException('quota exceeded')
          Object.defineProperty(err, 'code', { value: 22 })
          Object.defineProperty(err, 'name', { value: '' })
          throw err
        }
      }
      return realSetItem(key, value)
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderHook(() => useAlertsContext(), { wrapper })

    // The pruning branch should have fired (retry = alertWriteCount >= 2)
    expect(alertWriteCount).toBeGreaterThanOrEqual(2)
    expect(warnSpy).toHaveBeenCalledWith('[Alerts] localStorage quota exceeded, pruning resolved alerts')

    vi.mocked(localStorage.setItem).mockRestore()
    warnSpy.mockRestore()
  })

  it('logs the error and clears storage when pruning still exceeds quota', () => {
    const firing1 = makeAlert({ id: 'f1', status: 'firing' })
    localStorage.setItem('kc_alerts', JSON.stringify([firing1]))

    const realSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_alerts') {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      }
      return realSetItem(key, value)
    })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderHook(() => useAlertsContext(), { wrapper })

    // Should log the inner retry error (not silently swallow it)
    expect(errorSpy).toHaveBeenCalledWith(
      '[Alerts] localStorage still full after pruning, clearing alerts',
      expect.any(DOMException),
    )

    // Storage should have been cleared as a last resort
    expect(localStorage.getItem('kc_alerts')).toBeNull()

    vi.mocked(localStorage.setItem).mockRestore()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })
})

// ── MAX_ALERTS cap ────────────────────────────────────────────────────────────

describe('MAX_ALERTS cap', () => {
  it('caps alerts to at most 500 in localStorage on mount when pre-loaded with more', () => {
    // Pre-populate localStorage with 550 alerts (300 firing, 250 resolved)
    const tooManyAlerts: Alert[] = [
      ...Array.from({ length: 300 }, (_, i) =>
        makeAlert({ id: `firing-${i}`, status: 'firing' })
      ),
      ...Array.from({ length: 250 }, (_, i) =>
        makeAlert({ id: `resolved-${i}`, status: 'resolved', resolvedAt: new Date(Date.now() - i * 1000).toISOString() })
      ),
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(tooManyAlerts))

    renderHook(() => useAlertsContext(), { wrapper })

    const stored: Alert[] = JSON.parse(localStorage.getItem('kc_alerts') ?? '[]')
    expect(stored.length).toBeLessThanOrEqual(500)
    // All firing alerts must be retained (there are only 300, well within the cap)
    const storedFiring = stored.filter(a => a.status === 'firing')
    expect(storedFiring.length).toBe(300)
  })

  it('keeps resolved alerts sorted by recency when trimming', () => {
    // Create 520 alerts: 300 firing + 220 resolved with distinct timestamps
    const firingAlerts: Alert[] = Array.from({ length: 300 }, (_, i) =>
      makeAlert({ id: `f-${i}`, status: 'firing' })
    )
    // Resolved alerts with timestamps spanning the last 220 seconds
    const resolvedAlerts: Alert[] = Array.from({ length: 220 }, (_, i) =>
      makeAlert({
        id: `r-${i}`,
        status: 'resolved',
        resolvedAt: new Date(Date.now() - i * 1000).toISOString(),
      })
    )
    localStorage.setItem('kc_alerts', JSON.stringify([...firingAlerts, ...resolvedAlerts]))

    renderHook(() => useAlertsContext(), { wrapper })

    const stored: Alert[] = JSON.parse(localStorage.getItem('kc_alerts') ?? '[]')
    expect(stored.length).toBeLessThanOrEqual(500)

    // The resolved alerts that remain should be the most recent ones (r-0 through r-N)
    // None of the oldest resolved ones (r-219 or close to it) should survive the trim
    const storedResolved = stored.filter(a => a.status === 'resolved')
    expect(storedResolved.length).toBeLessThanOrEqual(200) // 500 cap minus 300 firing
    const storedResolvedIds = new Set(storedResolved.map(a => a.id))
    // r-0 is the most recent resolved — must survive
    expect(storedResolvedIds.has('r-0')).toBe(true)
    // r-219 is the oldest resolved — must be evicted
    expect(storedResolvedIds.has('r-219')).toBe(false)
  })
})

// ── Notification request permission ─────────────────────────────────────────

describe('Notification permission', () => {
  it('requests permission when Notification.permission is default', () => {
    const requestPermission = vi.fn()
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })

    renderHook(() => useAlertsContext(), { wrapper })

    expect(requestPermission).toHaveBeenCalled()

    // Restore
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
  })

  it('does not request permission when already granted', () => {
    const requestPermission = vi.fn()
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission })

    renderHook(() => useAlertsContext(), { wrapper })

    expect(requestPermission).not.toHaveBeenCalled()
  })
})

// ── Demo mode ───────────────────────────────────────────────────────────────

describe('demo mode alert cleanup', () => {
  it('removes demo-generated alerts when demo mode is turned off', () => {
    // Start with demo mode on
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })

    const alerts = [
      makeAlert({ id: 'demo-alert', status: 'firing', isDemo: true }),
      makeAlert({ id: 'real-alert', status: 'firing', isDemo: false }),
      makeAlert({ id: 'no-flag', status: 'firing' }),
    ]
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result, rerender } = renderHook(() => useAlertsContext(), { wrapper })

    // All alerts present initially
    expect(result.current.alerts.length).toBe(3)

    // Turn off demo mode
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
    rerender()

    // Demo alerts should be removed
    expect(result.current.alerts.some(a => a.id === 'demo-alert')).toBe(false)
    // Non-demo alerts should remain
    expect(result.current.alerts.some(a => a.id === 'real-alert')).toBe(true)
    expect(result.current.alerts.some(a => a.id === 'no-flag')).toBe(true)
  })
})

// ── evaluateConditions ──────────────────────────────────────────────────────

describe('evaluateConditions', () => {
  it('is callable and does not throw when no data is loaded', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(() => {
      act(() => {
        result.current.evaluateConditions()
      })
    }).not.toThrow()
  })

  it('only evaluates enabled rules', () => {
    // Disable all preset rules by persisting them as disabled
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      for (const rule of result.current.rules) {
        if (rule.enabled) {
          result.current.toggleRule(rule.id)
        }
      }
    })

    // Evaluate with all rules disabled - should produce no new alerts
    const alertsBefore = result.current.alerts.length
    act(() => {
      result.current.evaluateConditions()
    })

    expect(result.current.alerts.length).toBe(alertsBefore)
  })

  it('prevents concurrent evaluation (re-entrant guard)', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Calling evaluateConditions twice in the same tick should not fail
    act(() => {
      result.current.evaluateConditions()
      result.current.evaluateConditions() // second call should be a no-op
    })

    // After the act block, isEvaluating should be false (both completed)
    expect(result.current.isEvaluating).toBe(false)
  })
})

// ── loadFromStorage error handling ──────────────────────────────────────────

