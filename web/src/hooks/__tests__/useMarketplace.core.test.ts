import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiDelete = vi.fn()
vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}))

const mockAddCustomTheme = vi.fn()
const mockRemoveCustomTheme = vi.fn()
vi.mock('../../lib/themes', () => ({
  addCustomTheme: (...args: unknown[]) => mockAddCustomTheme(...args),
  removeCustomTheme: (...args: unknown[]) => mockRemoveCustomTheme(...args),
}))

const mockEmitInstall = vi.fn()
const mockEmitRemove = vi.fn()
const mockEmitInstallFailed = vi.fn()
vi.mock('../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/analytics')>()),
  emitMarketplaceInstall: (...args: unknown[]) => mockEmitInstall(...args),
  emitMarketplaceRemove: (...args: unknown[]) => mockEmitRemove(...args),
  emitMarketplaceInstallFailed: (...args: unknown[]) => mockEmitInstallFailed(...args),
}
))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    FETCH_EXTERNAL_TIMEOUT_MS: 15000,
  }
})

const mockIsCardTypeRegistered = vi.fn(() => false)
vi.mock('../../components/cards/cardRegistry', () => ({
  isCardTypeRegistered: (t: string) => mockIsCardTypeRegistered(t),
}))

vi.mock('@/lib/cache', async () => {
  const React = await import('react')
  return {
    useCache: <T>(opts: { fetcher: () => Promise<T>; initialData: T }) => {
      const { fetcher, initialData } = opts
      const [state, setState] = React.useState<{
        data: T; isLoading: boolean; error: string | null
      }>({ data: initialData, isLoading: true, error: null })
      const refetch = React.useCallback(async () => {
        setState(s => ({ ...s, isLoading: true, error: null }))
        try {
          const data = await fetcher()
          setState({ data, isLoading: false, error: null })
        } catch (e) {
          setState(s => ({
            ...s,
            isLoading: false,
            error: e instanceof Error ? e.message : 'Failed to load marketplace',
          }))
        }
      }, []) // eslint-disable-line react-hooks/exhaustive-deps
      React.useEffect(() => { void refetch() }, []) // eslint-disable-line react-hooks/exhaustive-deps
      return {
        data: state.data,
        isLoading: state.isLoading,
        error: state.error,
        refetch,
        isDemoData: false,
        isRefreshing: false,
        isFailed: false,
        consecutiveFailures: 0,
        lastRefresh: null,
      }
    },
    createCachedHook: <T>(config: { fetcher: () => Promise<T>; initialData: T }) => {
      const { fetcher, initialData } = config
      return () => {
        const React2 = require('react') // eslint-disable-line @typescript-eslint/no-require-imports
        const [state, setState] = React2.useState({ data: initialData, isLoading: true, error: null })
        const refetch = React2.useCallback(async () => {
          setState((s: { data: T; isLoading: boolean; error: string | null }) => ({ ...s, isLoading: true }))
          try { const data = await fetcher(); setState({ data, isLoading: false, error: null }) }
          catch (e) { setState((s: { data: T; isLoading: boolean; error: string | null }) => ({ ...s, isLoading: false, error: e instanceof Error ? e.message : 'error' })) }
        }, [])
        React2.useEffect(() => { void refetch() }, [])
        return { data: state.data, isLoading: state.isLoading, error: state.error, refetch, isDemoData: false, isRefreshing: false, isFailed: false, consecutiveFailures: 0, lastRefresh: null }
      }
    },
  }
})

import { useMarketplace, useAuthorProfile } from '../useMarketplace'
import type { MarketplaceItem } from '../useMarketplace'
import { computeSha256 } from '../useMarketplace/integrity'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INSTALLED_KEY = 'kc-marketplace-installed'
const TRUSTED_DOWNLOAD_URL = 'https://raw.githubusercontent.com/kubestellar/console-marketplace/main/test.json'
const UNTRUSTED_DOWNLOAD_URL = 'https://example.com/test.json'
const DEFAULT_SHA256 = 'a'.repeat(64)

