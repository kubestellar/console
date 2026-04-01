import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAlertRules, useSlackWebhooks, useAlerts, useSlackNotification } from '../useAlerts'

// Mock context — these hooks use useContext(AlertsContext)
vi.mock('../../contexts/AlertsContext', () => ({
  AlertsContext: { Provider: vi.fn(), Consumer: vi.fn() },
}))

describe('useAlertRules', () => {
  it('returns empty rules when outside AlertsContext', () => {
    const { result } = renderHook(() => useAlertRules())
    expect(result.current.rules).toEqual([])
  })

  it('createRule returns a default AlertRule when outside context', () => {
    const { result } = renderHook(() => useAlertRules())
    const rule = result.current.createRule({
      name: 'test',
      description: 'desc',
      enabled: true,
      condition: { type: 'custom' },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
    })
    expect(rule).toHaveProperty('id')
    expect(rule.name).toBe('')
  })

  it('updateRule is a no-op outside context', () => {
    const { result } = renderHook(() => useAlertRules())
    expect(() => result.current.updateRule('id', { name: 'new' })).not.toThrow()
  })

  it('deleteRule is a no-op outside context', () => {
    const { result } = renderHook(() => useAlertRules())
    expect(() => result.current.deleteRule('id')).not.toThrow()
  })

  it('toggleRule is a no-op outside context', () => {
    const { result } = renderHook(() => useAlertRules())
    expect(() => result.current.toggleRule('id')).not.toThrow()
  })
})

describe('useSlackWebhooks', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts with empty webhooks', () => {
    const { result } = renderHook(() => useSlackWebhooks())
    expect(result.current.webhooks).toEqual([])
  })

  it('addWebhook adds a webhook with generated id', () => {
    const { result } = renderHook(() => useSlackWebhooks())
    let webhook: ReturnType<typeof result.current.addWebhook>
    act(() => {
      webhook = result.current.addWebhook('Test', 'https://hooks.slack.com/test', '#general')
    })
    expect(result.current.webhooks).toHaveLength(1)
    expect(result.current.webhooks[0].name).toBe('Test')
    expect(result.current.webhooks[0].webhookUrl).toBe('https://hooks.slack.com/test')
    expect(result.current.webhooks[0].channel).toBe('#general')
    expect(result.current.webhooks[0].id).toContain('webhook_')
  })

  it('removeWebhook removes by id', () => {
    const { result } = renderHook(() => useSlackWebhooks())
    act(() => {
      result.current.addWebhook('A', 'https://a.com')
      result.current.addWebhook('B', 'https://b.com')
    })
    const idToRemove = result.current.webhooks[0].id
    act(() => { result.current.removeWebhook(idToRemove) })
    expect(result.current.webhooks).toHaveLength(1)
    expect(result.current.webhooks[0].name).toBe('B')
  })

  it('persists webhooks to localStorage', () => {
    const { result } = renderHook(() => useSlackWebhooks())
    act(() => { result.current.addWebhook('Test', 'https://test.com') })
    const stored = JSON.parse(localStorage.getItem('kc_slack_webhooks') || '[]')
    expect(stored).toHaveLength(1)
  })

  it('loads webhooks from localStorage', () => {
    localStorage.setItem('kc_slack_webhooks', JSON.stringify([
      { id: 'w1', name: 'Existing', webhookUrl: 'https://existing.com', createdAt: '2024-01-01' },
    ]))
    const { result } = renderHook(() => useSlackWebhooks())
    expect(result.current.webhooks).toHaveLength(1)
    expect(result.current.webhooks[0].name).toBe('Existing')
  })
})

describe('useAlerts', () => {
  it('returns default values when outside AlertsContext', () => {
    const { result } = renderHook(() => useAlerts())
    expect(result.current.alerts).toEqual([])
    expect(result.current.activeAlerts).toEqual([])
    expect(result.current.acknowledgedAlerts).toEqual([])
    expect(result.current.stats.total).toBe(0)
    expect(result.current.isLoadingData).toBe(false)
    expect(result.current.dataError).toBeNull()
  })

  it('acknowledgeAlert is a no-op outside context', () => {
    const { result } = renderHook(() => useAlerts())
    expect(() => result.current.acknowledgeAlert()).not.toThrow()
  })

  it('runAIDiagnosis returns null outside context', () => {
    const { result } = renderHook(() => useAlerts())
    expect(result.current.runAIDiagnosis('id')).toBeNull()
  })
})

describe('useSlackNotification', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('throws when webhook not found', async () => {
    const { result } = renderHook(() => useSlackNotification())
    const alert = {
      id: 'a1',
      ruleId: 'r1',
      ruleName: 'Test',
      severity: 'warning' as const,
      status: 'firing' as const,
      message: 'Test alert',
      firedAt: new Date().toISOString(),
    }
    await expect(result.current.sendNotification(alert, 'nonexistent')).rejects.toThrow('Webhook not found')
  })
})
