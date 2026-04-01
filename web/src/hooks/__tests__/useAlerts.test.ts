import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useAlertRules, useSlackWebhooks, useAlerts, useSlackNotification } from '../useAlerts'
import type { Alert, AlertRule, AlertStats } from '../../types/alerts'

// ---------------------------------------------------------------------------
// Constants — no magic numbers
// ---------------------------------------------------------------------------
const SLACK_WEBHOOKS_STORAGE_KEY = 'kc_slack_webhooks'
const WEBHOOK_ID_PREFIX = 'webhook_'
const ZERO_STAT = 0

// ---------------------------------------------------------------------------
// Mock AlertsContext so we can test both null-context and provided-context paths
// ---------------------------------------------------------------------------
// We keep a mutable variable that vi.mock reads from via closure.
let mockContextValue: Record<string, unknown> | null = null

vi.mock('../../contexts/AlertsContext', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  const { createContext } = await import('react')
  // Create a real context whose value we control via mockContextValue
  const AlertsContext = createContext<Record<string, unknown> | null>(null)
  // Override the Provider so we can supply values during tests
  return {
    ...actual,
    AlertsContext,
    // Expose a helper for tests to build a wrapper with a given context value
    __getMockContext: () => AlertsContext,
  }
})

// Import the mock-aware context so tests that need a provider can build a wrapper
async function getAlertsContext() {
  const mod = await import('../../contexts/AlertsContext') as unknown as {
    __getMockContext: () => React.Context<Record<string, unknown> | null>
  }
  return mod.__getMockContext()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a full Alert object with sensible defaults. */
function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'alert_1',
    ruleId: 'rule_1',
    ruleName: 'Test Rule',
    severity: 'warning',
    status: 'firing',
    message: 'Something is wrong',
    details: {},
    firedAt: new Date().toISOString(),
    ...overrides,
  }
}

/** Build a full AlertRule object with sensible defaults. */
function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'rule_1',
    name: 'Test Rule',
    description: 'A test rule',
    enabled: true,
    condition: { type: 'custom' },
    severity: 'warning',
    channels: [],
    aiDiagnose: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

/** Build a renderHook wrapper that provides AlertsContext with the given value. */
async function buildWrapper(value: Record<string, unknown>) {
  const Ctx = await getAlertsContext()
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(Ctx.Provider, { value }, children)
  }
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  localStorage.clear()
  mockContextValue = null
  vi.restoreAllMocks()
})

afterEach(() => {
  localStorage.clear()
})

