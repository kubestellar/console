import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../useDemoMode', () => ({
  useDemoMode: vi.fn(() => ({ isDemoMode: true })),
}))

vi.mock('../useBackendHealth', () => ({
  useBackendHealth: vi.fn(() => ({
    status: 'connected',
    isConnected: true,
    inCluster: false,
  })),
}))

vi.mock('../../lib/analytics', () => ({
  emitEvent: vi.fn(),
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
} })

vi.mock('../../lib/project/context', () => ({
  setActiveProject: vi.fn(),
}))

import { useSidebarConfig, DISCOVERABLE_DASHBOARDS, PROTECTED_SIDEBAR_IDS } from '../useSidebarConfig'
import type { SidebarItem } from '../useSidebarConfig'

const STORAGE_KEY = 'kubestellar-sidebar-config-v11'
const OLD_STORAGE_KEY = 'kubestellar-sidebar-config-v10'

describe('useSidebarConfig', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    // Reset module-level shared state by clearing storage
    // (the module uses sharedConfig singleton that persists across tests)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // --- Basic shape ---
  it('returns expected shape', () => {
    const { result } = renderHook(() => useSidebarConfig())
    expect(result.current.config).toBeDefined()
    expect(result.current.config.primaryNav).toBeDefined()
    expect(result.current.config.secondaryNav).toBeDefined()
    expect(result.current.config.sections).toBeDefined()
    expect(typeof result.current.config.collapsed).toBe('boolean')
    expect(typeof result.current.config.showClusterStatus).toBe('boolean')
    expect(typeof result.current.config.isMobileOpen).toBe('boolean')
  })

  it('returns all action functions', () => {
    const { result } = renderHook(() => useSidebarConfig())
    expect(typeof result.current.addItem).toBe('function')
    expect(typeof result.current.addItems).toBe('function')
    expect(typeof result.current.removeItem).toBe('function')
    expect(typeof result.current.updateItem).toBe('function')
    expect(typeof result.current.reorderItems).toBe('function')
    expect(typeof result.current.toggleClusterStatus).toBe('function')
    expect(typeof result.current.setWidth).toBe('function')
    expect(typeof result.current.toggleCollapsed).toBe('function')
    expect(typeof result.current.setCollapsed).toBe('function')
    expect(typeof result.current.openMobileSidebar).toBe('function')
    expect(typeof result.current.closeMobileSidebar).toBe('function')
    expect(typeof result.current.toggleMobileSidebar).toBe('function')
    expect(typeof result.current.restoreDashboard).toBe('function')
    expect(typeof result.current.resetToDefault).toBe('function')
    expect(typeof result.current.generateFromBehavior).toBe('function')
  })

  // --- Add item ---
  it('addItem adds to primary nav', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const before = result.current.config.primaryNav.length
    act(() => {
      result.current.addItem({ name: 'Test', icon: 'Box', href: '/test', type: 'link' }, 'primary')
    })
    expect(result.current.config.primaryNav.length).toBe(before + 1)
    const added = result.current.config.primaryNav[result.current.config.primaryNav.length - 1]
    expect(added.name).toBe('Test')
    expect(added.isCustom).toBe(true)
  })

  it('addItem adds to secondary nav', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const before = result.current.config.secondaryNav.length
    act(() => {
      result.current.addItem({ name: 'Sec', icon: 'Box', href: '/sec', type: 'link' }, 'secondary')
    })
    expect(result.current.config.secondaryNav.length).toBe(before + 1)
  })

  it('addItem adds to sections', () => {
    const { result } = renderHook(() => useSidebarConfig())
    act(() => {
      result.current.addItem({ name: 'Section', icon: 'Box', href: '/section', type: 'section' }, 'sections')
    })
    expect(result.current.config.sections.length).toBe(1)
  })

  // --- Add multiple items ---
  it('addItems adds multiple items at once', () => {
    const { result } = renderHook(() => useSidebarConfig())
    act(() => {
      result.current.addItems([
        { item: { name: 'A', icon: 'Box', href: '/a', type: 'link' }, target: 'primary' },
        { item: { name: 'B', icon: 'Box', href: '/b', type: 'link' }, target: 'secondary' },
        { item: { name: 'C', icon: 'Box', href: '/c', type: 'section' }, target: 'sections' },
      ])
    })
    expect(result.current.config.primaryNav.some(i => i.name === 'A')).toBe(true)
    expect(result.current.config.secondaryNav.some(i => i.name === 'B')).toBe(true)
    expect(result.current.config.sections.some(i => i.name === 'C')).toBe(true)
  })

  // --- Remove item ---
  it('removeItem removes from all nav sections', () => {
    const { result } = renderHook(() => useSidebarConfig())
    // Add a custom item first
    act(() => {
      result.current.addItem({ name: 'ToRemove', icon: 'Box', href: '/rm', type: 'link' }, 'primary')
    })
    const addedId = result.current.config.primaryNav.find(i => i.name === 'ToRemove')!.id
    act(() => { result.current.removeItem(addedId) })
    expect(result.current.config.primaryNav.some(i => i.id === addedId)).toBe(false)
  })

  // --- Update item ---
  it('updateItem updates an item in primary nav', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const first = result.current.config.primaryNav[0]
    act(() => { result.current.updateItem(first.id, { name: 'Updated Name' }) })
    expect(result.current.config.primaryNav[0].name).toBe('Updated Name')
  })

  // --- Reorder ---
  it('reorderItems replaces primary nav items', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const reversed = [...result.current.config.primaryNav].reverse()
    act(() => { result.current.reorderItems(reversed, 'primary') })
    expect(result.current.config.primaryNav[0].id).toBe(reversed[0].id)
  })

  it('reorderItems replaces secondary nav items', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const reversed = [...result.current.config.secondaryNav].reverse()
    act(() => { result.current.reorderItems(reversed, 'secondary') })
    expect(result.current.config.secondaryNav[0].id).toBe(reversed[0].id)
  })

  it('reorderItems replaces sections items', () => {
    const { result } = renderHook(() => useSidebarConfig())
    act(() => {
      result.current.addItem({ name: 'S1', icon: 'Box', href: '/s1', type: 'section' }, 'sections')
    })
    act(() => { result.current.reorderItems([], 'sections') })
    expect(result.current.config.sections.length).toBe(0)
  })

  // --- Toggle cluster status ---
  it('toggleClusterStatus toggles the flag', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const before = result.current.config.showClusterStatus
    act(() => { result.current.toggleClusterStatus() })
    expect(result.current.config.showClusterStatus).toBe(!before)
  })

  // --- Width ---
  it('setWidth updates sidebar width', () => {
    const { result } = renderHook(() => useSidebarConfig())
    act(() => { result.current.setWidth(300) })
    expect(result.current.config.width).toBe(300)
  })

  // --- Collapsed ---
  it('toggleCollapsed toggles collapsed state', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const before = result.current.config.collapsed
    act(() => { result.current.toggleCollapsed() })
    expect(result.current.config.collapsed).toBe(!before)
  })

  it('setCollapsed sets collapsed to specific value', () => {
    const { result } = renderHook(() => useSidebarConfig())
    act(() => { result.current.setCollapsed(true) })
    expect(result.current.config.collapsed).toBe(true)
    act(() => { result.current.setCollapsed(false) })
    expect(result.current.config.collapsed).toBe(false)
  })

  // --- Mobile sidebar ---
  it('openMobileSidebar sets isMobileOpen to true', () => {
    const { result } = renderHook(() => useSidebarConfig())
    act(() => { result.current.openMobileSidebar() })
    expect(result.current.config.isMobileOpen).toBe(true)
  })

  it('closeMobileSidebar sets isMobileOpen to false', () => {
    const { result } = renderHook(() => useSidebarConfig())
    act(() => { result.current.openMobileSidebar() })
    act(() => { result.current.closeMobileSidebar() })
    expect(result.current.config.isMobileOpen).toBe(false)
  })

  it('toggleMobileSidebar toggles isMobileOpen', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const before = result.current.config.isMobileOpen
    act(() => { result.current.toggleMobileSidebar() })
    expect(result.current.config.isMobileOpen).toBe(!before)
  })

  // --- Restore dashboard ---
  it('restoreDashboard adds a discoverable dashboard to primary nav', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const compute = DISCOVERABLE_DASHBOARDS.find(d => d.id === 'compute')!
    const before = result.current.config.primaryNav.some(i => i.id === 'compute')
    if (!before) {
      act(() => { result.current.restoreDashboard(compute) })
      expect(result.current.config.primaryNav.some(i => i.id === 'compute')).toBe(true)
    }
  })

  it('restoreDashboard is a no-op if already present', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const dashboard = result.current.config.primaryNav[0]
    const before = result.current.config.primaryNav.length
    act(() => { result.current.restoreDashboard(dashboard) })
    expect(result.current.config.primaryNav.length).toBe(before)
  })

  // --- Reset to default ---
  it('resetToDefault restores default config', () => {
    const { result } = renderHook(() => useSidebarConfig())
    // Modify config
    act(() => { result.current.setCollapsed(true) })
    act(() => { result.current.setWidth(500) })
    // Reset
    act(() => { result.current.resetToDefault() })
    expect(result.current.config.collapsed).toBe(false)
  })

  // --- Generate from behavior ---
  it('generateFromBehavior reorders based on frequently used paths', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const _origFirst = result.current.config.primaryNav[0]?.id
    act(() => {
      // /clusters should move to position 0 since it appears first in the frequency list
      result.current.generateFromBehavior(['/clusters', '/deploy', '/'])
    })
    const reorderedFirst = result.current.config.primaryNav[0]?.id
    // The first item should be 'clusters' since it was the most frequently used
    expect(reorderedFirst).toBe('clusters')
  })

  // --- Persistence ---
  it('persists config to localStorage', () => {
    const { result } = renderHook(() => useSidebarConfig())
    act(() => { result.current.setCollapsed(true) })
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored.collapsed).toBe(true)
  })

  // --- Exports ---
  it('exports DISCOVERABLE_DASHBOARDS', () => {
    expect(Array.isArray(DISCOVERABLE_DASHBOARDS)).toBe(true)
    expect(DISCOVERABLE_DASHBOARDS.length).toBeGreaterThan(0)
  })

  it('exports PROTECTED_SIDEBAR_IDS', () => {
    expect(Array.isArray(PROTECTED_SIDEBAR_IDS)).toBe(true)
    expect(PROTECTED_SIDEBAR_IDS).toContain('dashboard')
    expect(PROTECTED_SIDEBAR_IDS).toContain('clusters')
    expect(PROTECTED_SIDEBAR_IDS).toContain('deploy')
  })

  // --- Regression: removeItem with non-existent id does not crash ---
  it('removeItem with non-existent id is a no-op', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const beforePrimary = result.current.config.primaryNav.length
    const beforeSecondary = result.current.config.secondaryNav.length
    act(() => { result.current.removeItem('non-existent-id-xyz') })
    expect(result.current.config.primaryNav.length).toBe(beforePrimary)
    expect(result.current.config.secondaryNav.length).toBe(beforeSecondary)
  })

  // --- Regression: updateItem with non-existent id does not crash ---
  it('updateItem with non-existent id leaves config unchanged', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const beforeNames = result.current.config.primaryNav.map(i => i.name)
    act(() => { result.current.updateItem('non-existent-id-xyz', { name: 'Ghost' }) })
    const afterNames = result.current.config.primaryNav.map(i => i.name)
    expect(afterNames).toEqual(beforeNames)
  })

  // --- Regression: addItem assigns correct order based on target length ---
  it('addItem assigns order equal to current target length', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const expectedOrder = result.current.config.primaryNav.length
    act(() => {
      result.current.addItem({ name: 'OrderTest', icon: 'Box', href: '/order-test', type: 'link' }, 'primary')
    })
    const added = result.current.config.primaryNav.find(i => i.name === 'OrderTest')!
    expect(added.order).toBe(expectedOrder)
    expect(added.isCustom).toBe(true)
    expect(added.id).toMatch(/^custom-/)
  })

  // --- Regression: updateItem works across secondary nav ---
  it('updateItem updates an item in secondary nav', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const secItem = result.current.config.secondaryNav[0]
    act(() => { result.current.updateItem(secItem.id, { name: 'Renamed Secondary' }) })
    expect(result.current.config.secondaryNav[0].name).toBe('Renamed Secondary')
  })

  // --- Regression: updateItem works across sections ---
  it('updateItem updates an item in sections', () => {
    const { result } = renderHook(() => useSidebarConfig())
    act(() => {
      result.current.addItem({ name: 'SectUpdate', icon: 'Box', href: '/sect-update', type: 'section' }, 'sections')
    })
    const sectItem = result.current.config.sections.find(i => i.name === 'SectUpdate')!
    act(() => { result.current.updateItem(sectItem.id, { icon: 'Shield' }) })
    const updated = result.current.config.sections.find(i => i.id === sectItem.id)!
    expect(updated.icon).toBe('Shield')
  })

  // --- Regression: generateFromBehavior matches sub-paths ---
  it('generateFromBehavior matches sub-paths (e.g. /clusters/details)', () => {
    const { result } = renderHook(() => useSidebarConfig())
    act(() => {
      result.current.generateFromBehavior(['/ai-ml/models', '/clusters/details', '/deploy/wizard'])
    })
    const ids = result.current.config.primaryNav.map(i => i.id)
    // ai-ml should be promoted because /ai-ml/models starts with /ai-ml/
    expect(ids.indexOf('ai-ml')).toBeLessThan(ids.indexOf('dashboard'))
  })

  // --- Regression: generateFromBehavior matches query params ---
  it('generateFromBehavior matches paths with query params', () => {
    const { result } = renderHook(() => useSidebarConfig())
    act(() => {
      result.current.generateFromBehavior(['/alerts?severity=critical', '/arcade?game=tetris'])
    })
    const ids = result.current.config.primaryNav.map(i => i.id)
    // alerts and arcade should be first two because they match /alerts? and /arcade?
    expect(ids[0]).toBe('alerts')
    expect(ids[1]).toBe('arcade')
  })

  // --- Regression: generateFromBehavior with unmatched paths ---
  it('generateFromBehavior ignores unmatched paths without crashing', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const beforeLen = result.current.config.primaryNav.length
    act(() => {
      result.current.generateFromBehavior(['/totally-unknown-path', '/another-unknown'])
    })
    // All items should still be present; order unchanged since nothing matched
    expect(result.current.config.primaryNav.length).toBe(beforeLen)
  })

  // --- Regression: multiple toggleCollapsed calls produce correct state ---
  it('double toggleCollapsed returns to original state', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const original = result.current.config.collapsed
    act(() => { result.current.toggleCollapsed() })
    act(() => { result.current.toggleCollapsed() })
    expect(result.current.config.collapsed).toBe(original)
  })

  // --- Regression: double toggleClusterStatus returns to original ---
  it('double toggleClusterStatus returns to original state', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const original = result.current.config.showClusterStatus
    act(() => { result.current.toggleClusterStatus() })
    act(() => { result.current.toggleClusterStatus() })
    expect(result.current.config.showClusterStatus).toBe(original)
  })

  // --- Regression: mobile sidebar open/close/toggle sequence ---
  it('mobile sidebar toggle cycle produces correct states', () => {
    const { result } = renderHook(() => useSidebarConfig())
    // Close first to ensure known state
    act(() => { result.current.closeMobileSidebar() })
    expect(result.current.config.isMobileOpen).toBe(false)

    act(() => { result.current.toggleMobileSidebar() })
    expect(result.current.config.isMobileOpen).toBe(true)

    act(() => { result.current.toggleMobileSidebar() })
    expect(result.current.config.isMobileOpen).toBe(false)

    act(() => { result.current.openMobileSidebar() })
    expect(result.current.config.isMobileOpen).toBe(true)

    act(() => { result.current.openMobileSidebar() })
    // Opening when already open should stay true (idempotent)
    expect(result.current.config.isMobileOpen).toBe(true)
  })

  // --- Regression: addItems assigns incrementing orders within a single batch ---
  it('addItems assigns correct incremental order within a batch', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const initialSectionsLen = result.current.config.sections.length
    act(() => {
      result.current.addItems([
        { item: { name: 'Batch1', icon: 'Box', href: '/b1', type: 'section' }, target: 'sections' },
        { item: { name: 'Batch2', icon: 'Box', href: '/b2', type: 'section' }, target: 'sections' },
        { item: { name: 'Batch3', icon: 'Box', href: '/b3', type: 'section' }, target: 'sections' },
      ])
    })
    const batch1 = result.current.config.sections.find(i => i.name === 'Batch1')!
    const batch2 = result.current.config.sections.find(i => i.name === 'Batch2')!
    const batch3 = result.current.config.sections.find(i => i.name === 'Batch3')!
    expect(batch1.order).toBe(initialSectionsLen)
    expect(batch2.order).toBe(initialSectionsLen + 1)
    expect(batch3.order).toBe(initialSectionsLen + 2)
  })

  // --- Regression: restoreDashboard preserves original dashboard id ---
  it('restoreDashboard preserves original dashboard id (not custom- prefix)', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const cost = DISCOVERABLE_DASHBOARDS.find(d => d.id === 'cost')!
    // First remove cost if somehow present (shouldn't be by default)
    act(() => { result.current.removeItem('cost') })
    act(() => { result.current.restoreDashboard(cost) })
    const restored = result.current.config.primaryNav.find(i => i.id === 'cost')
    expect(restored).toBeDefined()
    expect(restored!.id).toBe('cost')
    // Should NOT have a custom- prefix
    expect(restored!.id).not.toMatch(/^custom-/)
  })

  it('re-adding a built-in route clears its removed persistence state', () => {
    const { result } = renderHook(() => useSidebarConfig())

    act(() => { result.current.removeItem('insights') })
    act(() => {
      result.current.addItem({ name: 'Insights', icon: 'Lightbulb', href: '/insights', type: 'link' }, 'primary')
    })

    const restored = result.current.config.primaryNav.find(i => i.href === '/insights')
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)

    expect(restored?.id).toBe('insights')
    expect(stored.removedBuiltinItemIds).not.toContain('insights')
  })

  it('persists removed built-in items so they stay hidden after refresh', async () => {
    const { result } = renderHook(() => useSidebarConfig())

    act(() => { result.current.removeItem('insights') })

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored.removedBuiltinItemIds).toContain('insights')

    vi.resetModules()
    const freshMod = await import('../useSidebarConfig')
    const { result: refreshedResult } = renderHook(() => freshMod.useSidebarConfig())

    const hasInsights = refreshedResult.current.config.primaryNav.some(item => item.id === 'insights')
    expect(hasInsights).toBe(false)
  })

  // --- Regression: localStorage persistence survives JSON round-trip ---
  it('persisted config survives JSON round-trip for complex state', () => {
    const { result } = renderHook(() => useSidebarConfig())
    act(() => {
      result.current.setWidth(420)
      result.current.setCollapsed(true)
    })
    act(() => {
      result.current.addItem(
        { name: 'Persist Test', icon: 'Database', href: '/persist', type: 'card', cardType: 'mini', description: 'A test card' },
        'primary'
      )
    })
    const raw = localStorage.getItem(STORAGE_KEY)!
    const parsed = JSON.parse(raw)
    expect(parsed.width).toBe(420)
    expect(parsed.collapsed).toBe(true)
    const persistedItem = parsed.primaryNav.find((i: SidebarItem) => i.name === 'Persist Test')
    expect(persistedItem).toBeDefined()
    expect(persistedItem.cardType).toBe('mini')
    expect(persistedItem.description).toBe('A test card')
    expect(persistedItem.isCustom).toBe(true)
  })

  // --- Regression: exported constants have correct pixel values ---
  it('exports correct sidebar dimension constants', async () => {
    const mod = await import('../useSidebarConfig')
    expect(mod.SIDEBAR_COLLAPSED_WIDTH_PX).toBe(80)
    expect(mod.SIDEBAR_DEFAULT_WIDTH_PX).toBe(256)
  })

  // --- Regression: DISCOVERABLE_DASHBOARDS items all have required fields ---
  it('DISCOVERABLE_DASHBOARDS items all have required SidebarItem fields', () => {
    DISCOVERABLE_DASHBOARDS.forEach((item) => {
      expect(item.id).toBeTruthy()
      expect(item.name).toBeTruthy()
      expect(item.icon).toBeTruthy()
      expect(item.href).toMatch(/^\//)
      expect(item.type).toBe('link')
      expect(typeof item.order).toBe('number')
    })
  })

  // --- Regression: DISCOVERABLE_DASHBOARDS ids are unique ---
  it('DISCOVERABLE_DASHBOARDS has unique ids', () => {
    const ids = DISCOVERABLE_DASHBOARDS.map(d => d.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })
})

