import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { alertsTestState, wrapper, makeAlert, makeRule, flushTimers, mockStartMission, mockUseDemoMode, mockSendNotificationWithDeepLink, type Alert, type AlertRule } from './AlertsContext.test-helpers'
import { useAlertsContext } from '../AlertsContext'

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
