import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => false, getDemoMode: () => false, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => false, hasRealToken: () => true, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/useDemoMode')>()),
  getDemoMode: () => false, default: () => false,
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => true, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => false, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/analytics')>()),
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: () => ({
    items: [],
    totalItems: 0,
    currentPage: 1,
    totalPages: 0,
    itemsPerPage: 5,
    goToPage: vi.fn(),
    needsPagination: false,
    setItemsPerPage: vi.fn(),
    filters: {
      search: '',
      setSearch: vi.fn(),
      localClusterFilter: [],
      toggleClusterFilter: vi.fn(),
      clearClusterFilter: vi.fn(),
      availableClusters: [],
      showClusterFilter: false,
      setShowClusterFilter: vi.fn(),
      clusterFilterRef: { current: null },
      clusterFilterBtnRef: { current: null },
      dropdownStyle: null,
    },
    sorting: {
      sortBy: 'status',
      setSortBy: vi.fn(),
      sortDirection: 'asc',
      setSortDirection: vi.fn(),
      toggleSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: undefined,
  }),
  commonComparators: {
    string: () => () => 0,
    number: () => () => 0,
    statusOrder: () => () => 0,
    date: () => () => 0,
    boolean: () => () => 0,
  },
}))

vi.mock('../../hooks/useCachedData', () => ({
  useCachedDeploymentIssues: () => ({
    issues: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
  }),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToDeployment: vi.fn() }),
}))

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: () => ({ showSkeleton: false, showEmptyState: false, hasData: true, isRefreshing: false }),
}))

vi.mock('./DynamicCardErrorBoundary', () => ({
  DynamicCardErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

import { DeploymentIssues } from './DeploymentIssues'

describe('DeploymentIssues', () => {
  it('renders without crashing', () => {
    const { container } = render(<DeploymentIssues />)
    expect(container).toBeTruthy()
  })

  it('renders with cluster and namespace config', () => {
    const { container } = render(
      <DeploymentIssues config={{ cluster: 'test-cluster', namespace: 'default' }} />,
    )
    expect(container.firstChild).toBeTruthy()
  })
})