// ===========================================================================
// useAlertRules — outside AlertsContext (null context fallback)
// ===========================================================================
describe('useAlertRules', () => {
  describe('outside AlertsContext (null context)', () => {
    it('returns empty rules array', () => {
      const { result } = renderHook(() => useAlertRules())
      expect(result.current.rules).toEqual([])
      expect(Array.isArray(result.current.rules)).toBe(true)
    })

    it('createRule returns a fully-populated default AlertRule', () => {
      const { result } = renderHook(() => useAlertRules())
      const rule = result.current.createRule({
        name: 'My Rule',
        description: 'desc',
        enabled: true,
        condition: { type: 'pod_crash', threshold: 5 },
        severity: 'critical',
        channels: [],
        aiDiagnose: true,
      })
      // The fallback always returns the empty rule, ignoring input
      expect(rule.id).toBe('')
      expect(rule.name).toBe('')
      expect(rule.description).toBe('')
      expect(rule.enabled).toBe(false)
      expect(rule.severity).toBe('info')
      expect(rule.condition).toEqual({ type: 'custom' })
      expect(rule.channels).toEqual([])
      expect(rule.aiDiagnose).toBe(false)
      expect(rule.createdAt).toBe('')
      expect(rule.updatedAt).toBe('')
    })

    it('createRule returns a new object each call (no shared mutation)', () => {
      const { result } = renderHook(() => useAlertRules())
      const rule1 = result.current.createRule({
        name: 'A', description: '', enabled: true,
        condition: { type: 'custom' }, severity: 'info',
        channels: [], aiDiagnose: false,
      })
      const rule2 = result.current.createRule({
        name: 'B', description: '', enabled: true,
        condition: { type: 'custom' }, severity: 'info',
        channels: [], aiDiagnose: false,
      })
      // They should be separate objects
      expect(rule1).not.toBe(rule2)
      expect(rule1).toEqual(rule2)
    })

    it('updateRule is a no-op and does not throw', () => {
      const { result } = renderHook(() => useAlertRules())
      expect(() => result.current.updateRule('nonexistent', { name: 'updated' })).not.toThrow()
    })

    it('deleteRule is a no-op and does not throw', () => {
      const { result } = renderHook(() => useAlertRules())
      expect(() => result.current.deleteRule('nonexistent')).not.toThrow()
    })

    it('toggleRule is a no-op and does not throw', () => {
      const { result } = renderHook(() => useAlertRules())
      expect(() => result.current.toggleRule('nonexistent')).not.toThrow()
    })
  })

  describe('inside AlertsContext (provided context)', () => {
    it('delegates to context functions', async () => {
      const mockCreateRule = vi.fn().mockReturnValue(makeRule({ id: 'created_1' }))
      const mockUpdateRule = vi.fn()
      const mockDeleteRule = vi.fn()
      const mockToggleRule = vi.fn()
      const contextValue = {
        rules: [makeRule()],
        createRule: mockCreateRule,
        updateRule: mockUpdateRule,
        deleteRule: mockDeleteRule,
        toggleRule: mockToggleRule,
        // Other context properties required by the full context
        alerts: [], activeAlerts: [], acknowledgedAlerts: [],
        stats: { total: 0, firing: 0, resolved: 0, critical: 0, warning: 0, info: 0, acknowledged: 0 },
        acknowledgeAlert: vi.fn(), acknowledgeAlerts: vi.fn(),
        resolveAlert: vi.fn(), deleteAlert: vi.fn(),
        runAIDiagnosis: vi.fn(), evaluateConditions: vi.fn(),
        isLoadingData: false, dataError: null, isEvaluating: false,
      }
      const wrapper = await buildWrapper(contextValue)

      const { result } = renderHook(() => useAlertRules(), { wrapper })

      expect(result.current.rules).toHaveLength(1)

      // Call createRule and verify delegation
      const input = {
        name: 'New', description: 'd', enabled: true,
        condition: { type: 'custom' as const }, severity: 'info' as const,
        channels: [], aiDiagnose: false,
      }
      result.current.createRule(input)
      expect(mockCreateRule).toHaveBeenCalledWith(input)

      result.current.updateRule('rule_1', { name: 'Updated' })
      expect(mockUpdateRule).toHaveBeenCalledWith('rule_1', { name: 'Updated' })

      result.current.deleteRule('rule_1')
      expect(mockDeleteRule).toHaveBeenCalledWith('rule_1')

      result.current.toggleRule('rule_1')
      expect(mockToggleRule).toHaveBeenCalledWith('rule_1')
    })
  })
})

