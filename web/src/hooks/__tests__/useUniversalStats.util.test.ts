import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ─── Mock factories ───────────────────────────────────────────────
// Each mock is assigned to a variable so individual tests can override
// return values via mockReturnValue / mockReturnValueOnce.

const mockUseClusters = vi.fn(() => ({
  deduplicatedClusters: [] as unknown[],
  clusters: [] as unknown[],
  isLoading: false,
}))
const mockUsePodIssues = vi.fn(() => ({ issues: [] as unknown[], isLoading: false }))
const mockUseDeployments = vi.fn(() => ({ deployments: [] as unknown[], isLoading: false }))
const mockUseDeploymentIssues = vi.fn(() => ({ issues: [] as unknown[], isLoading: false }))
const mockUsePVCs = vi.fn(() => ({ pvcs: [] as unknown[], isLoading: false }))
const mockUseServices = vi.fn(() => ({ services: [] as unknown[], isLoading: false }))
const mockUseEvents = vi.fn(() => ({ events: [] as unknown[], isLoading: false }))
const mockUseWarningEvents = vi.fn(() => ({ events: [] as unknown[], isLoading: false }))
const mockUseSecurityIssues = vi.fn(() => ({ issues: [] as unknown[], isLoading: false }))
const mockUseHelmReleases = vi.fn(() => ({ releases: [] as unknown[], isLoading: false }))
const mockUseOperatorSubscriptions = vi.fn(() => ({ subscriptions: [] as unknown[], isLoading: false }))
const mockUseOperators = vi.fn(() => ({ operators: [] as unknown[], isLoading: false }))
const mockUseGPUNodes = vi.fn(() => ({ nodes: [] as unknown[], isLoading: false }))

const mockUseAlerts = vi.fn(() => ({ alerts: [], stats: undefined as never, isLoading: false }))
const mockUseAlertRules = vi.fn(() => ({ rules: [] as unknown[], isLoading: false }))

const mockDrillToAllClusters = vi.fn()
const mockDrillToAllNodes = vi.fn()
const mockDrillToAllPods = vi.fn()
const mockDrillToAllDeployments = vi.fn()
const mockDrillToAllServices = vi.fn()
const mockDrillToAllEvents = vi.fn()
const mockDrillToAllAlerts = vi.fn()
const mockDrillToAllHelm = vi.fn()
const mockDrillToAllOperators = vi.fn()
const mockDrillToAllSecurity = vi.fn()
const mockDrillToAllGPU = vi.fn()
const mockDrillToAllStorage = vi.fn()

vi.mock('../useMCP', () => ({
  useClusters: (...args: unknown[]) => mockUseClusters(...args),
  usePodIssues: (...args: unknown[]) => mockUsePodIssues(...args),
  useDeployments: (...args: unknown[]) => mockUseDeployments(...args),
  useDeploymentIssues: (...args: unknown[]) => mockUseDeploymentIssues(...args),
  usePVCs: (...args: unknown[]) => mockUsePVCs(...args),
  useServices: (...args: unknown[]) => mockUseServices(...args),
  useEvents: (...args: unknown[]) => mockUseEvents(...args),
  useWarningEvents: (...args: unknown[]) => mockUseWarningEvents(...args),
  useSecurityIssues: (...args: unknown[]) => mockUseSecurityIssues(...args),
  useHelmReleases: (...args: unknown[]) => mockUseHelmReleases(...args),
  useOperatorSubscriptions: (...args: unknown[]) => mockUseOperatorSubscriptions(...args),
  useOperators: (...args: unknown[]) => mockUseOperators(...args),
  useGPUNodes: (...args: unknown[]) => mockUseGPUNodes(...args),
}))

vi.mock('../useCachedData', () => ({
  useCachedPVCs: (...args: unknown[]) => mockUsePVCs(...args),
}))

const mockUseIngresses = vi.fn(() => ({ ingresses: [] as unknown[], isLoading: false }))

vi.mock('../mcp/networking', () => ({
  useIngresses: (...args: unknown[]) => mockUseIngresses(...args),
}))

vi.mock('../useAlerts', () => ({
  useAlerts: (...args: unknown[]) => mockUseAlerts(...args),
  useAlertRules: (...args: unknown[]) => mockUseAlertRules(...args),
}))

vi.mock('../useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToAllClusters: mockDrillToAllClusters,
    drillToAllNodes: mockDrillToAllNodes,
    drillToAllPods: mockDrillToAllPods,
    drillToAllDeployments: mockDrillToAllDeployments,
    drillToAllServices: mockDrillToAllServices,
    drillToAllEvents: mockDrillToAllEvents,
    drillToAllAlerts: mockDrillToAllAlerts,
    drillToAllHelm: mockDrillToAllHelm,
    drillToAllOperators: mockDrillToAllOperators,
    drillToAllSecurity: mockDrillToAllSecurity,
    drillToAllGPU: mockDrillToAllGPU,
    drillToAllStorage: mockDrillToAllStorage,
  }),
}))

import { useUniversalStats, createMergedStatValueGetter } from '../useUniversalStats'

