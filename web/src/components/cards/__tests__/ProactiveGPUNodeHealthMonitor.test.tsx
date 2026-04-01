import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('../../../lib/cn', () => ({
  cn: vi.fn(),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: () => ({ data: [], isLoading: false, error: null }),
  useCardLoadingState: () => ({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToNode: vi.fn() }),
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedGPUNodeHealth: () => ({ nodes: [], isLoading: false, isDemoFallback: null, isFailed: false, consecutiveFailures: [], lastRefresh: Date.now() }),
  useGPUHealthCronJob: () => ({ status: '', isLoading: false, error: null, actionInProgress: null, install: null, uninstall: null, refetch: vi.fn() }),
}))

import ProactiveGPUNodeHealthMonitor from '../ProactiveGPUNodeHealthMonitor'

describe('ProactiveGPUNodeHealthMonitor', () => {
  it('renders without crashing', () => {
    const { container } = render(<ProactiveGPUNodeHealthMonitor />)
    expect(container).toBeTruthy()
  })
})
