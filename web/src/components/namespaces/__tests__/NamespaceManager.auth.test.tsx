import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

const mockUseClusters = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseRefreshIndicator = vi.fn()

vi.mock('../../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

vi.mock('../../../hooks/useRefreshIndicator', () => ({
  useRefreshIndicator: () => mockUseRefreshIndicator(),
}))

vi.mock('../../../lib/modals', () => ({
  useModalState: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}))

vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string }) => {
      if (typeof fallback === 'string') return fallback
      return fallback?.defaultValue || key
    },
  }),
}))

const mockFetch = vi.fn()
let NamespaceManager: React.ComponentType

const renderWithRouter = (component: React.ReactElement) => render(<BrowserRouter>{component}</BrowserRouter>)

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('token', 'jwt-token')
  vi.stubGlobal('fetch', mockFetch)

  mockUseClusters.mockReturnValue({
    clusters: [{ name: 'cluster-1', reachable: true }],
    deduplicatedClusters: [{ name: 'cluster-1' }],
    isLoading: false,
  })
  mockUseGlobalFilters.mockReturnValue({
    selectedClusters: ['cluster-1'],
    isAllClustersSelected: true,
  })
  mockUseRefreshIndicator.mockReturnValue({
    showIndicator: false,
    triggerRefresh: vi.fn(),
  })

  const mod = await import('../NamespaceManager')
  NamespaceManager = mod.NamespaceManager
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NamespaceManager auth and offline handling', () => {
  it('falls back to the backend when the local agent rejects the first namespace request', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        {
          name: 'team-a',
          cluster: 'cluster-1',
          status: 'Active',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]), { status: 200 }))

    renderWithRouter(<NamespaceManager />)

    await waitFor(() => {
      expect(screen.getByText('team-a')).toBeInTheDocument()
    })

    expect(screen.queryByText(/Authorization failed for namespace access/i)).not.toBeInTheDocument()
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(':8585/namespaces?cluster=cluster-1'),
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    )
    const firstCallHeaders = mockFetch.mock.calls[0]?.[1]?.headers
    expect(firstCallHeaders).toBeInstanceOf(Headers)
    expect((firstCallHeaders as Headers).get('Authorization')).toBe('Bearer jwt-token')
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      '/api/namespaces?cluster=cluster-1',
      expect.any(Object)
    )
  })

  it('shows offline clusters without reporting an authorization error', async () => {
    mockUseClusters.mockReturnValue({
      clusters: [{ name: 'cluster-1', reachable: false }],
      deduplicatedClusters: [{ name: 'cluster-1' }],
      isLoading: false,
    })

    renderWithRouter(<NamespaceManager />)

    await waitFor(() => {
      expect(screen.getByText('offline')).toBeInTheDocument()
    })

    expect(mockFetch).not.toHaveBeenCalled()
    expect(screen.queryByText(/Authorization failed for namespace access/i)).not.toBeInTheDocument()
  })
})
