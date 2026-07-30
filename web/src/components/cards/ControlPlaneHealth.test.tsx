import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ControlPlaneHealth } from './ControlPlaneHealth'

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../hooks/useCachedData', () => ({
  useCachedPods: vi.fn(),
}))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: vi.fn(),
}))

import { useCardLoadingState } from './CardDataContext'
import { useCachedPods } from '../../hooks/useCachedData'
import { useClusters } from '../../hooks/useMCP'

const mockLoadingState = vi.mocked(useCardLoadingState)
const mockCachedPods = vi.mocked(useCachedPods)
const mockClusters = vi.mocked(useClusters)

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

const baseClusters = {
  deduplicatedClusters: [],
  clusters: [],
  isLoading: false,
  isRefreshing: false,
  isFailed: false,
  consecutiveFailures: 0,
  lastRefresh: null,
}

describe('ControlPlaneHealth', () => {
  beforeEach(() => {
    mockLoadingState.mockReturnValue(baseLoadingState)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCachedPods.mockReturnValue(basePods as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue(baseClusters as any)
  })

  it('renders skeleton while loading', () => {
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showSkeleton: true, hasData: false })
    const { container } = render(<ControlPlaneHealth />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders managed-cluster empty state when no control-plane pods found', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue({ ...baseClusters, deduplicatedClusters: [{ name: 'prod', reachable: true }] } as any)
    render(<ControlPlaneHealth />)
    expect(screen.getByText('controlPlaneHealth.managedCluster')).toBeInTheDocument()
  })

  it('renders error state on consecutive failures', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCachedPods.mockReturnValue({ ...basePods, isFailed: true, consecutiveFailures: 3 } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClusters.mockReturnValue({ ...baseClusters, deduplicatedClusters: [{ name: 'prod', reachable: true }] } as any)
    const { container } = render(<ControlPlaneHealth />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders happy-path with control-plane pods', () => {
    const pods = [
      { name: 'kube-apiserver-node1', namespace: 'kube-system', status: 'Running', cluster: 'prod', labels: { component: 'kube-apiserver' }, restarts: 0 },
      { name: 'kube-scheduler-node1', namespace: 'kube-system', status: 'Running', cluster: 'prod', labels: { component: 'kube-scheduler' }, restarts: 0 },
      { name: 'etcd-node1', namespace: 'kube-system', status: 'Running', cluster: 'prod', labels: { component: 'etcd' }, restarts: 0 },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCachedPods.mockReturnValue({ ...basePods, pods } as any)
    render(<ControlPlaneHealth />)
    expect(screen.getByText('API Server')).toBeInTheDocument()
    expect(screen.getByText('etcd')).toBeInTheDocument()
  })

  it('matches snapshot', () => {
    const pods = [
      { name: 'kube-apiserver-node1', namespace: 'kube-system', status: 'Running', cluster: 'prod', labels: { component: 'kube-apiserver' }, restarts: 0 },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCachedPods.mockReturnValue({ ...basePods, pods } as any)
    const { container } = render(<ControlPlaneHealth />)
    expect(container).toMatchSnapshot()
  })
})
