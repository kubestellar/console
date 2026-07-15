import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GatewayStatus } from './GatewayStatus'

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../hooks/useGatewayStatus', () => ({
  useGatewayStatus: vi.fn(),
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input data-testid="card-search" value={value} onChange={(e) => onChange(e.target.value)} />
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
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

vi.mock('../../lib/cards/statusMappers', () => ({
  gatewayStatusIcons: {
    Programmed: () => null,
    Accepted: () => null,
    Pending: () => null,
    NotAccepted: () => null,
    Unknown: () => null,
  },
  gatewayStatusColors: {
    Programmed: { text: 'text-green-400', bg: 'bg-green-500/20' },
    Accepted: { text: 'text-blue-400', bg: 'bg-blue-500/20' },
    Pending: { text: 'text-yellow-400', bg: 'bg-yellow-500/20' },
    NotAccepted: { text: 'text-red-400', bg: 'bg-red-500/20' },
    Unknown: { text: 'text-gray-400', bg: 'bg-gray-500/20' },
  },
}))

vi.mock('../../config/externalApis', () => ({
  K8S_DOCS: {
    gatewayApi: 'https://gateway-api.sigs.k8s.io',
    gatewayApiGettingStarted: 'https://gateway-api.sigs.k8s.io/getting-started',
    gatewayApiInstallCommand: 'kubectl apply -f gateway.yaml',
    gatewayApiImplementations: 'https://gateway-api.sigs.k8s.io/implementations',
    gammaInitiative: 'https://gateway-api.sigs.k8s.io/concepts/gamma',
  },
}))

import { useCardLoadingState } from './CardDataContext'
import { useGatewayStatus } from '../../hooks/useGatewayStatus'
import { useCardData } from '../../lib/cards/cardHooks'

const mockLoadingState = vi.mocked(useCardLoadingState)
const mockUseGatewayStatus = vi.mocked(useGatewayStatus)
const mockUseCardData = vi.mocked(useCardData)

const baseLoadingState = {
  showSkeleton: false,
  showEmptyState: false,
  hasData: true,
  isRefreshing: false,
  loadingTimedOut: false,
}

const baseGatewayStatus = {
  gateways: [],
  isLoading: false,
  isRefreshing: false,
  isDemoData: false,
  isFailed: false,
  consecutiveFailures: 0,
  refetch: vi.fn(),
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

describe('GatewayStatus', () => {
  beforeEach(() => {
    mockLoadingState.mockReturnValue(baseLoadingState)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseGatewayStatus.mockReturnValue(baseGatewayStatus as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseCardData.mockReturnValue(baseCardData as any)
  })

  it('renders skeleton while loading', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseGatewayStatus.mockReturnValue({ ...baseGatewayStatus, isLoading: true } as any)
    const { container } = render(<GatewayStatus />)
    expect(container.firstChild).toBeTruthy()
    expect(container.querySelector('[data-testid="skeleton"]')).toBeInTheDocument()
  })

  it('renders error state when fetch failed', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseGatewayStatus.mockReturnValue({ ...baseGatewayStatus, isLoading: false, isFailed: true } as any)
    render(<GatewayStatus />)
    expect(screen.getByText('gatewayStatus.loadFailed')).toBeInTheDocument()
  })

  it('retry button calls refetch', () => {
    const refetch = vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseGatewayStatus.mockReturnValue({ ...baseGatewayStatus, isLoading: false, isFailed: true, refetch } as any)
    render(<GatewayStatus />)
    fireEvent.click(screen.getByText('common:common.retry'))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('renders happy-path with gateway data', () => {
    const gateways = [
      {
        name: 'my-gateway',
        namespace: 'default',
        cluster: 'prod',
        gatewayClass: 'nginx',
        status: 'Programmed',
        attachedRoutes: 3,
        addresses: ['10.0.0.1'],
        listeners: [{ protocol: 'HTTP', port: 80 }],
      },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseGatewayStatus.mockReturnValue({ ...baseGatewayStatus, gateways } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseCardData.mockReturnValue({ ...baseCardData, items: gateways, totalItems: 1 } as any)
    render(<GatewayStatus />)
    expect(screen.getByText('my-gateway')).toBeInTheDocument()
  })

  it('matches snapshot', () => {
    const { container } = render(<GatewayStatus />)
    expect(container).toMatchSnapshot()
  })
})
