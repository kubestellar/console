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

  // ──────────────────────── Filtering ────────────────────────

  it('filters items by search query (name)', async () => {
    seedCache([
      makeItem({ id: 'a', name: 'Monitoring Dashboard' }),
      makeItem({ id: 'b', name: 'Security Scanner' }),
    ])

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => { result.current.setSearchQuery('monitor') })
    expect(result.current.items.length).toBe(1)
    expect(result.current.items[0].id).toBe('a')
  })

  it('filters items by search query (description)', async () => {
    seedCache([
      makeItem({ id: 'a', name: 'Thing', description: 'Monitors cluster health' }),
      makeItem({ id: 'b', name: 'Other', description: 'Deploys applications' }),
    ])

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => { result.current.setSearchQuery('deploy') })
    expect(result.current.items.length).toBe(1)
    expect(result.current.items[0].id).toBe('b')
  })

  it('filters items by tag', async () => {
    seedCache([
      makeItem({ id: 'a', tags: ['monitoring', 'cncf'] }),
      makeItem({ id: 'b', tags: ['security'] }),
    ])

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => { result.current.setSelectedTag('security') })
    expect(result.current.items.length).toBe(1)
    expect(result.current.items[0].id).toBe('b')
  })

  it('filters items by type', async () => {
    seedCache([
      makeItem({ id: 'a', type: 'dashboard' }),
      makeItem({ id: 'b', type: 'theme' }),
      makeItem({ id: 'c', type: 'card-preset' }),
    ])

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => { result.current.setSelectedType('theme') })
    expect(result.current.items.length).toBe(1)
    expect(result.current.items[0].id).toBe('b')
  })

  it('filters items by help-wanted status', async () => {
    seedCache([
      makeItem({ id: 'a', status: 'help-wanted' }),
      makeItem({ id: 'b', status: 'available' }),
      makeItem({ id: 'c' }), // no status — defaults to available
    ])

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => { result.current.setShowHelpWanted(true) })
    expect(result.current.items.length).toBe(1)
    expect(result.current.items[0].id).toBe('a')
  })

  it('combines multiple filters', async () => {
    seedCache([
      makeItem({ id: 'match', name: 'Monitoring', type: 'dashboard', tags: ['monitoring'] }),
      makeItem({ id: 'wrong-type', name: 'Monitoring', type: 'theme', tags: ['monitoring'] }),
      makeItem({ id: 'wrong-name', name: 'Security', type: 'dashboard', tags: ['monitoring'] }),
    ])

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.setSearchQuery('monitoring')
      result.current.setSelectedType('dashboard')
      result.current.setSelectedTag('monitoring')
    })
    expect(result.current.items.length).toBe(1)
    expect(result.current.items[0].id).toBe('match')
  })

  // ──────────────────────── Tags / typeCounts / CNCF stats ────────────────────────

  it('computes allTags as sorted unique set', async () => {
    seedCache([
      makeItem({ id: 'a', tags: ['monitoring', 'cncf'] }),
      makeItem({ id: 'b', tags: ['cncf', 'security'] }),
    ])

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.allTags).toEqual(['cncf', 'monitoring', 'security'])
  })

  it('computes typeCounts correctly', async () => {
    seedCache([
      makeItem({ id: 'a', type: 'dashboard' }),
      makeItem({ id: 'b', type: 'dashboard' }),
      makeItem({ id: 'c', type: 'theme' }),
    ])

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.typeCounts).toEqual({
      all: 3,
      dashboard: 2,
      'card-preset': 0,
      theme: 1,
    })
  })

  it('computes CNCF stats', async () => {
    seedCache([
      makeItem({
        id: 'a',
        status: 'available',
        cncfProject: { maturity: 'graduated', category: 'Orchestration' },
      }),
      makeItem({
        id: 'b',
        status: 'help-wanted',
        cncfProject: { maturity: 'incubating', category: 'Observability' },
      }),
      makeItem({ id: 'c' }), // not a CNCF project
    ])

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.cncfStats).toEqual({
      total: 2,
      completed: 1,
      helpWanted: 1,
      graduatedTotal: 1,
      incubatingTotal: 1,
    })
    expect(result.current.cncfCategories).toEqual(['Observability', 'Orchestration'])
  })

})
