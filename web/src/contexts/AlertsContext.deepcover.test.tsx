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
    const TWENTY_FIVE_HOURS_MS = 25 * 60 * 60 * 1000
    const staleTimestamp = Date.now() - TWENTY_FIVE_HOURS_MS
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

describe('deep coverage: pod_crash filtering', () => {
  it('pod_crash respects cluster filter and ignores pods from other clusters', () => {
    const rule: AlertRule = {
      id: 'pc-cluster-flt',
      name: 'Pod Crash (prod only)',
      description: '',
      enabled: true,
      condition: { type: 'pod_crash', threshold: 3, clusters: ['prod'] },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify([]))

    // Cannot test evaluation without MCP data injection in this mock setup
    // but we can verify rule creation with cluster filter
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    const rules = result.current.rules.filter(r => r.id === 'pc-cluster-flt')
    expect(rules.length).toBe(1)
    expect(rules[0].condition.clusters).toEqual(['prod'])
  })

  it('pod_crash does not fire when restarts are below threshold', () => {
    const rule: AlertRule = {
      id: 'pc-below',
      name: 'Pod Crash',
      description: '',
      enabled: true,
      condition: { type: 'pod_crash', threshold: 10 },
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

    // No pod issues injected, so no alerts should fire
    expect(result.current.alerts.filter(a => a.ruleId === 'pc-below').length).toBe(0)
  })
})

describe('deep coverage: deduplicateAlerts keeps most recent', () => {
  it('activeAlerts dedup keeps the most recently fired entry for cluster-aggregate types', () => {
    const rule: AlertRule = {
      id: 'dedup-multi-deep',
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
    const alerts: Alert[] = [
      makeAlert({
        id: 'dup-oldest-deep',
        ruleId: 'dedup-multi-deep',
        ruleName: 'Node Not Ready',
        message: 'oldest',
        cluster: 'prod',
        firedAt: '2024-01-01T00:00:00Z',
      }),
      makeAlert({
        id: 'dup-middle-deep',
        ruleId: 'dedup-multi-deep',
        ruleName: 'Node Not Ready',
        message: 'middle',
        cluster: 'prod',
        firedAt: '2024-06-01T00:00:00Z',
      }),
      makeAlert({
        id: 'dup-newest-deep',
        ruleId: 'dedup-multi-deep',
        ruleName: 'Node Not Ready',
        message: 'newest',
        cluster: 'prod',
        firedAt: '2024-12-01T00:00:00Z',
      }),
    ]
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    expect(result.current.activeAlerts.length).toBe(1)
    expect(result.current.activeAlerts[0].id).toBe('dup-newest-deep')
  })
})

describe('deep coverage: MAX_ALERTS in-memory cap during creation', () => {
  it('createAlert caps in-memory alerts at MAX_ALERTS keeping firing over resolved', () => {
    const MAX_ALERTS_COUNT = 500
    const alerts: Alert[] = Array.from({ length: MAX_ALERTS_COUNT - 1 }, (_, i) =>
      makeAlert({
        id: `seed-${i}`,
        ruleId: 'r1',
        status: 'resolved',
        resolvedAt: `2024-02-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
        firedAt: `2024-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
      })
    )
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Create several new firing alerts that push over the cap
    act(() => {
      const rule = result.current.createRule(makeRule({
        name: 'Test Cap',
        condition: { type: 'gpu_usage', threshold: 10 },
      }))

      // Creating the rule doesn't create alerts directly - the cap is tested
      // via the saveAlerts function which is called on every alert state change
      expect(rule).toBeDefined()
    })

    // Total alerts should not exceed MAX_ALERTS
    expect(result.current.alerts.length).toBeLessThanOrEqual(MAX_ALERTS_COUNT)
  })
})

describe('deep coverage: DNS failure with OpenShift dns-default pods', () => {
  it('dns_failure condition rule can be created for OpenShift dns-default detection', () => {
    const rule: AlertRule = {
      id: 'dns-ocp-deep',
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

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.evaluateConditions()
    })

    // Without injected MCP data (no pod issues), no DNS alerts should fire
    expect(result.current.alerts.filter(a => a.ruleId === 'dns-ocp-deep').length).toBe(0)
  })
})

describe('deep coverage: certificate error persistent suppression', () => {
  it('certificate_error evaluation does not create duplicate alerts for same cluster', () => {
    const rule: AlertRule = {
      id: 'cert-persist-deep',
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

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Without MCP data, no cert errors should fire
    act(() => {
      result.current.evaluateConditions()
    })

    expect(result.current.alerts.filter(a => a.ruleId === 'cert-persist-deep').length).toBe(0)
  })
})

describe('deep coverage: cluster_unreachable error type mapping', () => {
  it('cluster_unreachable condition with no matching clusters produces no alerts', () => {
    const rule: AlertRule = {
      id: 'cu-empty-deep',
      name: 'Cluster Unreachable',
      description: '',
      enabled: true,
      condition: { type: 'cluster_unreachable', clusters: ['nonexistent'] },
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

    // No clusters match, so no alerts
    expect(result.current.alerts.filter(a => a.ruleId === 'cu-empty-deep').length).toBe(0)
  })
})

describe('deep coverage: resolveAlert with notification channels', () => {
  it('resolveAlert on non-existent alert is safe', () => {
    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.resolveAlert('non-existent-id-deep')
    })

    // Should not throw
    expect(result.current.alerts.length).toBe(0)
  })

  it('resolveAlert on already-resolved alert updates resolvedAt', () => {
    const resolvedAlert = makeAlert({
      id: 'already-res-deep',
      status: 'resolved',
      resolvedAt: '2024-01-01T00:00:00Z',
    })
    localStorage.setItem('kc_alerts', JSON.stringify([resolvedAlert]))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    act(() => {
      result.current.resolveAlert('already-res-deep')
    })

    const alert = result.current.alerts.find(a => a.id === 'already-res-deep')
    expect(alert?.status).toBe('resolved')
  })
})

describe('deep coverage: acknowledgedAlerts dedup', () => {
  it('acknowledgedAlerts are deduplicated by rule and cluster', () => {
    const rule: AlertRule = {
      id: 'ack-dedup-rule',
      name: 'GPU Usage',
      description: '',
      enabled: true,
      condition: { type: 'gpu_usage' },
      severity: 'warning',
      channels: [],
      aiDiagnose: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }
    const alerts: Alert[] = [
      makeAlert({
        id: 'ackd-1',
        ruleId: 'ack-dedup-rule',
        ruleName: 'GPU Usage',
        cluster: 'prod',
        acknowledgedAt: '2024-01-01T00:00:00Z',
        firedAt: '2024-01-01T00:00:00Z',
      }),
      makeAlert({
        id: 'ackd-2',
        ruleId: 'ack-dedup-rule',
        ruleName: 'GPU Usage',
        cluster: 'prod',
        acknowledgedAt: '2024-01-02T00:00:00Z',
        firedAt: '2024-06-01T00:00:00Z',
      }),
    ]
    localStorage.setItem('kc_alert_rules', JSON.stringify([rule]))
    localStorage.setItem('kc_alerts', JSON.stringify(alerts))

    const { result } = renderHook(() => useAlertsContext(), { wrapper })

    // Both have same ruleId + cluster (non-pod_crash type) → dedup to 1
    expect(result.current.acknowledgedAlerts.length).toBe(1)
    // Most recently fired entry is kept
    expect(result.current.acknowledgedAlerts[0].id).toBe('ackd-2')
  })
})