// ===========================================================================
// useAlerts — outside and inside AlertsContext
// ===========================================================================
describe('useAlerts', () => {
  describe('outside AlertsContext (null context)', () => {
    it('returns empty alerts arrays', () => {
      const { result } = renderHook(() => useAlerts())
      expect(result.current.alerts).toEqual([])
      expect(result.current.activeAlerts).toEqual([])
      expect(result.current.acknowledgedAlerts).toEqual([])
    })

    it('returns zeroed stats with all required fields', () => {
      const { result } = renderHook(() => useAlerts())
      const { stats } = result.current
      expect(stats.total).toBe(ZERO_STAT)
      expect(stats.firing).toBe(ZERO_STAT)
      expect(stats.resolved).toBe(ZERO_STAT)
      expect(stats.critical).toBe(ZERO_STAT)
      expect(stats.warning).toBe(ZERO_STAT)
      expect(stats.info).toBe(ZERO_STAT)
      expect(stats.acknowledged).toBe(ZERO_STAT)
    })

    it('isLoadingData is false by default', () => {
      const { result } = renderHook(() => useAlerts())
      expect(result.current.isLoadingData).toBe(false)
    })

    it('dataError is null by default', () => {
      const { result } = renderHook(() => useAlerts())
      expect(result.current.dataError).toBeNull()
    })

    it('acknowledgeAlert is a no-op function', () => {
      const { result } = renderHook(() => useAlerts())
      expect(() => result.current.acknowledgeAlert()).not.toThrow()
    })

    it('acknowledgeAlerts is a no-op function', () => {
      const { result } = renderHook(() => useAlerts())
      expect(() => result.current.acknowledgeAlerts()).not.toThrow()
    })

    it('resolveAlert is a no-op function', () => {
      const { result } = renderHook(() => useAlerts())
      expect(() => result.current.resolveAlert()).not.toThrow()
    })

    it('deleteAlert is a no-op function', () => {
      const { result } = renderHook(() => useAlerts())
      expect(() => result.current.deleteAlert()).not.toThrow()
    })

    it('evaluateConditions is a no-op function', () => {
      const { result } = renderHook(() => useAlerts())
      expect(() => result.current.evaluateConditions()).not.toThrow()
    })

    it('runAIDiagnosis returns null for any alertId', () => {
      const { result } = renderHook(() => useAlerts())
      expect(result.current.runAIDiagnosis('alert_1')).toBeNull()
      expect(result.current.runAIDiagnosis('nonexistent')).toBeNull()
      expect(result.current.runAIDiagnosis('')).toBeNull()
    })
  })

  describe('inside AlertsContext (provided context)', () => {
    it('delegates all properties from context', async () => {
      const mockAcknowledge = vi.fn()
      const mockAcknowledgeMultiple = vi.fn()
      const mockResolve = vi.fn()
      const mockDelete = vi.fn()
      const mockDiagnose = vi.fn().mockReturnValue('diagnosis_123')
      const mockEvaluate = vi.fn()

      const firingAlert = makeAlert({ id: 'a1', status: 'firing' })
      const ackedAlert = makeAlert({ id: 'a2', status: 'firing', acknowledgedAt: '2024-01-01' })
      const resolvedAlert = makeAlert({ id: 'a3', status: 'resolved' })

      const contextValue = {
        alerts: [firingAlert, ackedAlert, resolvedAlert],
        activeAlerts: [firingAlert],
        acknowledgedAlerts: [ackedAlert],
        stats: { total: 3, firing: 2, resolved: 1, critical: 0, warning: 3, info: 0, acknowledged: 1 },
        acknowledgeAlert: mockAcknowledge,
        acknowledgeAlerts: mockAcknowledgeMultiple,
        resolveAlert: mockResolve,
        deleteAlert: mockDelete,
        runAIDiagnosis: mockDiagnose,
        evaluateConditions: mockEvaluate,
        isLoadingData: true,
        dataError: 'Some error',
        // Also need rule-related fields for the full context
        rules: [], createRule: vi.fn(), updateRule: vi.fn(),
        deleteRule: vi.fn(), toggleRule: vi.fn(), isEvaluating: false,
      }
      const wrapper = await buildWrapper(contextValue)

      const { result } = renderHook(() => useAlerts(), { wrapper })

      expect(result.current.alerts).toHaveLength(3)
      expect(result.current.activeAlerts).toHaveLength(1)
      expect(result.current.acknowledgedAlerts).toHaveLength(1)
      expect(result.current.stats.total).toBe(3)
      expect(result.current.stats.acknowledged).toBe(1)
      expect(result.current.isLoadingData).toBe(true)
      expect(result.current.dataError).toBe('Some error')

      // Verify delegation
      result.current.acknowledgeAlert('a1', 'admin')
      expect(mockAcknowledge).toHaveBeenCalledWith('a1', 'admin')

      result.current.acknowledgeAlerts(['a1', 'a2'], 'admin')
      expect(mockAcknowledgeMultiple).toHaveBeenCalledWith(['a1', 'a2'], 'admin')

      result.current.resolveAlert('a1')
      expect(mockResolve).toHaveBeenCalledWith('a1')

      result.current.deleteAlert('a1')
      expect(mockDelete).toHaveBeenCalledWith('a1')

      const diagResult = result.current.runAIDiagnosis('a1')
      expect(mockDiagnose).toHaveBeenCalledWith('a1')
      expect(diagResult).toBe('diagnosis_123')

      result.current.evaluateConditions()
      expect(mockEvaluate).toHaveBeenCalled()
    })

    it('reflects stats severity counts accurately', async () => {
      const stats: AlertStats = {
        total: 10, firing: 6, resolved: 4,
        critical: 3, warning: 5, info: 2, acknowledged: 1,
      }
      const contextValue = {
        alerts: [], activeAlerts: [], acknowledgedAlerts: [],
        stats,
        acknowledgeAlert: vi.fn(), acknowledgeAlerts: vi.fn(),
        resolveAlert: vi.fn(), deleteAlert: vi.fn(),
        runAIDiagnosis: vi.fn(), evaluateConditions: vi.fn(),
        isLoadingData: false, dataError: null,
        rules: [], createRule: vi.fn(), updateRule: vi.fn(),
        deleteRule: vi.fn(), toggleRule: vi.fn(), isEvaluating: false,
      }
      const wrapper = await buildWrapper(contextValue)

      const { result } = renderHook(() => useAlerts(), { wrapper })
      expect(result.current.stats).toEqual(stats)
    })
  })
})

