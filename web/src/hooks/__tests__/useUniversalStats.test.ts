import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../useMCP', () => ({
  useClusters: vi.fn(() => ({ deduplicatedClusters: [], clusters: [], isLoading: false })),
  usePodIssues: vi.fn(() => ({ issues: [], isLoading: false })),
  useDeployments: vi.fn(() => ({ deployments: [], isLoading: false })),
  useDeploymentIssues: vi.fn(() => ({ issues: [], isLoading: false })),
  usePVCs: vi.fn(() => ({ pvcs: [], isLoading: false })),
  useServices: vi.fn(() => ({ services: [], isLoading: false })),
  useEvents: vi.fn(() => ({ events: [], isLoading: false })),
  useWarningEvents: vi.fn(() => ({ events: [], isLoading: false })),
  useSecurityIssues: vi.fn(() => ({ issues: [], isLoading: false })),
  useHelmReleases: vi.fn(() => ({ releases: [], isLoading: false })),
  useOperatorSubscriptions: vi.fn(() => ({ subscriptions: [], isLoading: false })),
  useOperators: vi.fn(() => ({ operators: [], isLoading: false })),
  useGPUNodes: vi.fn(() => ({ nodes: [], isLoading: false })),
}))

vi.mock('../useAlerts', () => ({
  useAlerts: vi.fn(() => ({ alerts: [], isLoading: false })),
  useAlertRules: vi.fn(() => ({ rules: [], isLoading: false })),
}))

vi.mock('../useDrillDown', () => ({
  useDrillDownActions: vi.fn(() => ({
    drillToAllClusters: vi.fn(), drillToAllNodes: vi.fn(), drillToAllPods: vi.fn(),
    drillToAllDeployments: vi.fn(), drillToAllServices: vi.fn(), drillToAllEvents: vi.fn(),
    drillToAllAlerts: vi.fn(), drillToAllHelm: vi.fn(), drillToAllOperators: vi.fn(),
    drillToAllSecurity: vi.fn(), drillToAllGPU: vi.fn(), drillToAllStorage: vi.fn(),
  })),
}))

import { useUniversalStats } from '../useUniversalStats'

describe('useUniversalStats', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useUniversalStats())
    expect(result.current).toHaveProperty('isLoading')
  })
})