function makeItem(overrides: Partial<MarketplaceItem> = {}): MarketplaceItem {
  return {
    id: 'test-item',
    name: 'Test Item',
    description: 'A test item for the marketplace',
    author: 'tester',
    version: '1.0.0',
    downloadUrl: TRUSTED_DOWNLOAD_URL,
    sha256: DEFAULT_SHA256,
    tags: ['monitoring'],
    cardCount: 2,
    type: 'dashboard',
    ...overrides,
  }
}

function makeRegistry(items: MarketplaceItem[], presets?: MarketplaceItem[]) {
  return {
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
    items,
    presets,
  }
}

function seedCache(items: MarketplaceItem[], presets?: MarketplaceItem[]) {
  vi.mocked(globalThis.fetch).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(makeRegistry(items, presets)),
  } as Response)
}

function seedInstalledItems(map: Record<string, unknown>) {
  localStorage.setItem(INSTALLED_KEY, JSON.stringify(map))
  // Trigger the cross-tab sync listener so the module-level
  // installedSnapshot is refreshed from localStorage (#7574).
  window.dispatchEvent(new StorageEvent('storage', { key: INSTALLED_KEY }))
  // Mock the dashboards API so reconciliation doesn't remove seeded entries (#7574).
  const dashboardIds = Object.values(map)
    .filter((e: Record<string, unknown>) => e.dashboardId)
    .map((e: Record<string, unknown>) => ({ id: e.dashboardId }))
  if (dashboardIds.length > 0) {
    mockApiGet.mockResolvedValue({ data: dashboardIds })
  }
}

// ---------------------------------------------------------------------------
// Tests — useMarketplace
// ---------------------------------------------------------------------------

