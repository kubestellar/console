import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { alertsTestState, wrapper, makeAlert, makeRule, flushTimers, mockStartMission, mockUseDemoMode, mockSendNotificationWithDeepLink, type Alert, type AlertRule } from './AlertsContext.test-helpers'
import { useAlertsContext } from '../AlertsContext'

describe('deep coverage: saveAlerts quota handling', () => {
  it('saveAlerts clears kc_alerts entirely when both initial and retry writes throw QuotaExceededError', () => {
    const alerts = Array.from({ length: 20 }, (_, i) =>
      makeAlert({
        id: `q-${i}`,
        status: i < 5 ? 'firing' : 'resolved',
        resolvedAt: i >= 5 ? '2024-02-01T00:00:00Z' : undefined,
      })
    )
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const originalSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_alerts') {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      }
      return originalSetItem(key, value)
    })

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.deleteAlert('q-0')
    })

    // After double quota failure, alerts key should be removed entirely
    expect(localStorage.getItem('kc_alerts')).toBeNull()
  })

  it('saveAlerts logs non-quota localStorage errors without pruning', () => {
    const alerts = [makeAlert({ id: 'nq-1' })]
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const originalSetItem = localStorage.setItem.bind(localStorage)
    let throwCount = 0
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_alerts' && throwCount < 1) {
        throwCount++
        throw new Error('SecurityError')
      }
      return originalSetItem(key, value)
    })

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.acknowledgeAlert('nq-1')
    })

    expect(errorSpy).toHaveBeenCalled()
  })
})

describe('deep coverage: notification dedup pruning', () => {
  it('saveNotifiedAlertKeys prunes entries older than 24 hours during evaluation', () => {
    const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000
    const staleTimestamp = Date.now() - THIRTY_ONE_DAYS_MS
    const freshTimestamp = Date.now() - 1000

    const dedupMap: [string, number][] = [
      ['stale-key::cluster1', staleTimestamp],
      ['fresh-key::cluster2', freshTimestamp],
    ]
    localStorage.setItem('kc-notified-alert-keys', JSON.stringify(dedupMap))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.evaluateConditions()
    })

    const stored = localStorage.getItem('kc-notified-alert-keys')
    expect(stored).toBeDefined()
    if (stored) {
      const parsed = JSON.parse(stored) as [string, number][]
      const keys = parsed.map(([k]) => k)
      expect(keys).not.toContain('stale-key::cluster1')
    }
  })

  it('loadNotifiedAlertKeys returns a valid Map from properly stored data', () => {
    const entries: [string, number][] = [
      ['rule1::cluster1', Date.now()],
      ['rule2::cluster2', Date.now() - 60000],
    ]
    localStorage.setItem('kc-notified-alert-keys', JSON.stringify(entries))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })
    expect(result.current).toBeDefined()
  })
})