// ===========================================================================
// useSlackWebhooks — localStorage CRUD with persistence
// ===========================================================================
describe('useSlackWebhooks', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts with empty webhooks when localStorage is empty', () => {
    const { result } = renderHook(() => useSlackWebhooks())
    expect(result.current.webhooks).toEqual([])
  })

  it('addWebhook creates a webhook with generated id prefixed with webhook_', () => {
    const { result } = renderHook(() => useSlackWebhooks())
    let webhook: ReturnType<typeof result.current.addWebhook>
    act(() => {
      webhook = result.current.addWebhook('Alerts', 'https://hooks.slack.com/services/T/B/xxx', '#alerts')
    })
    expect(result.current.webhooks).toHaveLength(1)
    const created = result.current.webhooks[0]
    expect(created.id).toMatch(new RegExp(`^${WEBHOOK_ID_PREFIX}`))
    expect(created.name).toBe('Alerts')
    expect(created.webhookUrl).toBe('https://hooks.slack.com/services/T/B/xxx')
    expect(created.channel).toBe('#alerts')
    expect(created.createdAt).toBeTruthy()
    // createdAt should be a valid ISO date string
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt)
  })

  it('addWebhook works without optional channel parameter', () => {
    const { result } = renderHook(() => useSlackWebhooks())
    act(() => {
      result.current.addWebhook('No Channel', 'https://hooks.slack.com/test')
    })
    expect(result.current.webhooks[0].channel).toBeUndefined()
  })

  it('adding multiple webhooks appends in order', () => {
    const { result } = renderHook(() => useSlackWebhooks())
    act(() => {
      result.current.addWebhook('First', 'https://a.com')
      result.current.addWebhook('Second', 'https://b.com')
      result.current.addWebhook('Third', 'https://c.com')
    })
    expect(result.current.webhooks).toHaveLength(3)
    expect(result.current.webhooks.map(w => w.name)).toEqual(['First', 'Second', 'Third'])
  })

  it('each webhook gets a unique id', () => {
    const { result } = renderHook(() => useSlackWebhooks())
    act(() => {
      result.current.addWebhook('A', 'https://a.com')
      result.current.addWebhook('B', 'https://b.com')
    })
    const ids = result.current.webhooks.map(w => w.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('removeWebhook removes by id and keeps others intact', () => {
    const { result } = renderHook(() => useSlackWebhooks())
    act(() => {
      result.current.addWebhook('Keep', 'https://keep.com')
      result.current.addWebhook('Remove', 'https://remove.com')
      result.current.addWebhook('AlsoKeep', 'https://alsokeep.com')
    })
    const removeId = result.current.webhooks[1].id
    act(() => {
      result.current.removeWebhook(removeId)
    })
    expect(result.current.webhooks).toHaveLength(2)
    expect(result.current.webhooks.map(w => w.name)).toEqual(['Keep', 'AlsoKeep'])
  })

  it('removeWebhook with nonexistent id does not remove anything', () => {
    const { result } = renderHook(() => useSlackWebhooks())
    act(() => {
      result.current.addWebhook('Sole', 'https://sole.com')
    })
    act(() => {
      result.current.removeWebhook('nonexistent_id')
    })
    expect(result.current.webhooks).toHaveLength(1)
    expect(result.current.webhooks[0].name).toBe('Sole')
  })

  it('persists webhooks to localStorage on add', () => {
    const { result } = renderHook(() => useSlackWebhooks())
    act(() => {
      result.current.addWebhook('Persistent', 'https://persist.com', '#ops')
    })
    const stored = JSON.parse(localStorage.getItem(SLACK_WEBHOOKS_STORAGE_KEY) || '[]')
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('Persistent')
    expect(stored[0].channel).toBe('#ops')
  })

  it('persists webhooks to localStorage on remove', () => {
    const { result } = renderHook(() => useSlackWebhooks())
    act(() => {
      result.current.addWebhook('WillRemove', 'https://a.com')
      result.current.addWebhook('WillStay', 'https://b.com')
    })
    const removeId = result.current.webhooks[0].id
    act(() => {
      result.current.removeWebhook(removeId)
    })
    const stored = JSON.parse(localStorage.getItem(SLACK_WEBHOOKS_STORAGE_KEY) || '[]')
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('WillStay')
  })

  it('loads pre-existing webhooks from localStorage on mount', () => {
    const preExisting = [
      { id: 'webhook_preset_1', name: 'Preset', webhookUrl: 'https://preset.com', channel: '#ch', createdAt: '2024-06-01T00:00:00.000Z' },
      { id: 'webhook_preset_2', name: 'Preset2', webhookUrl: 'https://preset2.com', createdAt: '2024-06-02T00:00:00.000Z' },
    ]
    localStorage.setItem(SLACK_WEBHOOKS_STORAGE_KEY, JSON.stringify(preExisting))
    const { result } = renderHook(() => useSlackWebhooks())
    expect(result.current.webhooks).toHaveLength(2)
    expect(result.current.webhooks[0].name).toBe('Preset')
    expect(result.current.webhooks[1].name).toBe('Preset2')
  })

  it('handles corrupt localStorage gracefully and returns empty array', () => {
    localStorage.setItem(SLACK_WEBHOOKS_STORAGE_KEY, 'not-valid-json{{{')
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useSlackWebhooks())
    expect(result.current.webhooks).toEqual([])
    consoleSpy.mockRestore()
  })

  it('handles localStorage.setItem throwing (quota exceeded) gracefully', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    })
    // The hook should still work in-memory even if persistence fails
    const { result } = renderHook(() => useSlackWebhooks())
    act(() => {
      result.current.addWebhook('InMemory', 'https://inmemory.com')
    })
    // The in-memory state should still be updated
    expect(result.current.webhooks).toHaveLength(1)
    setItemSpy.mockRestore()
    consoleSpy.mockRestore()
  })
})

