import { describe, setupUseMarketplaceSuite } from './useMarketplace.test.setup'
import { it, expect, renderHook, waitFor, act, useMarketplace, makeItem, seedCache, seedInstalledItems, INSTALLED_KEY } from './useMarketplace.test.setup'

describe('useMarketplace', () => {
  setupUseMarketplaceSuite()

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
})
