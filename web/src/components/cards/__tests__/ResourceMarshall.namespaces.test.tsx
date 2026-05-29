import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ResourceMarshall } from '../ResourceMarshall'

const mockUseCachedNamespaces = vi.fn()
const mockUseClusters = vi.fn()
const mockUseWorkloads = vi.fn()
const mockUseResolveDependencies = vi.fn()
const mockUseCardLoadingState = vi.fn()
let mockIsDemoMode = false

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
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode }),
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

type MockCluster = {
  name: string
  context: string
  reachable: boolean
}

const LIVE_CLUSTER: MockCluster = {
  name: 'prod-cluster',
  context: 'prod-context',
  reachable: true,
}

function getNamespaceSelect() {
  return screen.getAllByRole('combobox')[0] as HTMLSelectElement
}

describe('ResourceMarshall namespace dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoMode = false
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [LIVE_CLUSTER],
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

  it('shows only live namespaces when demo mode is off', async () => {
    mockUseCachedNamespaces.mockReturnValue({
      namespaces: ['team-a', 'team-b'],
      isLoading: false,
      isDemoFallback: false,
      isFailed: false,
      error: null,
    })

    render(<ResourceMarshall />)

    fireEvent.click(screen.getByRole('button', { name: LIVE_CLUSTER.name }))

    await waitFor(() => {
      expect(mockUseCachedNamespaces).toHaveBeenLastCalledWith(LIVE_CLUSTER.context)
    })

    const optionValues = Array.from(getNamespaceSelect().options).map(option => option.value)
    expect(optionValues).toEqual(['', 'team-a', 'team-b'])
    expect(screen.queryByRole('option', { name: 'production' })).not.toBeInTheDocument()
  })

  it('prefers the production namespace in demo mode', async () => {
    mockIsDemoMode = true
    mockUseCachedNamespaces.mockReturnValue({
      namespaces: ['team-a', 'production', 'team-b'],
      isLoading: false,
      isDemoFallback: false,
      isFailed: false,
      error: null,
    })

    render(<ResourceMarshall />)

    await waitFor(() => {
      expect(getNamespaceSelect().value).toBe('production')
    })
  })

  it.each([
    { demoMode: false, isDemoFallback: false, expected: false },
    { demoMode: true, isDemoFallback: false, expected: true },
    { demoMode: false, isDemoFallback: true, expected: true },
  ])('sets isDemoData to $expected when demoMode=$demoMode and isDemoFallback=$isDemoFallback', ({ demoMode, isDemoFallback, expected }) => {
    mockIsDemoMode = demoMode
    mockUseCachedNamespaces.mockReturnValue({
      namespaces: ['team-a'],
      isLoading: false,
      isDemoFallback,
      isFailed: false,
      error: null,
    })

    render(<ResourceMarshall />)

    expect(mockUseCardLoadingState).toHaveBeenLastCalledWith(expect.objectContaining({
      isDemoData: expected,
    }))
  })

  it('renders only the placeholder option when no live namespaces are available', async () => {
    mockUseCachedNamespaces.mockReturnValue({
      namespaces: [],
      isLoading: false,
      isDemoFallback: false,
      isFailed: false,
      error: null,
    })

    render(<ResourceMarshall />)

    fireEvent.click(screen.getByRole('button', { name: LIVE_CLUSTER.name }))

    await waitFor(() => {
      expect(mockUseCachedNamespaces).toHaveBeenLastCalledWith(LIVE_CLUSTER.context)
    })

    const namespaceSelect = getNamespaceSelect()
    const optionLabels = Array.from(namespaceSelect.options).map(option => option.text)
    expect(optionLabels).toEqual(['Select namespace...'])
    expect(namespaceSelect.value).toBe('')
  })
})