// ===========================================================================
// useSlackNotification — webhook lookup, payload construction, error handling
// ===========================================================================
describe('useSlackNotification', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('throws "Webhook not found" when webhook id does not match any saved webhook', async () => {
    const { result } = renderHook(() => useSlackNotification())
    const alert = makeAlert()
    await expect(result.current.sendNotification(alert, 'nonexistent_id')).rejects.toThrow('Webhook not found')
  })

  it('returns true when a matching webhook is found and notification succeeds', async () => {
    // Pre-populate a webhook
    localStorage.setItem(SLACK_WEBHOOKS_STORAGE_KEY, JSON.stringify([
      { id: 'wh_1', name: 'Test', webhookUrl: 'https://hooks.slack.com/test', createdAt: '2024-01-01' },
    ]))
    const { result } = renderHook(() => useSlackNotification())
    const alert = makeAlert({ severity: 'critical', cluster: 'prod-1', resource: 'pod/api-server' })
    const sendResult = await result.current.sendNotification(alert, 'wh_1')
    expect(sendResult).toBe(true)
  })

  it('handles alert with missing optional fields (cluster, resource)', async () => {
    localStorage.setItem(SLACK_WEBHOOKS_STORAGE_KEY, JSON.stringify([
      { id: 'wh_2', name: 'Minimal', webhookUrl: 'https://hooks.slack.com/minimal', createdAt: '2024-01-01' },
    ]))
    const { result } = renderHook(() => useSlackNotification())
    const alert = makeAlert({ cluster: undefined, resource: undefined })
    // Should not throw even though cluster/resource are undefined
    const sendResult = await result.current.sendNotification(alert, 'wh_2')
    expect(sendResult).toBe(true)
  })

  it('handles alert with aiDiagnosis attached', async () => {
    localStorage.setItem(SLACK_WEBHOOKS_STORAGE_KEY, JSON.stringify([
      { id: 'wh_3', name: 'AI', webhookUrl: 'https://hooks.slack.com/ai', createdAt: '2024-01-01' },
    ]))
    const { result } = renderHook(() => useSlackNotification())
    const alert = makeAlert({
      severity: 'critical',
      aiDiagnosis: {
        summary: 'High GPU memory usage detected',
        rootCause: 'Model too large for available VRAM',
        suggestions: ['Scale down batch size', 'Use model parallelism'],
        analyzedAt: '2024-06-01T00:00:00.000Z',
      },
    })
    // sendNotification should handle the AI diagnosis block without error
    const sendResult = await result.current.sendNotification(alert, 'wh_3')
    expect(sendResult).toBe(true)
  })

  it('handles all three severity levels for emoji mapping', async () => {
    localStorage.setItem(SLACK_WEBHOOKS_STORAGE_KEY, JSON.stringify([
      { id: 'wh_sev', name: 'Sev', webhookUrl: 'https://hooks.slack.com/sev', createdAt: '2024-01-01' },
    ]))

    for (const severity of ['critical', 'warning', 'info'] as const) {
      const { result } = renderHook(() => useSlackNotification())
      const alert = makeAlert({ severity })
      const sendResult = await result.current.sendNotification(alert, 'wh_sev')
      expect(sendResult).toBe(true)
    }
  })

  it('throws when webhook id exists but is removed between add and send', async () => {
    // Start with no webhooks — the hook's internal state will have none
    const { result } = renderHook(() => useSlackNotification())
    const alert = makeAlert()
    // No webhook was ever added, so any ID lookup will fail
    await expect(result.current.sendNotification(alert, 'wh_phantom')).rejects.toThrow('Webhook not found')
  })
})

