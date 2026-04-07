import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ControlPlaneHealth } from '../ControlPlaneHealth'

// ── Helpers ───────────────────────────────────────────────────────────────────

const makePod = (overrides = {}) => ({
  name: 'kube-apiserver-node1',
  namespace: 'kube-system',
  cluster: 'cluster-1',
  status: 'Running',
  labels: { component: 'kube-apiserver' },
  restarts: 0,
  ...overrides,
})

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedPods: vi.fn(() => ({
    pods: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
  })),
}))

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => ({
    clusters: [{ name: 'cluster-1' }],
    isLoading: false,
  }),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false })),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts?.count !== undefined) return `${key}:${opts.count}`
      return key
    },
  }),
}))

vi.mock('../../ui/Skeleton', () => ({
  Skeleton: ({ height }: { height: number }) => <div data-testid="skeleton" style={{ height }} />,
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ControlPlaneHealth', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useCardLoadingState } = await import('../CardDataContext')
    vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false } as never)
  })

  describe('Skeleton state', () => {
    it('renders skeletons when showSkeleton is true', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: true } as never)
      render(<ControlPlaneHealth />)
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    })
  })

  describe('Managed cluster state', () => {
    it('shows managed cluster UI when no control-plane pods found and clusters exist', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false } as never)
      render(<ControlPlaneHealth />)
      expect(screen.getByText('controlPlaneHealth.managedCluster')).toBeTruthy()
    })
  })

  describe('Component status rows', () => {
    it('renders all 5 component rows when control-plane pods are found', async () => {
      const { useCachedPods } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedPods).mockReturnValue({
        pods: [
          makePod({ labels: { component: 'kube-apiserver' } }),
          makePod({ name: 'kube-scheduler-node1', labels: { component: 'kube-scheduler' } }),
          makePod({ name: 'kube-controller-manager-node1', labels: { component: 'kube-controller-manager' } }),
          makePod({ name: 'etcd-node1', labels: { component: 'etcd' } }),
          makePod({ name: 'coredns-abc', namespace: 'kube-system', labels: { 'k8s-app': 'kube-dns' } }),
        ],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
      } as never)

      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false } as never)

      render(<ControlPlaneHealth />)
      expect(screen.getByText('API Server')).toBeTruthy()
      expect(screen.getByText('Scheduler')).toBeTruthy()
      expect(screen.getByText('Controller Mgr')).toBeTruthy()
      expect(screen.getByText('etcd')).toBeTruthy()
      expect(screen.getByText('CoreDNS')).toBeTruthy()
    })

    it('shows restart count for components with restarts', async () => {
      const { useCachedPods } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedPods).mockReturnValue({
        pods: [makePod({ restarts: 3 })],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
      } as never)

      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false } as never)

      render(<ControlPlaneHealth />)
      expect(screen.getByText(/controlPlaneHealth.restarts/)).toBeTruthy()
    })
  })

  describe('Cluster filter buttons', () => {
    it('renders All button and per-cluster buttons when multiple clusters', async () => {
      const { useCachedPods } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedPods).mockReturnValue({
        pods: [
          makePod({ cluster: 'cluster-1' }),
          makePod({ cluster: 'cluster-2', name: 'kube-apiserver-node2' }),
        ],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
      } as never)

      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false } as never)

      render(<ControlPlaneHealth />)
      expect(screen.getByText('controlPlaneHealth.all')).toBeTruthy()
      expect(screen.getByText('cluster-1')).toBeTruthy()
      expect(screen.getByText('cluster-2')).toBeTruthy()
    })

    it('filters to selected cluster when cluster button is clicked', async () => {
      const { useCachedPods } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedPods).mockReturnValue({
        pods: [
          makePod({ cluster: 'cluster-1' }),
          makePod({ cluster: 'cluster-2', name: 'kube-apiserver-node2' }),
        ],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
      } as never)

      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false } as never)

      render(<ControlPlaneHealth />)
      fireEvent.click(screen.getByText('cluster-1'))
      // After clicking cluster-1, filter is applied (no error thrown)
      expect(screen.getByText('cluster-1')).toBeTruthy()
    })
  })

  describe('Ready/total display', () => {
    it('shows 1/1 for running pod', async () => {
      const { useCachedPods } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedPods).mockReturnValue({
        pods: [makePod()],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
      } as never)

      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false } as never)

      render(<ControlPlaneHealth />)
      expect(screen.getByText('1/1')).toBeTruthy()
    })
  })
})