describe('useMarketplace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    // Default: api.get resolves with empty data so reconciliation doesn't throw (#7574)
    mockApiGet.mockResolvedValue({ data: [] })
    // Default: fetch rejects so tests that don't need network don't hang
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not available'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ──────────────────────── Basic shape ────────────────────────

  it('returns the expected hook shape', () => {
    const { result } = renderHook(() => useMarketplace())
    expect(result.current).toHaveProperty('items')
    expect(result.current).toHaveProperty('allItems')
    expect(result.current).toHaveProperty('allTags')
    expect(result.current).toHaveProperty('typeCounts')
    expect(result.current).toHaveProperty('cncfStats')
    expect(result.current).toHaveProperty('cncfCategories')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('error')
    expect(result.current).toHaveProperty('searchQuery')
    expect(result.current).toHaveProperty('selectedTag')
    expect(result.current).toHaveProperty('selectedType')
    expect(result.current).toHaveProperty('showHelpWanted')
    expect(result.current).toHaveProperty('installItem')
    expect(result.current).toHaveProperty('removeItem')
    expect(result.current).toHaveProperty('isInstalled')
    expect(result.current).toHaveProperty('getInstalledDashboardId')
    expect(result.current).toHaveProperty('refresh')
  })

  // ──────────────────────── Cache behaviour ────────────────────────

  it('loads items via fetch on mount', async () => {
    const items = [makeItem({ id: 'cached-1', name: 'Cached Dashboard' })]
    seedCache(items)

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.allItems.length).toBe(1)
    expect(result.current.allItems[0].name).toBe('Cached Dashboard')
    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it('fetches fresh data from network on mount', async () => {
    const freshItems = [makeItem({ id: 'fresh-1', name: 'Fresh' })]
    seedCache(freshItems)

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.allItems[0].id).toBe('fresh-1')
  })

  it('recovers and loads items after a failed initial fetch', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('transient'))
    const items = [makeItem({ id: 'recovered' })]
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeRegistry(items)),
    } as Response)

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.error).toBe('transient')

    act(() => { result.current.refresh() })
    await waitFor(() => {
      expect(result.current.allItems.length).toBe(1)
    })
    expect(result.current.allItems[0].id).toBe('recovered')
  })


  // ──────────────────────── Network fetch ────────────────────────

  it('fetches registry from network on first load', async () => {
    const items = [makeItem({ id: 'net-1' })]
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeRegistry(items)),
    } as Response)

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.allItems.length).toBe(1)
    expect(result.current.allItems[0].id).toBe('net-1')
  })

  it('sets error on HTTP failure', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.error).toContain('500')
    expect(result.current.allItems).toEqual([])
  })

  it('sets error on network failure', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network down'))

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.error).toBe('Network down')
    expect(result.current.allItems).toEqual([])
  })

  it('sets generic error for non-Error throws', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce('string error')

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.error).toBe('Failed to load marketplace')
  })


  // ──────────────────────── Refresh (skipCache) ────────────────────────

  it('refresh() re-fetches and updates items', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeRegistry([makeItem({ id: 'old' })])),
    } as Response)

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.allItems[0].id).toBe('old')

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeRegistry([makeItem({ id: 'refreshed' })])),
    } as Response)

    act(() => { result.current.refresh() })

    await waitFor(() => {
      expect(result.current.allItems[0].id).toBe('refreshed')
    })
  })

  // ──────────────────────── Merge items + presets ────────────────────────

  it('merges items and presets from registry', async () => {
    const items = [makeItem({ id: 'item-1', type: 'dashboard' })]
    const presets = [makeItem({ id: 'preset-1', type: 'card-preset' })]
    seedCache(items, presets)

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.allItems.length).toBe(2)
    const ids = result.current.allItems.map(i => i.id)
    expect(ids).toContain('item-1')
    expect(ids).toContain('preset-1')
  })

  // ──────────────────────── reconcileImplementedCards ────────────────────────

  it('promotes help-wanted item to available when card type is registered', async () => {
    const items = [
      makeItem({
        id: 'cncf-karmada',
        status: 'help-wanted',
        tags: ['cncf', 'help-wanted'],
      }),
    ]
    mockIsCardTypeRegistered.mockImplementation((t: string) => t === 'karmada_status')
    seedCache(items)

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.allItems[0].status).toBe('available')
    expect(result.current.allItems[0].tags).not.toContain('help-wanted')
  })

  it('maps cncf-flux to flux_status during reconcile', async () => {
    const items = [
      makeItem({
        id: 'cncf-flux',
        status: 'help-wanted',
        tags: ['cncf', 'help-wanted'],
      }),
    ]
    mockIsCardTypeRegistered.mockImplementation((t: string) => t === 'flux_status')
    seedCache(items)

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.allItems[0].status).toBe('available')
    expect(result.current.allItems[0].tags).not.toContain('help-wanted')
  })

  it('does not promote help-wanted item when card type is NOT registered', async () => {
    const items = [
      makeItem({
        id: 'cncf-karmada',
        status: 'help-wanted',
        tags: ['cncf', 'help-wanted'],
      }),
    ]
    mockIsCardTypeRegistered.mockReturnValue(false)
    seedCache(items)

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.allItems[0].status).toBe('help-wanted')
    expect(result.current.allItems[0].tags).toContain('help-wanted')
  })

  it('leaves already-available items unchanged during reconcile', async () => {
    const items = [
      makeItem({
        id: 'cncf-karmada',
        status: 'available',
        tags: ['cncf'],
      }),
    ]
    seedCache(items)

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.allItems[0].status).toBe('available')
    // Should NOT have called isCardTypeRegistered for already-available items
    expect(mockIsCardTypeRegistered).not.toHaveBeenCalled()
  })

  it('does not reconcile help-wanted items that have no MARKETPLACE_TO_CARD_TYPE mapping', async () => {
    const items = [
      makeItem({
        id: 'unknown-card-id',
        status: 'help-wanted',
        tags: ['help-wanted'],
      }),
    ]
    seedCache(items)

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.allItems[0].status).toBe('help-wanted')
  })
})
