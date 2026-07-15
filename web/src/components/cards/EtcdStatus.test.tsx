import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EtcdStatus } from './EtcdStatus'

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../hooks/useCachedData', () => ({
  useCachedPods: vi.fn(),
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

describe('EtcdStatus', () => {
  beforeEach(() => {
    mockLoadingState.mockReturnValue(baseLoadingState)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCachedPods.mockReturnValue(basePods as any)
  })

  it('renders skeleton while loading', () => {
    mockLoadingState.mockReturnValue({ ...baseLoadingState, showSkeleton: true, hasData: false })
    const { container } = render(<EtcdStatus />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders empty state when no etcd pods found and no pods at all', () => {
    render(<EtcdStatus />)
    expect(screen.getByText('etcdStatus.managedByProvider')).toBeInTheDocument()
  })

  it('renders "not detected" state when pods exist but no etcd', () => {
    const pods = [
      { name: 'some-other-pod', namespace: 'kube-system', status: 'Running', cluster: 'prod', labels: {}, restarts: 0 },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCachedPods.mockReturnValue({ ...basePods, pods } as any)
    render(<EtcdStatus />)
    expect(screen.getByText('etcdStatus.notDetected')).toBeInTheDocument()
  })

  it('renders happy-path with etcd pods', () => {
    const pods = [
      {
        name: 'etcd-node1',
        namespace: 'kube-system',
        status: 'Running',
        cluster: 'prod',
        labels: { component: 'etcd' },
        restarts: 0,
        containers: [{ name: 'etcd', image: 'registry.k8s.io/etcd:3.5.6-0' }],
      },
      {
        name: 'etcd-node2',
        namespace: 'kube-system',
        status: 'Running',
        cluster: 'prod',
        labels: { component: 'etcd' },
        restarts: 0,
        containers: [{ name: 'etcd', image: 'registry.k8s.io/etcd:3.5.6-0' }],
      },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCachedPods.mockReturnValue({ ...basePods, pods } as any)
    render(<EtcdStatus />)
    expect(screen.getByText('prod')).toBeInTheDocument()
  })

  it('renders without crashing', () => {
    const pods = [
      {
        name: 'etcd-node1',
        namespace: 'kube-system',
        status: 'Running',
        cluster: 'prod',
        labels: { component: 'etcd' },
        restarts: 0,
        containers: [{ name: 'etcd', image: 'registry.k8s.io/etcd:3.5.6-0' }],
      },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCachedPods.mockReturnValue({ ...basePods, pods } as any)
    const { container } = render(<EtcdStatus />)
    expect(container.firstChild).toBeTruthy()
  })
})