// ─── Helpers ──────────────────────────────────────────────────────

function getStatValue(blockId: string) {
  const { result } = renderHook(() => useUniversalStats())
  return result.current.getStatValue(blockId)
}

/** Build a minimal cluster object with sensible defaults */
function makeCluster(overrides: Record<string, unknown> = {}) {
  return {
    name: 'cluster-1',
    healthy: true,
    reachable: true,
    nodeCount: 3,
    podCount: 10,
    cpuCores: 8,
    memoryGB: 32,
    storageGB: 100,
    namespaces: ['default', 'kube-system'],
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════
// createMergedStatValueGetter
// ════════════════════════════════════════════════════════════════

describe('createMergedStatValueGetter', () => {
  it('uses dashboard value when it has a real value (not undefined or dash)', () => {
    const dashboardGetter = vi.fn().mockReturnValue({ value: 42, sublabel: 'from dashboard' })
    const universalGetter = vi.fn().mockReturnValue({ value: 99, sublabel: 'from universal' })
    const merged = createMergedStatValueGetter(dashboardGetter, universalGetter)

    const result = merged('clusters')
    expect(result.value).toBe(42)
    expect(result.sublabel).toBe('from dashboard')
  })

  it('falls back to universal when dashboard value is undefined', () => {
    const dashboardGetter = vi.fn().mockReturnValue({ value: undefined, sublabel: 'n/a' })
    const universalGetter = vi.fn().mockReturnValue({ value: 10, sublabel: 'universal' })
    const merged = createMergedStatValueGetter(dashboardGetter, universalGetter)

    const result = merged('nodes')
    expect(result.value).toBe(10)
  })

  it('falls back to universal when dashboard value is dash', () => {
    const dashboardGetter = vi.fn().mockReturnValue({ value: '-', sublabel: 'n/a' })
    const universalGetter = vi.fn().mockReturnValue({ value: 5, sublabel: 'universal' })
    const merged = createMergedStatValueGetter(dashboardGetter, universalGetter)

    const result = merged('anything')
    expect(result.value).toBe(5)
  })

  it('preserves dashboard isDemo metadata when universal does not have it', () => {
    const dashboardGetter = vi.fn().mockReturnValue({ value: '-', sublabel: 'n/a', isDemo: true })
    const universalGetter = vi.fn().mockReturnValue({ value: 7, sublabel: 'universal' })
    const merged = createMergedStatValueGetter(dashboardGetter, universalGetter)

    const result = merged('stat')
    expect(result.value).toBe(7)
    expect(result.isDemo).toBe(true)
  })

  it('does not override universal isDemo when universal already has isDemo', () => {
    const dashboardGetter = vi.fn().mockReturnValue({ value: '-', isDemo: false })
    const universalGetter = vi.fn().mockReturnValue({ value: 7, isDemo: true })
    const merged = createMergedStatValueGetter(dashboardGetter, universalGetter)

    const result = merged('stat')
    expect(result.isDemo).toBe(true) // universal's isDemo is kept
  })

  it('returns "Not available" fallback when neither getter provides a value', () => {
    const dashboardGetter = vi.fn().mockReturnValue({ value: undefined })
    const universalGetter = vi.fn().mockReturnValue(undefined)
    const merged = createMergedStatValueGetter(dashboardGetter, universalGetter)

    const result = merged('unknown')
    expect(result.value).toBe('-')
    expect(result.sublabel).toBe('Not available on this dashboard')
  })

  it('returns dashboard value 0 (falsy but valid)', () => {
    const dashboardGetter = vi.fn().mockReturnValue({ value: 0, sublabel: 'zero items' })
    const universalGetter = vi.fn().mockReturnValue({ value: 99, sublabel: 'universal' })
    const merged = createMergedStatValueGetter(dashboardGetter, universalGetter)

    const result = merged('stat')
    expect(result.value).toBe(0)
    expect(result.sublabel).toBe('zero items')
  })

  it('returns dashboard empty string value (truthy check: !== undefined && !== dash)', () => {
    const dashboardGetter = vi.fn().mockReturnValue({ value: '', sublabel: 'empty' })
    const universalGetter = vi.fn().mockReturnValue({ value: 99, sublabel: 'universal' })
    const merged = createMergedStatValueGetter(dashboardGetter, universalGetter)

    const result = merged('stat')
    expect(result.value).toBe('')
  })

  it('handles null dashboard getter return', () => {
    const dashboardGetter = vi.fn().mockReturnValue(null)
    const universalGetter = vi.fn().mockReturnValue({ value: 5, sublabel: 'universal' })
    const merged = createMergedStatValueGetter(dashboardGetter, universalGetter)

    const result = merged('stat')
    expect(result.value).toBe(5)
  })

  it('handles both getters returning null/undefined', () => {
    const dashboardGetter = vi.fn().mockReturnValue(null)
    const universalGetter = vi.fn().mockReturnValue(undefined)
    const merged = createMergedStatValueGetter(dashboardGetter, universalGetter)

    const result = merged('stat')
    expect(result.value).toBe('-')
  })
})
