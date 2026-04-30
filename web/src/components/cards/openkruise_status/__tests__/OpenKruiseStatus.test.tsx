import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import type { OpenKruiseDemoData } from '../demoData'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true,
  getDemoMode: () => true,
  isNetlifyDeployment: false,
  isDemoModeForced: false,
  canToggleDemoMode: () => true,
  setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(),
  subscribeDemoMode: () => () => {},
  isDemoToken: () => true,
  hasRealToken: () => false,
  setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

const mockUseDemoMode = vi.fn()
vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true,
  default: () => true,
  useDemoMode: () => mockUseDemoMode(),
  hasRealToken: () => false,
  isDemoModeForced: false,
  isNetlifyDeployment: false,
  canToggleDemoMode: () => true,
  isDemoToken: () => true,
  setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(),
  emitLogin: vi.fn(),
  emitEvent: vi.fn(),
  analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(),
  emitCardExpanded: vi.fn(),
  emitCardRefreshed: vi.fn(),
  markErrorReported: vi.fn(),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: {
    getUsage: () => ({ total: 0, remaining: 0, used: 0 }),
    trackRequest: vi.fn(),
    getSettings: () => ({ enabled: false }),
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../../CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
}))

vi.mock('../../../../hooks/useMCP', () => ({
  useClusters: () => ({ isLoading: false, clusters: [], deduplicatedClusters: [] }),
}))

vi.mock('../../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: [] }),
}))

// Stub useCardData so we don't have to faithfully simulate the entire
// filter/sort/paginate plumbing. The card under test only depends on the
// returned shape — empty items + filter/sort containers.
vi.mock('../../../../lib/cards/cardHooks', () => ({
  useCardData: () => ({
    items: [],
    allFilteredItems: [],
    totalItems: 0,
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 10,
    goToPage: vi.fn(),
    needsPagination: false,
    setItemsPerPage: vi.fn(),
    filters: {
      search: '',
      setSearch: vi.fn(),
      localClusterFilter: [],
      toggleClusterFilter: vi.fn(),
      clearClusterFilter: vi.fn(),
      availableClusters: ['cluster-a', 'cluster-b'],
      showClusterFilter: false,
      setShowClusterFilter: vi.fn(),
      clusterFilterRef: { current: null },
    },
    sorting: {
      sortBy: 'status',
      setSortBy: vi.fn(),
      sortDirection: 'asc' as const,
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: {},
  }),
}))

const mockUseOpenKruiseStatus = vi.fn()
vi.mock('../useOpenKruiseStatus', () => ({
  useOpenKruiseStatus: () => mockUseOpenKruiseStatus(),
}))

import { OpenKruiseStatus } from '../index'
import { OPENKRUISE_DEMO_DATA } from '../demoData'

const EMPTY_DATA: OpenKruiseDemoData = {
  cloneSets: [],
  advancedStatefulSets: [],
  advancedDaemonSets: [],
  sidecarSets: [],
  broadcastJobs: [],
  advancedCronJobs: [],
  controllerVersion: '',
  totalInjectedPods: 0,
  lastCheckTime: new Date(0).toISOString(),
}

const defaultHookResult = {
  data: OPENKRUISE_DEMO_DATA,
  isLoading: false,
  isRefreshing: false,
  isFailed: false,
  isDemoFallback: true,
  consecutiveFailures: 0,
  lastRefresh: Date.now(),
  refetch: vi.fn(),
}

function lastLoadingStateCall() {
  const calls = mockUseCardLoadingState.mock.calls
  return calls[calls.length - 1][0]
}

describe('OpenKruiseStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({
      isDemoMode: true,
      toggleDemoMode: vi.fn(),
      setDemoMode: vi.fn(),
    })
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
      hasData: true,
      isRefreshing: false,
    })
    mockUseOpenKruiseStatus.mockReturnValue(defaultHookResult)
  })

  it('renders without crashing with demo data', () => {
    const { container } = render(<OpenKruiseStatus />)
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('passes isRefreshing from the cache hook to useCardLoadingState', () => {
    mockUseOpenKruiseStatus.mockReturnValue({
      ...defaultHookResult,
      isRefreshing: true,
    })
    render(<OpenKruiseStatus />)
    expect(lastLoadingStateCall()).toMatchObject({ isRefreshing: true })
  })

  it('marks data as demo when either isDemoMode or isDemoFallback is true', () => {
    mockUseDemoMode.mockReturnValue({
      isDemoMode: false,
      toggleDemoMode: vi.fn(),
      setDemoMode: vi.fn(),
    })
    mockUseOpenKruiseStatus.mockReturnValue({
      ...defaultHookResult,
      isDemoFallback: true,
    })
    render(<OpenKruiseStatus />)
    expect(lastLoadingStateCall().isDemoData).toBe(true)
  })

  it('reports isDemoData=false when neither flag is set', () => {
    mockUseDemoMode.mockReturnValue({
      isDemoMode: false,
      toggleDemoMode: vi.fn(),
      setDemoMode: vi.fn(),
    })
    mockUseOpenKruiseStatus.mockReturnValue({
      ...defaultHookResult,
      isDemoFallback: false,
    })
    render(<OpenKruiseStatus />)
    expect(lastLoadingStateCall().isDemoData).toBe(false)
  })

  it('forwards isFailed and consecutiveFailures from the hook', () => {
    mockUseOpenKruiseStatus.mockReturnValue({
      ...defaultHookResult,
      isFailed: true,
      consecutiveFailures: 4,
    })
    render(<OpenKruiseStatus />)
    expect(lastLoadingStateCall()).toMatchObject({
      isFailed: true,
      consecutiveFailures: 4,
    })
  })

  it('reports hasAnyData=false when the hook returns empty data', () => {
    mockUseOpenKruiseStatus.mockReturnValue({
      ...defaultHookResult,
      data: EMPTY_DATA,
      isDemoFallback: false,
    })
    render(<OpenKruiseStatus />)
    expect(lastLoadingStateCall().hasAnyData).toBe(false)
  })

  it('reports hasAnyData=true when demo data is present', () => {
    render(<OpenKruiseStatus />)
    expect(lastLoadingStateCall().hasAnyData).toBe(true)
  })

  it('renders skeleton when useCardLoadingState returns showSkeleton=true', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: true,
      showEmptyState: false,
      hasData: false,
      isRefreshing: false,
    })
    const { container } = render(<OpenKruiseStatus />)
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('renders empty state when useCardLoadingState returns showEmptyState=true', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: true,
      hasData: false,
      isRefreshing: false,
    })
    const { container } = render(<OpenKruiseStatus />)
    expect(container.textContent).toContain('openkruiseStatus.noResources')
  })
})
