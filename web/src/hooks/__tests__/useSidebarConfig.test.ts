import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

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

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
}))

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
    const origFirst = result.current.config.primaryNav[0]?.id
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
})
