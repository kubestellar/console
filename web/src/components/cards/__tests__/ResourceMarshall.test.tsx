import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ResourceMarshall } from '../ResourceMarshall'

const mockUseCachedNamespaces = vi.fn()
const mockUseClusters = vi.fn()
const mockUseWorkloads = vi.fn()
const mockUseResolveDependencies = vi.fn()
const mockUseCardLoadingState = vi.fn()

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedNamespaces: (...args: unknown[]) => mockUseCachedNamespaces(...args),
}))

vi.mock('../../../hooks/useWorkloads', () => ({
  useWorkloads: (...args: unknown[]) => mockUseWorkloads(...args),
}))

vi.mock('../../../hooks/useDependencies', () => ({
  useResolveDependencies: () => mockUseResolveDependencies(),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}))

vi.mock('../../ui/ClusterSelect', () => ({
  ClusterSelect: ({ clusters, onChange, placeholder }: { clusters: Array<{ name: string }>; value: string; onChange: (value: string) => void; placeholder?: string }) => (
    <div aria-label="cluster-select">
      <button type="button" onClick={() => onChange('')}>
        {placeholder || 'Select cluster...'}
      </button>
      {clusters.map(cluster => (
        <button key={cluster.name} type="button" onClick={() => onChange(cluster.name)}>
          {cluster.name}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback || _key }),
}))

describe('ResourceMarshall', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [{ name: 'prod-cluster', context: 'prod-context', reachable: true }],
      isLoading: false,
      isRefreshing: false,
      isFailed: false,
      consecutiveFailures: 0,
    })
    mockUseCachedNamespaces.mockReturnValue({
      namespaces: [],
      isLoading: false,
      isDemoFallback: false,
      isFailed: false,
      error: null,
    })
    mockUseWorkloads.mockReturnValue({ data: [], isLoading: false })
    mockUseResolveDependencies.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      resolve: vi.fn(),
      reset: vi.fn(),
    })
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
    })
  })

  it('passes the selected cluster context to useCachedNamespaces', async () => {
    render(<ResourceMarshall />)

    expect(mockUseCachedNamespaces).toHaveBeenLastCalledWith(undefined)

    fireEvent.click(screen.getByRole('button', { name: 'prod-cluster' }))

    await waitFor(() => {
      expect(mockUseCachedNamespaces).toHaveBeenLastCalledWith('prod-context')
    })
  })
})
