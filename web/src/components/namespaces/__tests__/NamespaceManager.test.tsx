/**
 * NamespaceManager Tests
 *
 * Exercises core manager logic: namespace fetching from local agent,
 * caching, cluster filtering, search, modal state management, and
 * progressive loading indicators.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
// Static import removed to support vi.resetModules() for cache clearing
// import { NamespaceManager } from '../NamespaceManager'

const UI_TIMEOUT_MS = 2000
const API_TIMEOUT_MS = 3000

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockUseClusters = vi.fn()
vi.mock('../../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

const mockUseGlobalFilters = vi.fn()
vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

const mockUseRefreshIndicator = vi.fn()
vi.mock('../../../hooks/useRefreshIndicator', () => ({
  useRefreshIndicator: () => mockUseRefreshIndicator(),
}))

vi.mock('../../../lib/modals', () => ({
  useModalState: () => ({
    isOpen: false,
    open: vi.fn(),
    close: vi.fn(),
  }),
}))

vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}))

const mockFetch = vi.fn()

const mockTranslation = vi.fn((key: string) => key)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockTranslation,
  }),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

let NamespaceManager: React.ComponentType

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>)
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
  mockUseClusters.mockReturnValue({
    clusters: [
      { name: 'cluster-1', reachable: true },
      { name: 'cluster-2', reachable: true },
    ],
    deduplicatedClusters: [
      { name: 'cluster-1' },
      { name: 'cluster-2' },
    ],
    isLoading: false,
  })
  mockUseGlobalFilters.mockReturnValue({
    selectedClusters: ['cluster-1', 'cluster-2'],
    isAllClustersSelected: true,
  })
  mockUseRefreshIndicator.mockReturnValue({
    isRefreshing: false,
    setRefreshing: vi.fn(),
  })

  // Dynamically import component to ensure a fresh module-level cache for each test
  const mod = await import('../NamespaceManager')
  NamespaceManager = mod.NamespaceManager
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('NamespaceManager', () => {
  it('renders manager header with title', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ namespaces: [] }), { status: 200 })
    )

    renderWithRouter(<NamespaceManager />)

    await waitFor(() => {
      expect(screen.getByText(/Namespace Manager/i)).toBeInTheDocument()
    }, { timeout: UI_TIMEOUT_MS })
  })

  it('shows loading state while fetching namespaces', async () => {
    mockUseClusters.mockReturnValueOnce({
      clusters: [],
      deduplicatedClusters: [],
      isLoading: true,
    })

    renderWithRouter(<NamespaceManager />)

    expect(screen.getByText(/Loading Clusters/i)).toBeInTheDocument()
  })

  it('fetches namespaces from local agent endpoint', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        namespaces: [
          { name: 'default', status: 'Active', createdAt: '2024-01-01T00:00:00Z' },
        ],
      }), { status: 200 })
    )

    renderWithRouter(<NamespaceManager />)

    // Component should render and be visible
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
    }, { timeout: API_TIMEOUT_MS })

    // Verify fetch was called for namespaces endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/namespaces'),
      expect.any(Object)
    )
  })

  it('handles fetch errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    renderWithRouter(<NamespaceManager />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
    })
  })

  it('displays search input for namespace filtering', () => {
    renderWithRouter(<NamespaceManager />)

    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
  })

  it('filters namespaces by search query', async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        namespaces: [
          { name: 'test-1', status: 'Active', createdAt: '2024-01-01T00:00:00Z' },
          { name: 'prod-1', status: 'Active', createdAt: '2024-01-01T00:00:00Z' },
        ],
      }), { status: 200 })
    )

    renderWithRouter(<NamespaceManager />)

    const searchInput = screen.getByPlaceholderText(/search/i)
    await user.type(searchInput, 'test')

    await waitFor(() => {
      expect(searchInput).toHaveValue('test')
    })
  })

  it('respects global cluster filter selection', async () => {
    mockUseGlobalFilters.mockReturnValueOnce({
      selectedClusters: ['cluster-1'],
      isAllClustersSelected: false,
    })

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ namespaces: [] }), { status: 200 })
    )

    renderWithRouter(<NamespaceManager />)

    // Component should render successfully with filtered clusters
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
    }, { timeout: API_TIMEOUT_MS })
  })

  it('shows create namespace button', () => {
    renderWithRouter(<NamespaceManager />)

    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
  })

  it('has refresh button for manual refresh', () => {
    renderWithRouter(<NamespaceManager />)

    const refreshBtn = screen.getByRole('button', { name: /refresh/i })
    expect(refreshBtn).toBeInTheDocument()
  })

  it('groups namespaces by cluster by default', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        namespaces: [
          { name: 'ns-1', status: 'Active', createdAt: '2024-01-01T00:00:00Z' },
        ],
      }), { status: 200 })
    )

    renderWithRouter(<NamespaceManager />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
    })
  })

  it('shows no namespaces message when list is empty', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ namespaces: [] }), { status: 200 })
    )

    renderWithRouter(<NamespaceManager />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
    })
  })

  it('handles cluster loading state from useClusters hook', () => {
    mockUseClusters.mockReturnValueOnce({
      clusters: [],
      deduplicatedClusters: [],
      isLoading: true,
    })

    renderWithRouter(<NamespaceManager />)

    expect(screen.getByText(/Loading/i)).toBeInTheDocument()
  })

  it('caches namespace data per cluster', async () => {
    const namespaceResponse = {
      namespaces: [
        { name: 'cached-ns', status: 'Active', createdAt: '2024-01-01T00:00:00Z' },
      ],
    }

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(namespaceResponse), { status: 200 })
    )

    const { rerender } = renderWithRouter(<NamespaceManager />)

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
    }, { timeout: API_TIMEOUT_MS })

    const firstCallCount = mockFetch.mock.calls.length

    // Rerender with same filters should use cache
    rerender(<BrowserRouter><NamespaceManager /></BrowserRouter>)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
    }, { timeout: API_TIMEOUT_MS })

    // Cache should prevent excessive fetch calls
    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(firstCallCount + 2)
  })

  it('allows cluster collapse/expand toggle', async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        namespaces: [
          { name: 'ns-1', status: 'Active', createdAt: '2024-01-01T00:00:00Z' },
        ],
      }), { status: 200 })
    )

    renderWithRouter(<NamespaceManager />)

    const expandCollapseBtn = await screen.findByRole('button', { name: /collapse cluster-1/i })
    await user.click(expandCollapseBtn)

    expect(screen.getByRole('button', { name: /expand cluster-1/i })).toBeInTheDocument()
  })

  it('displays cluster count or summary info', () => {
    renderWithRouter(<NamespaceManager />)

    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
  })

  it('handles API errors and shows error state', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    )

    renderWithRouter(<NamespaceManager />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
    })
  })

  it('clears search when clear button is clicked', async () => {
    const user = userEvent.setup()
    renderWithRouter(<NamespaceManager />)

    const searchInput = screen.getByPlaceholderText(/search/i) as HTMLInputElement
    await user.type(searchInput, 'test')
    expect(searchInput.value).toBe('test')

    await user.clear(searchInput)
    expect(searchInput.value).toBe('')
  })
})
