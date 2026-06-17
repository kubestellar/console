import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { alertsTestState, wrapper, makeAlert, makeRule, flushTimers, mockStartMission, mockUseDemoMode, mockSendNotificationWithDeepLink, type Alert, type AlertRule } from './AlertsContext.test-helpers'
import { useAlertsContext } from '../AlertsContext'

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