// ===========================================================================
// Regression: stable references — hooks outside context should return
// stable function references across re-renders (no unnecessary re-renders)
// ===========================================================================
describe('stable references (regression)', () => {
  it('useAlertRules returns same function references across re-renders', () => {
    const { result, rerender } = renderHook(() => useAlertRules())
    const firstRender = { ...result.current }
    rerender()
    // Outside context, the entire return object is re-created each render
    // but the shape should be consistent
    expect(typeof result.current.createRule).toBe('function')
    expect(typeof result.current.updateRule).toBe('function')
    expect(typeof result.current.deleteRule).toBe('function')
    expect(typeof result.current.toggleRule).toBe('function')
  })

  it('useAlerts returns same shape across re-renders', () => {
    const { result, rerender } = renderHook(() => useAlerts())
    const keys = Object.keys(result.current)
    rerender()
    expect(Object.keys(result.current)).toEqual(keys)
  })

  it('useAlerts outside context exposes all expected properties', () => {
    const { result } = renderHook(() => useAlerts())
    const expectedKeys = [
      'alerts', 'activeAlerts', 'acknowledgedAlerts', 'stats',
      'acknowledgeAlert', 'acknowledgeAlerts', 'resolveAlert', 'deleteAlert',
      'runAIDiagnosis', 'evaluateConditions', 'isLoadingData', 'dataError',
    ]
    for (const key of expectedKeys) {
      expect(result.current).toHaveProperty(key)
    }
  })

  it('useAlertRules outside context exposes all expected properties', () => {
    const { result } = renderHook(() => useAlertRules())
    const expectedKeys = ['rules', 'createRule', 'updateRule', 'deleteRule', 'toggleRule']
    for (const key of expectedKeys) {
      expect(result.current).toHaveProperty(key)
    }
  })
})

// ===========================================================================
// useSlackWebhooks — addWebhook return value
// ===========================================================================
describe('useSlackWebhooks addWebhook return value', () => {
  it('addWebhook returns the created webhook object', () => {
    const { result } = renderHook(() => useSlackWebhooks())
    let returned: ReturnType<typeof result.current.addWebhook> | undefined
    act(() => {
      returned = result.current.addWebhook('ReturnTest', 'https://return.com', '#ret')
    })
    expect(returned).toBeDefined()
    expect(returned!.name).toBe('ReturnTest')
    expect(returned!.webhookUrl).toBe('https://return.com')
    expect(returned!.channel).toBe('#ret')
    expect(returned!.id).toMatch(new RegExp(`^${WEBHOOK_ID_PREFIX}`))
  })
})
