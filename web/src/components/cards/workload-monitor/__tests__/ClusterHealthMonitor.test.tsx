import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', search: '', hash: '', state: null }),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

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
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: () => ({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false }),
}))

vi.mock('../../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: [], isAllClustersSelected: true }),
}))

// Create a refetch that never resolves so isRefreshing stays true during assertion
const hangingRefetch = () => new Promise(() => {})

vi.mock('../../../../hooks/useMCP', () => ({
  useClusters: () => ({
    deduplicatedClusters: [{ name: 'cluster-1', status: 'Ready' }],
    isLoading: false,
    isRefreshing: false,
    isFailed: false,
    consecutiveFailures: 0,
    refetch: hangingRefetch,
  }),
}))

vi.mock('../../../../hooks/useCachedData', () => ({
  useCachedPodIssues: () => ({
    issues: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: null,
    isFailed: false,
    consecutiveFailures: 0,
    refetch: hangingRefetch,
  }),
  useCachedDeploymentIssues: () => ({
    issues: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: null,
    isFailed: false,
    consecutiveFailures: 0,
    refetch: hangingRefetch,
  }),
}))

import { ClusterHealthMonitor } from '../ClusterHealthMonitor'

describe('ClusterHealthMonitor', () => {
  it('renders without crashing', () => {
    const { container } = render(<ClusterHealthMonitor />)
    expect(container).toBeTruthy()
  })

  it('does not show animate-spin when not refreshing', () => {
    const { container } = render(<ClusterHealthMonitor />)
    const refreshIcon = container.querySelector('.animate-spin')
    expect(refreshIcon).toBeNull()
  })

  it('shows animate-spin class on RefreshCw during refresh', async () => {
    const { container } = render(<ClusterHealthMonitor />)
    // Click the refresh button to trigger local isRefreshing state
    const refreshButton = container.querySelector('button[title="common:common.refresh"]')
    expect(refreshButton).not.toBeNull()
    fireEvent.click(refreshButton!)
    // The component sets local isRefreshing=true which triggers animate-spin
    await waitFor(() => {
      const spinningElements = container.querySelectorAll('.animate-spin')
      expect(spinningElements.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('applies text-green-400 color during refresh', async () => {
    const { container } = render(<ClusterHealthMonitor />)
    const refreshButton = container.querySelector('button[title="common:common.refresh"]')
    expect(refreshButton).not.toBeNull()
    fireEvent.click(refreshButton!)
    await waitFor(() => {
      const greenRefresh = container.querySelector('.text-green-400.animate-spin')
      expect(greenRefresh).not.toBeNull()
    })
  })
})
