import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import type { ReactNode } from 'react'
import { ClusterCosts } from './ClusterCosts'

const mockUseClusters = vi.fn()
const mockUseCachedGPUNodes = vi.fn()
const mockUseCardData = vi.fn()
const mockDrillToCost = vi.fn()

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key.endsWith('clusterCount')) return `${opts?.count ?? 0} clusters`
      return key.split('.').pop() ?? key
    },
  }),
}))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

vi.mock('../../hooks/useCachedData', () => ({
  useCachedGPUNodes: () => mockUseCachedGPUNodes(),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToCost: mockDrillToCost }),
}))

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}))

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
}))

vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: (...args: unknown[]) => mockUseCardData(...args),
  commonComparators: {
    number: () => () => 0,
    string: () => () => 0,
  },
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="search" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  CardControlsRow: () => <div data-testid="controls" />,
  CardPaginationFooter: () => <div data-testid="pagination" />,
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../ui/CloudProviderIcon', () => ({
  CloudProviderIcon: () => <span data-testid="provider-icon" />,
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

describe('ClusterCosts', () => {
  const baseCardData = {
    items: [] as Array<Record<string, unknown>>,
    allFilteredItems: [] as Array<Record<string, unknown>>,
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
      localClusterFilter: [] as string[],
      toggleClusterFilter: vi.fn(),
      clearClusterFilter: vi.fn(),
      availableClusters: [] as Array<{ name: string }>,
      showClusterFilter: false,
      setShowClusterFilter: vi.fn(),
      clusterFilterRef: { current: null },
    },
    sorting: {
      sortBy: 'cost',
      setSortBy: vi.fn(),
      sortDirection: 'desc',
      setSortDirection: vi.fn(),
    },
    containerRef: { current: null },
    containerStyle: {},
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [],
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
    })
    mockUseCachedGPUNodes.mockReturnValue({
      nodes: [],
      isRefreshing: false,
      isDemoFallback: false,
    })
    mockUseCardData.mockReturnValue(baseCardData)
  })

  it('renders loading skeleton when initial cluster fetch is loading', () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [],
      isLoading: true,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
    })
    render(<ClusterCosts />)
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  it('renders cluster costs and drills down on row click', async () => {
    const items = [
      { cluster: 'prod', name: 'prod', healthy: true, cpus: 8, memory: 96, gpus: 1, hourly: 2, daily: 48, monthly: 1440, provider: 'aws' },
    ]
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'prod', healthy: true, cpuCores: 8, nodeCount: 3, context: 'eks-prod' },
      ],
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
    })
    mockUseCardData.mockReturnValue({ ...baseCardData, items, allFilteredItems: items, totalItems: 1 })

    render(<ClusterCosts />)
    expect(screen.getByText('prod')).toBeTruthy()
    await userEvent.click(screen.getByText('prod'))
    expect(mockDrillToCost).toHaveBeenCalledWith(
      'prod',
      expect.objectContaining({ monthly: 1440, cpus: 8 }),
    )
  })

  it('shows totals from all filtered clusters, not just the visible page', () => {
    // Simulate 7 clusters total, page size 5 — only 5 are in `items`, all 7 in `allFilteredItems`
    const makeCluster = (name: string, monthly: number) => ({
      cluster: name, name, healthy: true, cpus: 4, memory: 32, gpus: 0,
      hourly: monthly / 720, daily: monthly / 30, monthly, provider: 'aws',
    })
    const page1Items = [
      makeCluster('c1', 1000),
      makeCluster('c2', 1000),
      makeCluster('c3', 1000),
      makeCluster('c4', 1000),
      makeCluster('c5', 1000),
    ]
    const allItems = [
      ...page1Items,
      makeCluster('c6', 1000),
      makeCluster('c7', 1000),
    ]
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: allItems.map(c => ({
        name: c.name, healthy: true, cpuCores: 4, nodeCount: 1, context: c.name,
      })),
      isLoading: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0,
    })
    mockUseCardData.mockReturnValue({
      ...baseCardData,
      items: page1Items,
      allFilteredItems: allItems,
      totalItems: allItems.length,
      needsPagination: true,
      totalPages: 2,
    })

    render(<ClusterCosts />)

    // Banner must show $7,000 (all 7 clusters), not $5,000 (page 1 only)
    expect(screen.getByText('$7,000')).toBeTruthy()
  })
})
