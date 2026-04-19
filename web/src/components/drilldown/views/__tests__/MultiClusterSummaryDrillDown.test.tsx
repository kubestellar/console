import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../../hooks/useClusterData', () => ({
  useClusterData: () => ({ clusters: [], deduplicatedClusters: [], pods: [], deployments: [], events: [], helmReleases: [], operatorSubscriptions: [], securityIssues: [] }),
}))

vi.mock('../../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToCluster: vi.fn(), drillToNamespace: vi.fn(), drillToDeployment: vi.fn(), drillToPod: vi.fn(), drillToNode: vi.fn(), drillToEvents: [], drillToHelm: null, drillToOperator: null, drillToAlert: vi.fn() }),
}))

// Issue 8844 — MultiClusterSummaryDrillDown now reads alerts from useAlerts so the
// all-alerts drill-down matches the Alerts dashboard stat blocks.
vi.mock('../../../../hooks/useAlerts', () => ({
  useAlerts: () => ({ alerts: [], stats: { total: 0, firing: 0, resolved: 0, critical: 0, warning: 0, info: 0, acknowledged: 0 } }),
}))

vi.mock('../../../../hooks/useCachedData', () => ({
  useCachedNodes: () => ({ nodes: [], lastRefresh: Date.now(), isLoading: false, isFailed: false, isDemoFallback: false, isRefreshing: false, consecutiveFailures: 0, refetch: vi.fn() }),
  useCachedPVCs: () => ({ pvcs: [], lastRefresh: Date.now(), isLoading: false, isFailed: false, isDemoFallback: false, isRefreshing: false, consecutiveFailures: 0, refetch: vi.fn() }),
}))

import { MultiClusterSummaryDrillDown } from '../MultiClusterSummaryDrillDown'

describe('MultiClusterSummaryDrillDown', () => {
  it('renders without crashing', () => {
    const { container } = render(<MultiClusterSummaryDrillDown data={{ filter: '' }} />)
    expect(container).toBeTruthy()
  })
})