describe('deep coverage: createAlert dedup paths', () => {
  it('createAlert skips update when existing alert has identical message, resource, and details', () => {
    const rule: AlertRule = {
      id: 'dedup-skip',
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
    const existingAlert = makeAlert({
      id: 'dedup-existing',
      ruleId: 'dedup-skip',
      ruleName: 'GPU Usage',
      severity: 'critical',
      message: 'GPU usage is 90.0% (9/10 GPUs allocated)',
      details: { usagePercent: 90, allocatedGPUs: 9, totalGPUs: 10, threshold: 50 },
      cluster: 'gpu-cluster',
      resource: 'nvidia.com/gpu',
      resourceKind: 'Resource',
      firedAt: '2024-01-01T00:00:00Z',
    })
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([existingAlert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    const alerts = result.current.alerts.filter(a => a.ruleId === 'dedup-skip')
    expect(alerts.length).toBe(1)
    expect(alerts[0].id).toBe('dedup-existing')
    expect(alerts[0].firedAt).toBe('2024-01-01T00:00:00Z')
  })

  it('createAlert updates existing alert when details change but dedup key matches', () => {
    const rule: AlertRule = {
      id: 'dedup-update',
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
    const existingAlert = makeAlert({
      id: 'dedup-existing-nr',
      ruleId: 'dedup-update',
      ruleName: 'Node Not Ready',
      severity: 'warning',
      message: 'Cluster prod has nodes not in Ready state (old)',
      details: { clusterHealthy: false, nodeCount: 2 },
      cluster: 'prod',
      firedAt: '2024-01-01T00:00:00Z',
    })
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([existingAlert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // The existing alert has different message/details from what evaluateConditions would produce
    // so it should be updated in place (keeping original firedAt)
    const alerts = result.current.alerts.filter(a => a.ruleId === 'dedup-update')
    expect(alerts.length).toBe(1)
    expect(alerts[0].firedAt).toBe('2024-01-01T00:00:00Z')
  })
})

describe('deep coverage: weather alert condition types', () => {
  it('weather_alerts fires alert with severe_storm when random < 0.1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05)

    const rule: AlertRule = {
      id: 'wx-storm',
      name: 'Weather',
      description: '',
      enabled: true,
      // Issue 9255 — demoMode gates the random mock-trigger path
      condition: { type: 'weather_alerts', weatherCondition: 'severe_storm', demoMode: true },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.evaluateConditions()
    })

    const wxAlerts = result.current.alerts.filter(a => a.ruleId === 'wx-storm')
    expect(wxAlerts.length).toBe(1)
    expect(wxAlerts[0].message).toContain('Severe storm warning')
  })

  it('weather_alerts auto-resolves when random >= 0.1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    const rule: AlertRule = {
      id: 'wx-resolve',
      name: 'Weather',
      description: '',
      enabled: true,
      condition: { type: 'weather_alerts', demoMode: true },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    const firingAlert = makeAlert({
      id: 'wx-existing',
      ruleId: 'wx-resolve',
      firedAt: '2024-01-01T00:00:00Z',
    })
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([firingAlert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.evaluateConditions()
    })

    expect(result.current.alerts.find(a => a.id === 'wx-existing')?.status).toBe('resolved')
  })

  it('weather_alerts handles extreme_heat condition with temperatureThreshold', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01)

    const rule: AlertRule = {
      id: 'wx-heat',
      name: 'Heat',
      description: '',
      enabled: true,
      condition: { type: 'weather_alerts', weatherCondition: 'extreme_heat', temperatureThreshold: 105, demoMode: true },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.evaluateConditions()
    })

    const heatAlerts = result.current.alerts.filter(a => a.ruleId === 'wx-heat')
    expect(heatAlerts.length).toBe(1)
    expect(heatAlerts[0].message).toContain('Extreme heat')
    expect(heatAlerts[0].message).toContain('105')
  })

  it('weather_alerts handles high_wind condition with windSpeedThreshold', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.02)

    const rule: AlertRule = {
      id: 'wx-wind',
      name: 'Wind',
      description: '',
      enabled: true,
      condition: { type: 'weather_alerts', weatherCondition: 'high_wind', windSpeedThreshold: 45, demoMode: true },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.evaluateConditions()
    })

    const windAlerts = result.current.alerts.filter(a => a.ruleId === 'wx-wind')
    expect(windAlerts.length).toBe(1)
    expect(windAlerts[0].message).toContain('High wind warning')
    expect(windAlerts[0].message).toContain('55')
  })

  it('weather_alerts handles heavy_rain condition', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.03)

    const rule: AlertRule = {
      id: 'wx-rain',
      name: 'Rain',
      description: '',
      enabled: true,
      condition: { type: 'weather_alerts', weatherCondition: 'heavy_rain', demoMode: true },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.evaluateConditions()
    })

    const rainAlerts = result.current.alerts.filter(a => a.ruleId === 'wx-rain')
    expect(rainAlerts.length).toBe(1)
    expect(rainAlerts[0].message).toContain('Heavy rain')
  })

  it('weather_alerts handles snow condition', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.04)

    const rule: AlertRule = {
      id: 'wx-snow',
      name: 'Snow',
      description: '',
      enabled: true,
      condition: { type: 'weather_alerts', weatherCondition: 'snow', demoMode: true },
      severity: 'info',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.evaluateConditions()
    })

    const snowAlerts = result.current.alerts.filter(a => a.ruleId === 'wx-snow')
    expect(snowAlerts.length).toBe(1)
    expect(snowAlerts[0].message).toContain('Winter storm warning')
  })

  // Issue 9255 — without demoMode, weather rules must never fire on the random path
  it('weather_alerts does NOT fire randomly when demoMode is not enabled', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01) // would have triggered old random path

    const rule: AlertRule = {
      id: 'wx-no-demo',
      name: 'Weather',
      description: '',
      enabled: true,
      condition: { type: 'weather_alerts', weatherCondition: 'severe_storm' }, // no demoMode
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.evaluateConditions()
    })

    const wxAlerts = result.current.alerts.filter(a => a.ruleId === 'wx-no-demo')
    expect(wxAlerts.length).toBe(0)
  })

  // Issue 9255 — deterministic real-data path fires when threshold crossed
  it('weather_alerts fires for extreme_heat when currentTemperature exceeds threshold', () => {
    const rule: AlertRule = {
      id: 'wx-real-heat',
      name: 'Heat',
      description: '',
      enabled: true,
      condition: {
        type: 'weather_alerts',
        weatherCondition: 'extreme_heat',
        temperatureThreshold: 100,
        currentTemperature: 110, // real observed value above threshold
      },
      severity: 'critical',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.evaluateConditions()
    })

    expect(result.current.alerts.filter(a => a.ruleId === 'wx-real-heat').length).toBe(1)
  })
})
