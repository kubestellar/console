import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EtcdStatus } from '../EtcdStatus'

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeEtcdPod = (overrides = {}) => ({
  name: 'etcd-node1',
  namespace: 'kube-system',
  cluster: 'cluster-1',
  status: 'Running',
  labels: { component: 'etcd' },
  restarts: 0,
  containers: [{ name: 'etcd', image: 'registry.k8s.io/etcd:3.5.6-0' }],
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

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(() => ({ showSkeleton: false })),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`
      return key
    },
  }),
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('EtcdStatus', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useCardLoadingState } = await import('../CardDataContext')
    vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false } as never)
  })

  describe('Skeleton', () => {
    it('renders pulse skeletons when showSkeleton is true', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: true } as never)
      render(<EtcdStatus />)
      const pulses = document.querySelectorAll('.animate-pulse')
      expect(pulses.length).toBeGreaterThan(0)
    })
  })

  describe('No pods state', () => {
    it('shows managed-by-provider UI when no pods at all', async () => {
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false } as never)
      render(<EtcdStatus />)
      expect(screen.getByText('etcdStatus.managedByProvider')).toBeTruthy()
    })

    it('shows not-detected UI when pods exist but no etcd', async () => {
      const { useCachedPods } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedPods).mockReturnValue({
        pods: [{ name: 'coredns-abc', namespace: 'kube-system', cluster: 'c1', status: 'Running', labels: {}, containers: [] }],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
      } as never)
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false } as never)
      render(<EtcdStatus />)
      expect(screen.getByText('etcdStatus.notDetected')).toBeTruthy()
    })
  })

  describe('Members summary', () => {
    it('renders member summary text with count and clusters', async () => {
      const { useCachedPods } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedPods).mockReturnValue({
        pods: [makeEtcdPod()],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
      } as never)
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false } as never)
      render(<EtcdStatus />)
      expect(screen.getByText(/etcdStatus.membersSummary/)).toBeTruthy()
    })
  })

  describe('Cluster rows', () => {
    it('renders a row per cluster with ready/total count', async () => {
      const { useCachedPods } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedPods).mockReturnValue({
        pods: [makeEtcdPod(), makeEtcdPod({ name: 'etcd-node2' })],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
      } as never)
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false } as never)
      render(<EtcdStatus />)
      expect(screen.getByText('cluster-1')).toBeTruthy()
      expect(screen.getByText(/etcdStatus.membersCount/)).toBeTruthy()
    })

    it('shows restart badge when restarts > 0', async () => {
      const { useCachedPods } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedPods).mockReturnValue({
        pods: [makeEtcdPod({ restarts: 5 })],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
      } as never)
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false } as never)
      render(<EtcdStatus />)
      expect(screen.getByText(/etcdStatus.restarts/)).toBeTruthy()
    })
  })

  describe('Version parsing', () => {
    it('displays etcd version tag from container image', async () => {
      const { useCachedPods } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedPods).mockReturnValue({
        pods: [makeEtcdPod({ containers: [{ name: 'etcd', image: 'registry.k8s.io/etcd:3.5.9-0' }] })],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
      } as never)
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false } as never)
      render(<EtcdStatus />)
      expect(screen.getByText(/3.5.9-0/)).toBeTruthy()
    })

    it('shows checkmark for Running pods and X for non-running', async () => {
      const { useCachedPods } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedPods).mockReturnValue({
        pods: [
          makeEtcdPod({ status: 'Running' }),
          makeEtcdPod({ name: 'etcd-node2', status: 'CrashLoopBackOff' }),
        ],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
      } as never)
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false } as never)
      render(<EtcdStatus />)
      expect(screen.getByText(/✓/)).toBeTruthy()
      expect(screen.getByText(/✗/)).toBeTruthy()
    })
  })

  describe('Operator/backup exclusion', () => {
    it('excludes operator pods from etcd detection', async () => {
      const { useCachedPods } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedPods).mockReturnValue({
        pods: [{ name: 'etcd-operator-abc', namespace: 'kube-system', cluster: 'c1', status: 'Running', labels: {}, containers: [] }],
        isLoading: false,
        isRefreshing: false,
        isDemoFallback: false,
        isFailed: false,
        consecutiveFailures: 0,
      } as never)
      const { useCardLoadingState } = await import('../CardDataContext')
      vi.mocked(useCardLoadingState).mockReturnValue({ showSkeleton: false } as never)
      render(<EtcdStatus />)
      // operator pod excluded → shows not detected (pods exist but no etcd)
      expect(screen.getByText('etcdStatus.notDetected')).toBeTruthy()
    })
  })
})