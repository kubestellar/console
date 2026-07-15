import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VClusterStatus } from './VClusterStatus'

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../hooks/useLocalClusterTools', () => ({
  useLocalClusterTools: vi.fn(),
}))

vi.mock('../../hooks/useLocalAgent', () => ({
  useLocalAgent: vi.fn(),
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input data-testid="card-search" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  CardControlsRow: () => null,
  CardPaginationFooter: () => null,
}))

vi.mock('../../lib/cards/cardHooks', () => ({
  useCardData: vi.fn(),
  commonComparators: {
    string: () => () => 0,
  },
}))

vi.mock('../ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

vi.mock('../../lib/constants/ui', () => ({
  DEFAULT_PAGE_SIZE: 5,
}))

import { useCardLoadingState } from './CardDataContext'
import { useLocalClusterTools } from '../../hooks/useLocalClusterTools'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { useCardData } from '../../lib/cards/cardHooks'

const mockLoadingState = vi.mocked(useCardLoadingState)
const mockLocalClusterTools = vi.mocked(useLocalClusterTools)
const mockLocalAgent = vi.mocked(useLocalAgent)
const mockUseCardData = vi.mocked(useCardData)

const baseLoadingState = {
  showSkeleton: false,
  showEmptyState: false,
  hasData: true,
  isRefreshing: false,
  loadingTimedOut: false,
}

const baseCardData = {
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
    sortBy: 'name',
    setSortBy: vi.fn(),
    sortDirection: 'asc',
    setSortDirection: vi.fn(),
  },
  containerRef: { current: null },
  containerStyle: {},
}

describe('VClusterStatus', () => {
  beforeEach(() => {
    mockLoadingState.mockReturnValue(baseLoadingState)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockLocalAgent.mockReturnValue({ isConnected: false } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockLocalClusterTools.mockReturnValue({
      vclusterInstances: [],
      isVClustersLoading: false,
      vclustersError: null,
      refresh: vi.fn(),
    } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseCardData.mockReturnValue(baseCardData as any)
  })

  it('renders skeleton while loading', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockLocalAgent.mockReturnValue({ isConnected: true } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockLocalClusterTools.mockReturnValue({ vclusterInstances: [], isVClustersLoading: true, vclustersError: null, refresh: vi.fn() } as any)
    const { container } = render(<VClusterStatus />)
    expect(container.firstChild).toBeTruthy()
    expect(container.querySelector('[data-testid="skeleton"]')).toBeInTheDocument()
  })

  it('renders error state when fetch failed', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockLocalAgent.mockReturnValue({ isConnected: true } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockLocalClusterTools.mockReturnValue({
      vclusterInstances: [],
      isVClustersLoading: false,
      vclustersError: new Error('Network error'),
      refresh: vi.fn(),
    } as any)
    render(<VClusterStatus />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('vclusterStatus.loadFailed')).toBeInTheDocument()
  })

  it('retry button calls refresh', () => {
    const refresh = vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockLocalAgent.mockReturnValue({ isConnected: true } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockLocalClusterTools.mockReturnValue({
      vclusterInstances: [],
      isVClustersLoading: false,
      vclustersError: new Error('Error'),
      refresh,
    } as any)
    render(<VClusterStatus />)
    fireEvent.click(screen.getByText('common:common.retry'))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('renders demo data when not connected', () => {
    // Demo data is used when not connected; demo vclusters include 'dev-vcluster'
    const { container } = render(<VClusterStatus />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders happy-path with live vcluster data', () => {
    const vclusters = [
      { name: 'dev-cluster', namespace: 'vcluster-dev', status: 'Running', context: 'kind-dev' },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockLocalAgent.mockReturnValue({ isConnected: true } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockLocalClusterTools.mockReturnValue({ vclusterInstances: vclusters, isVClustersLoading: false, vclustersError: null, refresh: vi.fn() } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseCardData.mockReturnValue({ ...baseCardData, items: [{ name: 'dev-cluster', namespace: 'vcluster-dev', hostCluster: 'kind-dev', status: 'Running', k8sVersion: '—', createdAt: '' }], totalItems: 1 } as any)
    render(<VClusterStatus />)
    expect(screen.getByText('dev-cluster')).toBeInTheDocument()
  })

  it('matches snapshot', () => {
    const { container } = render(<VClusterStatus />)
    expect(container).toMatchSnapshot()
  })
})
