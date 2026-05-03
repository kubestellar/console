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
    mockUseCardData.mockReturnValue({ ...baseCardData, items, totalItems: 1 })

    render(<ClusterCosts />)
    expect(screen.getByText('prod')).toBeTruthy()
    await userEvent.click(screen.getByText('prod'))
    expect(mockDrillToCost).toHaveBeenCalledWith(
      'prod',
      expect.objectContaining({ monthly: 1440, cpus: 8 }),
    )
  })
})