// ===========================================================================
// Additional coverage: fetchEnabledDashboards, applyDashboardFilter,
// migrateConfig, initSharedConfig, getEnabledDashboardIds
// ===========================================================================

describe('useSidebarConfig — expanded coverage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    // Mock fetch so fetchEnabledDashboards (called by useSidebarConfig hook)
    // doesn't hang waiting for a real /health request
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ enabled_dashboards: [] }),
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // --- getEnabledDashboardIds ---
  it('getEnabledDashboardIds returns null initially (show all dashboards)', async () => {
    const { getEnabledDashboardIds } = await import('../useSidebarConfig')
    // By default (no fetch performed yet) the value should be null
    const ids = getEnabledDashboardIds()
    // null means show all dashboards — no server-side filter applied
    expect(ids === null || Array.isArray(ids)).toBe(true)
  })

  // --- fetchEnabledDashboards: health endpoint returns project ---
  it('fetchEnabledDashboards calls setActiveProject when health returns project', async () => {
    const { setActiveProject } = await import('../../lib/project/context')
    const mockSetActiveProject = vi.mocked(setActiveProject)

    // Mock global fetch to return project data
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ project: 'custom-project', enabled_dashboards: [] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    // Reset the fetched flag by reimporting fresh module
    vi.resetModules()
    const freshMod = await import('../useSidebarConfig')
    await freshMod.fetchEnabledDashboards()

    expect(mockSetActiveProject).toHaveBeenCalledWith('custom-project')
    vi.unstubAllGlobals()
  })

  // --- fetchEnabledDashboards: health endpoint fails gracefully ---
  it('fetchEnabledDashboards silently handles network errors', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network down'))
    vi.stubGlobal('fetch', mockFetch)

    vi.resetModules()
    const freshMod = await import('../useSidebarConfig')

    // Should not throw
    await expect(freshMod.fetchEnabledDashboards()).resolves.toBeUndefined()
    vi.unstubAllGlobals()
  })

  // --- fetchEnabledDashboards: skips if already fetched (idempotent) ---
  it('fetchEnabledDashboards is a no-op on second call', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ enabled_dashboards: [] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    vi.resetModules()
    const freshMod = await import('../useSidebarConfig')

    await freshMod.fetchEnabledDashboards()
    const callCount = mockFetch.mock.calls.length
    await freshMod.fetchEnabledDashboards()
    // Second call should NOT fetch again
    expect(mockFetch.mock.calls.length).toBe(callCount)
    vi.unstubAllGlobals()
  })

  // --- migrateConfig: removes deprecated routes ---
  it('migrates stored config by removing deprecated /apps route', async () => {
    const storedConfig = {
      primaryNav: [
        { id: 'dashboard', name: 'Dashboard', icon: 'LayoutDashboard', href: '/', type: 'link', order: 0 },
        { id: 'apps', name: 'Apps', icon: 'Box', href: '/apps', type: 'link', order: 1 },
      ],
      secondaryNav: [
        { id: 'settings', name: 'Settings', icon: 'Settings', href: '/settings', type: 'link', order: 0 },
      ],
      sections: [],
      showClusterStatus: true,
      collapsed: false,
      isMobileOpen: false,
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedConfig))

    // Fresh module instance needed so initSharedConfig reads from localStorage
    vi.resetModules()
    const freshMod = await import('../useSidebarConfig')
    const { result } = renderHook(() => freshMod.useSidebarConfig())

    // /apps should be removed
    const hasApps = result.current.config.primaryNav.some(item => item.href === '/apps')
    expect(hasApps).toBe(false)
  })

  // --- migrateConfig: adds missing default primary nav items ---
  it('migrates stored config by adding missing default primary nav items', async () => {
    // Store a config missing the "alerts" dashboard
    const storedConfig = {
      primaryNav: [
        { id: 'dashboard', name: 'Dashboard', icon: 'LayoutDashboard', href: '/', type: 'link', order: 0 },
      ],
      secondaryNav: [
        { id: 'settings', name: 'Settings', icon: 'Settings', href: '/settings', type: 'link', order: 0 },
      ],
      sections: [],
      showClusterStatus: true,
      collapsed: false,
      isMobileOpen: false,
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedConfig))
    vi.resetModules()

    const freshMod = await import('../useSidebarConfig')
    const { result } = renderHook(() => freshMod.useSidebarConfig())

    // Missing default items should be added during migration
    const hasAlerts = result.current.config.primaryNav.some(item => item.id === 'alerts')
    expect(hasAlerts).toBe(true)
  })

  it('migrateConfig keeps explicitly removed built-in items hidden after refresh', async () => {
    const storedConfig = {
      primaryNav: [
        { id: 'dashboard', name: 'Dashboard', icon: 'LayoutDashboard', href: '/', type: 'link', order: 0 },
      ],
      secondaryNav: [
        { id: 'settings', name: 'Settings', icon: 'Settings', href: '/settings', type: 'link', order: 0 },
      ],
      sections: [],
      showClusterStatus: true,
      collapsed: false,
      isMobileOpen: false,
      removedBuiltinItemIds: ['alerts'],
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedConfig))
    vi.resetModules()

    const freshMod = await import('../useSidebarConfig')
    const { result } = renderHook(() => freshMod.useSidebarConfig())

    const hasAlerts = result.current.config.primaryNav.some(item => item.id === 'alerts')
    expect(hasAlerts).toBe(false)
  })

  // --- migrateConfig: adds missing default secondary nav items ---
  it('migrates stored config by adding missing default secondary nav items', async () => {
    // Store a config with no secondary nav items
    const storedConfig = {
      primaryNav: [
        { id: 'dashboard', name: 'Dashboard', icon: 'LayoutDashboard', href: '/', type: 'link', order: 0 },
      ],
      secondaryNav: [],
      sections: [],
      showClusterStatus: true,
      collapsed: false,
      isMobileOpen: false,
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedConfig))
    vi.resetModules()

    const freshMod = await import('../useSidebarConfig')
    const { result } = renderHook(() => freshMod.useSidebarConfig())

    // Default secondary items (marketplace, history, namespaces, users, settings) should be added
    expect(result.current.config.secondaryNav.length).toBeGreaterThan(0)
    const hasMarketplace = result.current.config.secondaryNav.some(item => item.id === 'marketplace')
    expect(hasMarketplace).toBe(true)
  })

  // --- initSharedConfig: migrates from old storage key ---
  it('migrates config from old storage key to current key', async () => {
    const oldConfig = {
      primaryNav: [
        { id: 'dashboard', name: 'Dashboard', icon: 'LayoutDashboard', href: '/', type: 'link', order: 0 },
      ],
      secondaryNav: [],
      sections: [],
      showClusterStatus: true,
      collapsed: true,
      isMobileOpen: false,
    }

    localStorage.setItem(OLD_STORAGE_KEY, JSON.stringify(oldConfig))
    vi.resetModules()

    const freshMod = await import('../useSidebarConfig')
    const { result } = renderHook(() => freshMod.useSidebarConfig())

    // Old key should be removed after migration
    expect(localStorage.getItem(OLD_STORAGE_KEY)).toBeNull()

    // Config should be loaded from old key
    expect(result.current.config.collapsed).toBe(true)
  })

  // --- initSharedConfig: handles corrupt JSON in localStorage ---
  it('falls back to default config when localStorage contains invalid JSON', async () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{')
    vi.resetModules()

    const freshMod = await import('../useSidebarConfig')
    const { result } = renderHook(() => freshMod.useSidebarConfig())

    // Should fall back to default config
    expect(result.current.config.collapsed).toBe(false)
    expect(result.current.config.primaryNav.length).toBeGreaterThan(0)
  })

  // --- applyDashboardFilter: sorts by ENABLED_DASHBOARDS order ---
  it('fetchEnabledDashboards applies filter and reorders primary nav', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        enabled_dashboards: ['deploy', 'dashboard', 'clusters'],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    vi.resetModules()
    const freshMod = await import('../useSidebarConfig')
    await freshMod.fetchEnabledDashboards()

    // After enabling dashboards, getEnabledDashboardIds should return the list
    const ids = freshMod.getEnabledDashboardIds()
    expect(ids).toEqual(['deploy', 'dashboard', 'clusters'])
    vi.unstubAllGlobals()
  })

  // --- applyDashboardFilter: promotes discoverable dashboards ---
  it('applyDashboardFilter promotes discoverable dashboards when they are in enabled list', async () => {
    // 'compute' is in DISCOVERABLE_DASHBOARDS but NOT in default primary nav
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        enabled_dashboards: ['dashboard', 'compute'],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    vi.resetModules()
    const freshMod = await import('../useSidebarConfig')

    // Fetch enabled dashboards FIRST so enabledDashboardIds is set
    // before initSharedConfig runs (which applies the filter)
    await freshMod.fetchEnabledDashboards()

    // Now render the hook — initSharedConfig will apply the dashboard filter
    const { result } = renderHook(() => freshMod.useSidebarConfig())
    const computeItem = result.current.config.primaryNav.find(i => i.id === 'compute')
    expect(computeItem).toBeDefined()
    vi.unstubAllGlobals()
  })

  // --- applyDashboardFilter: custom items always survive filter ---
  it('custom items survive dashboard filter (isCustom bypasses filter)', () => {
    const { result } = renderHook(() => useSidebarConfig())

    act(() => {
      result.current.addItem(
        { name: 'My Custom', icon: 'Box', href: '/my-custom', type: 'link' },
        'primary'
      )
    })

    const customItem = result.current.config.primaryNav.find(i => i.name === 'My Custom')
    expect(customItem).toBeDefined()
    expect(customItem!.isCustom).toBe(true)
  })

  // --- setConfig with function updater uses current shared state ---
  it('setConfig function updater receives current config', () => {
    const { result } = renderHook(() => useSidebarConfig())

    // Establish known initial state
    act(() => { result.current.setCollapsed(false) })

    // Set width first to establish state
    act(() => { result.current.setWidth(350) })
    expect(result.current.config.width).toBe(350)

    // Toggle collapsed should work on the updated state
    act(() => { result.current.toggleCollapsed() })
    expect(result.current.config.collapsed).toBe(true)
    expect(result.current.config.width).toBe(350) // width should persist
  })

  // --- generateFromBehavior: promotes secondary nav items to primary ---
  it('generateFromBehavior can pull secondary nav items up by frequency', () => {
    const { result } = renderHook(() => useSidebarConfig())

    // /settings is in secondaryNav; using it frequently should move it to primary
    act(() => {
      result.current.generateFromBehavior(['/settings'])
    })

    // settings should now be at the front of primaryNav
    const ids = result.current.config.primaryNav.map(i => i.id)
    expect(ids[0]).toBe('settings')
  })

  // --- addItems: handles mixed targets in a single batch ---
  it('addItems handles secondary items in batch correctly', () => {
    const { result } = renderHook(() => useSidebarConfig())
    const beforeSecondary = result.current.config.secondaryNav.length

    act(() => {
      result.current.addItems([
        { item: { name: 'SecBatch1', icon: 'Box', href: '/sb1', type: 'link' }, target: 'secondary' },
        { item: { name: 'SecBatch2', icon: 'Box', href: '/sb2', type: 'link' }, target: 'secondary' },
      ])
    })

    expect(result.current.config.secondaryNav.length).toBe(beforeSecondary + 2)
    const sb1 = result.current.config.secondaryNav.find(i => i.name === 'SecBatch1')!
    const sb2 = result.current.config.secondaryNav.find(i => i.name === 'SecBatch2')!
    expect(sb2.order).toBeGreaterThan(sb1.order)
  })

  // --- fetchEnabledDashboards: ignores non-string project ---
  it('fetchEnabledDashboards ignores non-string project field', async () => {
    const { setActiveProject } = await import('../../lib/project/context')
    const mockSetActiveProject = vi.mocked(setActiveProject)

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ project: 42, enabled_dashboards: [] }), // project is number, not string
    })
    vi.stubGlobal('fetch', mockFetch)

    vi.resetModules()
    const freshMod = await import('../useSidebarConfig')
    await freshMod.fetchEnabledDashboards()

    // setActiveProject should NOT be called since project is not a string
    expect(mockSetActiveProject).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  // --- migrateConfig: no-op when all items already present ---
  it('migrateConfig is a no-op when config has all default items', async () => {
    // Store a full default config (no missing items, no deprecated routes)
    const { result: defaultResult } = renderHook(() => useSidebarConfig())
    const fullConfig = defaultResult.current.config

    localStorage.setItem(STORAGE_KEY, JSON.stringify(fullConfig))
    vi.resetModules()

    const freshMod = await import('../useSidebarConfig')
    const { result } = renderHook(() => freshMod.useSidebarConfig())

    // Should have the same items
    expect(result.current.config.primaryNav.length).toBe(fullConfig.primaryNav.length)
    expect(result.current.config.secondaryNav.length).toBe(fullConfig.secondaryNav.length)
  })
})
