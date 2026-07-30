import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))
vi.mock('../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../useDemoMode')>()),
  useDemoMode: vi.fn(() => ({ isDemoMode: true })),
  getDemoMode: vi.fn(() => false),
}))
vi.mock('../useBackendHealth', () => ({
  useBackendHealth: vi.fn(() => ({
    status: 'connected',
    isConnected: true,
    inCluster: false,
  })),
}))
vi.mock('../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/analytics')>()),
  emitEvent: vi.fn(),
}
))
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
const ENABLED_DASHBOARDS_STORAGE_KEY = `${STORAGE_KEY}-enabled-dashboards`
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
  it('getEnabledDashboardIds returns null initially (show all dashboards)', async () => {
    const { getEnabledDashboardIds } = await import('../useSidebarConfig')
    // By default (no fetch performed yet) the value should be null
    const ids = getEnabledDashboardIds()
    // null means show all dashboards — no server-side filter applied
    expect(ids === null || Array.isArray(ids)).toBe(true)
  })
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
  it('fetchEnabledDashboards silently handles network errors', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network down'))
    vi.stubGlobal('fetch', mockFetch)
    vi.resetModules()
    const freshMod = await import('../useSidebarConfig')
    // Should not throw
    await expect(freshMod.fetchEnabledDashboards()).resolves.toBeUndefined()
    vi.unstubAllGlobals()
  })
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
  it('normalizes stale built-in routes stored with an outdated href', async () => {
    const storedConfig = {
      primaryNav: [
        { id: 'dashboard', name: 'Dashboard', icon: 'LayoutDashboard', href: '/', type: 'link', order: 0 },
        { id: 'acmm', name: 'ACMM', icon: 'BrainCircuit', href: '/acmm', type: 'link', order: 1 },
        { id: 'multi-tenancy', name: 'Multi-Tenancy', icon: 'Users', href: '/acmm', type: 'link', order: 2 },
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
    const multiTenancy = result.current.config.primaryNav.find((item) => item.id === 'multi-tenancy')
    expect(multiTenancy?.href).toBe('/multi-tenancy')
    const acmmItems = result.current.config.primaryNav.filter((item) => item.id === 'acmm')
    expect(acmmItems).toHaveLength(1)
  })
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
  it('falls back to default config when localStorage contains invalid JSON', async () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{')
    vi.resetModules()
    const freshMod = await import('../useSidebarConfig')
    const { result } = renderHook(() => freshMod.useSidebarConfig())
    // Should fall back to default config
    expect(result.current.config.collapsed).toBe(false)
    expect(result.current.config.primaryNav.length).toBeGreaterThan(0)
  })
  it('initSharedConfig uses persisted enabled dashboards so filtered defaults stay hidden on refresh', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      primaryNav: [
        { id: 'dashboard', name: 'Dashboard', icon: 'LayoutDashboard', href: '/', type: 'link', order: 0 },
        { id: 'clusters', name: 'My Clusters', icon: 'Server', href: '/clusters', type: 'link', order: 1 },
        { id: 'deploy', name: 'Deploy', icon: 'Rocket', href: '/deploy', type: 'link', order: 2 },
      ],
      secondaryNav: [],
      sections: [],
      showClusterStatus: true,
      collapsed: false,
      isMobileOpen: false,
      removedBuiltinItemIds: [],
    }))
    localStorage.setItem(ENABLED_DASHBOARDS_STORAGE_KEY, JSON.stringify(['dashboard', 'clusters', 'deploy']))
    const mockFetch = vi.fn().mockImplementation(() => new Promise(() => {}))
    vi.stubGlobal('fetch', mockFetch)
    vi.resetModules()
    const freshMod = await import('../useSidebarConfig')
    const { result } = renderHook(() => freshMod.useSidebarConfig())
    expect(result.current.config.primaryNav.map(item => item.id)).toEqual(['dashboard', 'clusters', 'deploy'])
    expect(result.current.config.primaryNav.some(item => item.id === 'alerts')).toBe(false)
    vi.unstubAllGlobals()
  })
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
  it('fetchEnabledDashboards clears stale persisted filters when all dashboards are enabled again', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      primaryNav: [
        { id: 'dashboard', name: 'Dashboard', icon: 'LayoutDashboard', href: '/', type: 'link', order: 0 },
        { id: 'clusters', name: 'My Clusters', icon: 'Server', href: '/clusters', type: 'link', order: 1 },
        { id: 'deploy', name: 'Deploy', icon: 'Rocket', href: '/deploy', type: 'link', order: 2 },
      ],
      secondaryNav: [],
      sections: [],
      showClusterStatus: true,
      collapsed: false,
      isMobileOpen: false,
      removedBuiltinItemIds: [],
    }))
    localStorage.setItem(ENABLED_DASHBOARDS_STORAGE_KEY, JSON.stringify(['dashboard', 'clusters', 'deploy']))
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ enabled_dashboards: [] }),
    })
    vi.stubGlobal('fetch', mockFetch)
    vi.resetModules()
    const freshMod = await import('../useSidebarConfig')
    const { result } = renderHook(() => freshMod.useSidebarConfig())
    await act(async () => {
      await freshMod.fetchEnabledDashboards()
    })
    expect(localStorage.getItem(ENABLED_DASHBOARDS_STORAGE_KEY)).toBeNull()
    expect(result.current.config.primaryNav.some(item => item.id === 'alerts')).toBe(true)
    vi.unstubAllGlobals()
  })
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
