import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CRDHealth } from './CRDHealth'

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../hooks/useCRDs', () => ({
  useCRDs: vi.fn(),
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <input data-testid="card-search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
  ),
  CardControlsRow: () => null,
  CardPaginationFooter: () => null,
  CardAIActions: () => null,
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
  ClusterBadge: ({ cluster }: { cluster: string }) => <span data-testid="cluster-badge">{cluster}</span>,
}))

vi.mock('../../lib/cards/statusMappers', () => ({
  crdStatusIcons: { Established: () => null, NotEstablished: () => null, Terminating: () => null },
  crdStatusColors: { Established: 'green', NotEstablished: 'red', Terminating: 'yellow' },
}))

import { useCardLoadingState } from './CardDataContext'
import { useCRDs } from '../../hooks/useCRDs'
import { useCardData } from '../../lib/cards/cardHooks'

const mockLoadingState = vi.mocked(useCardLoadingState)
const mockUseCRDs = vi.mocked(useCRDs)
const mockUseCardData = vi.mocked(useCardData)

const baseLoadingState = {
  showSkeleton: false,
  showEmptyState: false,
  hasData: true,
  isRefreshing: false,
  loadingTimedOut: false,
}

const baseCRDs = {
  crds: [],
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  isFailed: false,
  consecutiveFailures: 0,
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
    sortBy: 'status',
    setSortBy: vi.fn(),
    sortDirection: 'asc',
    setSortDirection: vi.fn(),
  },
  containerRef: { current: null },
  containerStyle: {},
}

describe('CRDHealth', () => {
  beforeEach(() => {
    mockLoadingState.mockReturnValue(baseLoadingState)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseCRDs.mockReturnValue(baseCRDs as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseCardData.mockReturnValue(baseCardData as any)
  })

  it('renders skeleton while loading', () => {
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showSkeleton: true, hasData: false })
    const { container } = render(<CRDHealth />)
    expect(container.firstChild).toBeTruthy()
    expect(container.querySelector('[data-testid="skeleton"]')).toBeInTheDocument()
  })

  it('renders empty state when no CRDs found', () => {
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showEmptyState: true, hasData: false })
    render(<CRDHealth />)
    expect(screen.getByText('crdHealth.noCRDs')).toBeInTheDocument()
  })

  it('renders error state when no clusters available', () => {
    render(<CRDHealth />)
    expect(screen.getByText('common:common.noClustersAvailable')).toBeInTheDocument()
  })

  it('renders happy-path with CRD data', () => {
    const crds = [
      { name: 'widgets.example.com', group: 'example.com', version: 'v1', cluster: 'prod', status: 'Established', instances: 3, scope: 'Namespaced' },
      { name: 'gadgets.example.com', group: 'example.com', version: 'v1beta1', cluster: 'prod', status: 'Established', instances: 1, scope: 'Cluster' },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseCRDs.mockReturnValue({ ...baseCRDs, crds } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseCardData.mockReturnValue({ ...baseCardData, items: crds, totalItems: 2, filters: { ...baseCardData.filters, availableClusters: ['prod'] } } as any)
    const { container } = render(<CRDHealth />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders without crashing', () => {
    const { container } = render(<CRDHealth />)
    expect(container.firstChild).toBeTruthy()
  })
})
