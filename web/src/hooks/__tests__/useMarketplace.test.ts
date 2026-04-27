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
vi.mock('../../lib/analytics', () => ({
  emitMarketplaceInstall: (...args: unknown[]) => mockEmitInstall(...args),
  emitMarketplaceRemove: (...args: unknown[]) => mockEmitRemove(...args),
  emitMarketplaceInstallFailed: (...args: unknown[]) => mockEmitInstallFailed(...args),
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_EXTERNAL_TIMEOUT_MS: 15000,
}))

const mockIsCardTypeRegistered = vi.fn(() => false)
vi.mock('../../components/cards/cardRegistry', () => ({
  isCardTypeRegistered: (t: string) => mockIsCardTypeRegistered(t),
}))

import { useMarketplace, useAuthorProfile } from '../useMarketplace'
import type { MarketplaceItem } from '../useMarketplace'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CACHE_KEY = 'kc-marketplace-registry'
const INSTALLED_KEY = 'kc-marketplace-installed'

function makeItem(overrides: Partial<MarketplaceItem> = {}): MarketplaceItem {
  return {
    id: 'test-item',
    name: 'Test Item',
    description: 'A test item for the marketplace',
    author: 'tester',
    version: '1.0.0',
    downloadUrl: 'https://example.com/test.json',
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
  localStorage.setItem(CACHE_KEY, JSON.stringify({
    data: makeRegistry(items, presets),
    fetchedAt: Date.now(),
  }))
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

  it('loads items from valid localStorage cache without fetching', async () => {
    const items = [makeItem({ id: 'cached-1', name: 'Cached Dashboard' })]
    seedCache(items)

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.allItems.length).toBe(1)
    expect(result.current.allItems[0].name).toBe('Cached Dashboard')
    // fetch should not have been called because cache was valid
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('ignores expired cache and fetches fresh data', async () => {
    // Seed an expired cache entry (2 hours ago)
    const TWO_HOURS_AGO = Date.now() - 2 * 60 * 60 * 1000
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data: makeRegistry([makeItem({ id: 'stale' })]),
      fetchedAt: TWO_HOURS_AGO,
    }))

    const freshItems = [makeItem({ id: 'fresh-1', name: 'Fresh' })]
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeRegistry(freshItems)),
    } as Response)

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.allItems[0].id).toBe('fresh-1')
  })

  it('handles malformed cache JSON gracefully', async () => {
    localStorage.setItem(CACHE_KEY, '<<invalid json>>')

    const items = [makeItem({ id: 'recovered' })]
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeRegistry(items)),
    } as Response)

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
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

  it('caches successful fetch response in localStorage', async () => {
    const items = [makeItem({ id: 'to-cache' })]
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeRegistry(items)),
    } as Response)

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const stored = JSON.parse(localStorage.getItem(CACHE_KEY)!)
    expect(stored.data.items[0].id).toBe('to-cache')
    expect(stored.fetchedAt).toBeDefined()
  })

  // ──────────────────────── Refresh (skipCache) ────────────────────────

  it('refresh() clears cache and re-fetches', async () => {
    // Seed valid cache
    seedCache([makeItem({ id: 'old' })])

    const { result } = renderHook(() => useMarketplace())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.allItems[0].id).toBe('old')

    // Now set up fetch to return new data and call refresh
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeRegistry([makeItem({ id: 'refreshed' })])),
    } as Response)

    act(() => { result.current.refresh() })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.allItems[0].id).toBe('refreshed')
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

  // ──────────────────────── Install / Remove ────────────────────────

  it('installs a dashboard item via API import', async () => {
    seedCache([makeItem({ id: 'dash-1', type: 'dashboard', downloadUrl: 'https://example.com/dash.json' })])
    const dashJson = { layout: [{ type: 'cluster_health' }] }

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(dashJson),
    } as Response)
    mockApiPost.mockResolvedValueOnce({ data: { id: 'imported-dash-id' } })

    const { result } = renderHook(() => useMarketplace())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let installResult: unknown
    await act(async () => {
      installResult = await result.current.installItem(result.current.allItems[0])
    })

    expect(installResult).toEqual({ type: 'dashboard', data: { id: 'imported-dash-id' } })
    expect(mockApiPost).toHaveBeenCalledWith('/api/dashboards/import', dashJson)
    expect(mockEmitInstall).toHaveBeenCalledWith('dashboard', expect.any(String))
    expect(result.current.isInstalled('dash-1')).toBe(true)
    expect(result.current.getInstalledDashboardId('dash-1')).toBe('imported-dash-id')
  })

  it('installs a card-preset item by POSTing to the default dashboard and dispatching the event', async () => {
    seedCache([makeItem({ id: 'preset-1', type: 'card-preset', downloadUrl: 'https://example.com/preset.json' })])
    // Payload matches the backend card shape — card_type (snake_case) is
    // what the Go handler and Dashboard.tsx both use.
    const presetJson = { card_type: 'custom_card', config: { foo: 'bar' }, title: 'Custom Card' }

    const eventSpy = vi.fn()
    window.addEventListener('kc-add-card-from-marketplace', eventSpy)

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(presetJson),
    } as Response)
    // GET /api/dashboards — return a list with a default dashboard.
    // Set as the persistent default so both reconciliation and installItem get the same data.
    mockApiGet.mockResolvedValue({ data: [{ id: 'dash-default', is_default: true }, { id: 'dash-other' }] })
    // POST /api/dashboards/:id/cards — success.
    mockApiPost.mockResolvedValueOnce({ data: { id: 'persisted-card-id' } })

    const { result } = renderHook(() => useMarketplace())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let installResult: unknown
    await act(async () => {
      installResult = await result.current.installItem(result.current.allItems[0])
    })

    // POST was called with the correct dashboard id and a card payload
    // that carries the card_type and config from the downloaded preset.
    expect(mockApiGet).toHaveBeenCalledWith('/api/dashboards')
    expect(mockApiPost).toHaveBeenCalledWith(
      '/api/dashboards/dash-default/cards',
      expect.objectContaining({
        card_type: 'custom_card',
        config: { foo: 'bar' },
        title: 'Custom Card',
        position: expect.objectContaining({ x: 0, y: 0 }),
      })
    )
    expect(installResult).toEqual({ type: 'card-preset', data: presetJson })
    expect(eventSpy).toHaveBeenCalled()
    expect(mockEmitInstall).toHaveBeenCalledWith('card-preset', expect.any(String))
    expect(result.current.isInstalled('preset-1')).toBe(true)

    window.removeEventListener('kc-add-card-from-marketplace', eventSpy)
  })

  it('does not mark card-preset installed when the backend POST fails (#6620)', async () => {
    seedCache([makeItem({ id: 'preset-fail', type: 'card-preset', downloadUrl: 'https://example.com/preset.json' })])
    const presetJson = { card_type: 'custom_card', config: {} }

    const eventSpy = vi.fn()
    window.addEventListener('kc-add-card-from-marketplace', eventSpy)

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(presetJson),
    } as Response)
    // Set as persistent default so both reconciliation and installItem get the same data.
    mockApiGet.mockResolvedValue({ data: [{ id: 'dash-default', is_default: true }] })
    mockApiPost.mockRejectedValueOnce(new Error('backend exploded'))

    const { result } = renderHook(() => useMarketplace())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await expect(
      act(() => result.current.installItem(result.current.allItems[0]))
    ).rejects.toThrow('backend exploded')

    expect(mockEmitInstallFailed).toHaveBeenCalledWith('card-preset', expect.any(String), 'backend exploded')
    expect(eventSpy).not.toHaveBeenCalled()
    expect(result.current.isInstalled('preset-fail')).toBe(false)

    window.removeEventListener('kc-add-card-from-marketplace', eventSpy)
  })

  it('installs a theme item and calls addCustomTheme', async () => {
    seedCache([makeItem({ id: 'theme-1', type: 'theme', downloadUrl: 'https://example.com/theme.json' })])
    const themeJson = { id: 'theme-1', name: 'Dark Ocean', colors: {} }

    const eventSpy = vi.fn()
    window.addEventListener('kc-custom-themes-changed', eventSpy)

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(themeJson),
    } as Response)

    const { result } = renderHook(() => useMarketplace())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let installResult: unknown
    await act(async () => {
      installResult = await result.current.installItem(result.current.allItems[0])
    })

    expect(installResult).toEqual({ type: 'theme', data: themeJson })
    expect(mockAddCustomTheme).toHaveBeenCalledWith(themeJson)
    expect(eventSpy).toHaveBeenCalled()
    expect(mockEmitInstall).toHaveBeenCalledWith('theme', expect.any(String))
    expect(result.current.isInstalled('theme-1')).toBe(true)

    window.removeEventListener('kc-custom-themes-changed', eventSpy)
  })

  it('emits install-failed analytics on download network error', async () => {
    seedCache([makeItem({ id: 'fail-1', type: 'dashboard' })])

    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('timeout'))

    const { result } = renderHook(() => useMarketplace())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await expect(
      act(() => result.current.installItem(result.current.allItems[0]))
    ).rejects.toThrow('timeout')

    expect(mockEmitInstallFailed).toHaveBeenCalledWith('dashboard', expect.any(String), 'timeout')
    expect(result.current.isInstalled('fail-1')).toBe(false)
  })

  it('emits install-failed analytics on HTTP error during download', async () => {
    seedCache([makeItem({ id: 'fail-2', type: 'dashboard' })])

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response)

    const { result } = renderHook(() => useMarketplace())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await expect(
      act(() => result.current.installItem(result.current.allItems[0]))
    ).rejects.toThrow('Download failed: 404')

    expect(mockEmitInstallFailed).toHaveBeenCalledWith('dashboard', expect.any(String), 'HTTP 404')
  })

  it('removes an installed dashboard via API delete', async () => {
    seedCache([makeItem({ id: 'dash-remove', type: 'dashboard' })])
    seedInstalledItems({
      'dash-remove': { dashboardId: 'db-123', installedAt: new Date().toISOString(), type: 'dashboard' },
    })
    mockApiDelete.mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useMarketplace())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isInstalled('dash-remove')).toBe(true)

    await act(async () => {
      await result.current.removeItem(result.current.allItems[0])
    })

    expect(mockApiDelete).toHaveBeenCalledWith('/api/dashboards/db-123')
    expect(mockEmitRemove).toHaveBeenCalledWith('dashboard')
    expect(result.current.isInstalled('dash-remove')).toBe(false)
  })

  it('removes an installed theme and calls removeCustomTheme', async () => {
    seedCache([makeItem({ id: 'theme-remove', type: 'theme' })])
    seedInstalledItems({
      'theme-remove': { installedAt: new Date().toISOString(), type: 'theme' },
    })

    const eventSpy = vi.fn()
    window.addEventListener('kc-custom-themes-changed', eventSpy)

    const { result } = renderHook(() => useMarketplace())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.removeItem(result.current.allItems[0])
    })

    expect(mockRemoveCustomTheme).toHaveBeenCalledWith('theme-remove')
    expect(eventSpy).toHaveBeenCalled()
    expect(mockEmitRemove).toHaveBeenCalledWith('theme')
    expect(result.current.isInstalled('theme-remove')).toBe(false)

    window.removeEventListener('kc-custom-themes-changed', eventSpy)
  })

  it('removeItem is a no-op when item is not installed', async () => {
    seedCache([makeItem({ id: 'not-installed' })])

    const { result } = renderHook(() => useMarketplace())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.removeItem(result.current.allItems[0])
    })

    expect(mockApiDelete).not.toHaveBeenCalled()
    expect(mockEmitRemove).not.toHaveBeenCalled()
  })

  // ──────────────────────── Installed items persistence ────────────────────────

  it('loads installed items from localStorage on mount', async () => {
    seedCache([makeItem({ id: 'persisted' })])
    seedInstalledItems({
      persisted: { installedAt: '2024-01-01T00:00:00Z', type: 'dashboard', dashboardId: 'abc' },
    })

    const { result } = renderHook(() => useMarketplace())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isInstalled('persisted')).toBe(true)
    expect(result.current.getInstalledDashboardId('persisted')).toBe('abc')
  })

  it('getInstalledDashboardId returns undefined for non-installed items', async () => {
    seedCache([makeItem({ id: 'x' })])

    const { result } = renderHook(() => useMarketplace())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.getInstalledDashboardId('x')).toBeUndefined()
  })

  it('handles corrupt installed items JSON gracefully', async () => {
    localStorage.setItem(INSTALLED_KEY, '<<<bad json>>>')
    seedCache([makeItem({ id: 'x' })])

    // loadInstalled catches parse errors and returns {}
    const { result } = renderHook(() => useMarketplace())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isInstalled('x')).toBe(false)
  })

  // ──────────────────────── Edge cases ────────────────────────

  it('handles empty items array in registry', async () => {
    seedCache([])

    const { result } = renderHook(() => useMarketplace())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.allItems).toEqual([])
    expect(result.current.allTags).toEqual([])
    expect(result.current.typeCounts.all).toBe(0)
  })

  it('search is case-insensitive', async () => {
    seedCache([makeItem({ id: 'a', name: 'GPU Dashboard' })])

    const { result } = renderHook(() => useMarketplace())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => { result.current.setSearchQuery('gpu dashboard') })
    expect(result.current.items.length).toBe(1)

    act(() => { result.current.setSearchQuery('GPU DASHBOARD') })
    expect(result.current.items.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Tests — useAuthorProfile
// ---------------------------------------------------------------------------

describe('useAuthorProfile', () => {
  const AUTHOR_CACHE_PREFIX = 'kc-author-'

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not available'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns initial state when disabled', () => {
    const { result } = renderHook(() => useAuthorProfile('testuser', false))
    expect(result.current.loading).toBe(false)
    expect(result.current.consolePRs).toBe(0)
    expect(result.current.marketplacePRs).toBe(0)
    expect(result.current.coins).toBe(0)
  })

  it('returns initial state when no handle', () => {
    const { result } = renderHook(() => useAuthorProfile(undefined, true))
    expect(result.current.loading).toBe(false)
    expect(result.current.coins).toBe(0)
  })

  it('fetches PR counts from GitHub when enabled', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total_count: 5 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total_count: 3 }),
      } as Response)

    const { result } = renderHook(() => useAuthorProfile('octocat', true))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.consolePRs).toBe(5)
    })
    expect(result.current.marketplacePRs).toBe(3)
    const COINS_PER_PR = 100
    expect(result.current.coins).toBe((5 + 3) * COINS_PER_PR)
  })

  it('loads from valid cache without fetching', async () => {
    const cached = {
      consolePRs: 10,
      marketplacePRs: 2,
      fetchedAt: Date.now(),
    }
    localStorage.setItem(`${AUTHOR_CACHE_PREFIX}testuser`, JSON.stringify(cached))

    const { result } = renderHook(() => useAuthorProfile('testuser', true))

    await waitFor(() => {
      expect(result.current.consolePRs).toBe(10)
    })
    expect(result.current.marketplacePRs).toBe(2)
    const COINS_PER_PR = 100
    expect(result.current.coins).toBe(12 * COINS_PER_PR)
    // No fetch should have been called
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('ignores expired author cache', async () => {
    const TWENTY_FIVE_HOURS_AGO = Date.now() - 25 * 60 * 60 * 1000
    const cached = {
      consolePRs: 10,
      marketplacePRs: 2,
      fetchedAt: TWENTY_FIVE_HOURS_AGO,
    }
    localStorage.setItem(`${AUTHOR_CACHE_PREFIX}staleuser`, JSON.stringify(cached))

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total_count: 20 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total_count: 5 }),
      } as Response)

    const { result } = renderHook(() => useAuthorProfile('staleuser', true))

    await waitFor(() => {
      expect(result.current.consolePRs).toBe(20)
    })
    expect(result.current.marketplacePRs).toBe(5)
  })

  it('returns 0 for PR counts when GitHub API fails', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({ ok: false, status: 403 } as Response)
      .mockResolvedValueOnce({ ok: false, status: 403 } as Response)

    const { result } = renderHook(() => useAuthorProfile('ratelimited', true))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.consolePRs).toBe(0)
    expect(result.current.marketplacePRs).toBe(0)
    expect(result.current.coins).toBe(0)
  })

  it('caches fetched results in localStorage', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total_count: 7 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total_count: 1 }),
      } as Response)

    const { result } = renderHook(() => useAuthorProfile('cachetest', true))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.consolePRs).toBe(7)
    })

    const stored = JSON.parse(localStorage.getItem(`${AUTHOR_CACHE_PREFIX}cachetest`)!)
    expect(stored.consolePRs).toBe(7)
    expect(stored.marketplacePRs).toBe(1)
    expect(stored.fetchedAt).toBeDefined()
  })

  it('handles malformed author cache gracefully', async () => {
    localStorage.setItem(`${AUTHOR_CACHE_PREFIX}badcache`, '<<not json>>')

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total_count: 2 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total_count: 1 }),
      } as Response)

    const { result } = renderHook(() => useAuthorProfile('badcache', true))

    await waitFor(() => {
      expect(result.current.consolePRs).toBe(2)
    })
  })
})
