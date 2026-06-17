import { describe, setupUseMarketplaceSuite } from './useMarketplace.test.setup'
import { it, expect, renderHook, waitFor, act, useMarketplace, makeItem, seedCache, mockIsCardTypeRegistered } from './useMarketplace.test.setup'

describe('useMarketplace', () => {
  setupUseMarketplaceSuite()

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

})
