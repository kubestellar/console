import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DNSHealth } from './DNSHealth'

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../hooks/useCachedData', () => ({
  useCachedPods: vi.fn(),
}))

vi.mock('../ui/RefreshIndicator', () => ({
  RefreshIndicator: () => null,
}))

import { useCardLoadingState } from './CardDataContext'
import { useCachedPods } from '../../hooks/useCachedData'

const mockLoadingState = vi.mocked(useCardLoadingState)
const mockCachedPods = vi.mocked(useCachedPods)

const baseLoadingState = {
  showSkeleton: false,
  showEmptyState: false,
  hasData: true,
  isRefreshing: false,
  loadingTimedOut: false,
}

const basePods = {
  pods: [],
  isLoading: false,
  isRefreshing: false,
  isDemoFallback: false,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
}

describe('DNSHealth', () => {
  beforeEach(() => {
    mockLoadingState.mockReturnValue(baseLoadingState)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCachedPods.mockReturnValue(basePods as any)
  })

  it('renders skeleton while loading', () => {
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showSkeleton: true, hasData: false })
    const { container } = render(<DNSHealth />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders empty state when no DNS pods found', () => {
    render(<DNSHealth />)
    expect(screen.getByText('dnsHealth.noDnsPods')).toBeInTheDocument()
  })

  it('renders error state on consecutive failures', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCachedPods.mockReturnValue({ ...basePods, isFailed: true, consecutiveFailures: 3 } as any)
    const { container } = render(<DNSHealth />)
    // Component should render even in error state
    expect(container.firstChild).toBeTruthy()
  })

  it('renders happy-path with CoreDNS pods', () => {
    const pods = [
      {
        name: 'coredns-74d6c4d8b9-abc12',
        namespace: 'kube-system',
        status: 'Running',
        cluster: 'prod',
        labels: {},
        restarts: 0,
        containers: [{ name: 'coredns', image: 'registry.k8s.io/coredns/coredns:v1.10.1' }],
      },
      {
        name: 'coredns-74d6c4d8b9-def34',
        namespace: 'kube-system',
        status: 'Running',
        cluster: 'prod',
        labels: {},
        restarts: 0,
        containers: [{ name: 'coredns', image: 'registry.k8s.io/coredns/coredns:v1.10.1' }],
      },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCachedPods.mockReturnValue({ ...basePods, pods } as any)
    render(<DNSHealth />)
    expect(screen.getByText('prod')).toBeInTheDocument()
    expect(screen.getByText('dnsHealth.readyCount')).toBeInTheDocument()
  })

  it('matches snapshot with DNS pods', () => {
    const pods = [
      {
        name: 'coredns-74d6c4d8b9-abc12',
        namespace: 'kube-system',
        status: 'Running',
        cluster: 'prod',
        labels: {},
        restarts: 0,
        containers: [{ name: 'coredns', image: 'registry.k8s.io/coredns/coredns:v1.10.1' }],
      },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCachedPods.mockReturnValue({ ...basePods, pods } as any)
    const { container } = render(<DNSHealth />)
    expect(container).toMatchSnapshot()
  })
})
