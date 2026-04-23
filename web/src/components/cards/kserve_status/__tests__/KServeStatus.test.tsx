import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { KSERVE_DEMO_DATA } from '../demoData'

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

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true,
  default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false,
  isDemoModeForced: false,
  isNetlifyDeployment: false,
  canToggleDemoMode: () => true,
  isDemoToken: () => true,
  setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('../../../../hooks/useMCP', () => ({
  useClusters: () => ({ isLoading: false, clusters: [] }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
}))

vi.mock('../../../../lib/cards/cardHooks', () => ({
  useCardData: () => ({
    items: [],
    totalItems: 0,
    currentPage: 1,
    totalPages: 1,
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

const mockUseKServeStatus = vi.fn()
vi.mock('../useKServeStatus', () => ({
  useKServeStatus: () => mockUseKServeStatus(),
}))

import { KServeStatus } from '../KServeStatus'

const defaultHookResult = {
  data: KSERVE_DEMO_DATA,
  isLoading: false,
  isRefreshing: false,
  isFailed: false,
  isDemoFallback: true,
  consecutiveFailures: 0,
  lastRefresh: Date.now(),
  refetch: vi.fn(),
}

describe('KServeStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
      hasData: true,
      isRefreshing: false,
    })
    mockUseKServeStatus.mockReturnValue(defaultHookResult)
  })

  it('renders without crashing', () => {
    const { container } = render(<KServeStatus />)
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('passes isDemoData=true to useCardLoadingState', () => {
    render(<KServeStatus />)
    const args = mockUseCardLoadingState.mock.calls[0][0] as Record<string, unknown>
    expect(args.isDemoData).toBe(true)
  })

  it('forwards consecutiveFailures to useCardLoadingState', () => {
    mockUseKServeStatus.mockReturnValue({
      ...defaultHookResult,
      consecutiveFailures: 3,
    })
    render(<KServeStatus />)
    const args = mockUseCardLoadingState.mock.calls[0][0] as Record<string, unknown>
    expect(args.consecutiveFailures).toBe(3)
  })

  it('renders skeleton state', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: true,
      showEmptyState: false,
      hasData: false,
      isRefreshing: false,
    })
    const { container } = render(<KServeStatus />)
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })

  it('renders not-installed hint', () => {
    mockUseKServeStatus.mockReturnValue({
      ...defaultHookResult,
      data: { ...KSERVE_DEMO_DATA, health: 'not-installed' as const, services: [] },
      isDemoFallback: false,
    })
    const { container } = render(<KServeStatus />)
    expect(container.textContent).toContain('kserve.notInstalled')
  })
})
