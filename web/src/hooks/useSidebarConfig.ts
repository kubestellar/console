import { useSyncExternalStore, useCallback } from 'react'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { setActiveProject } from '../lib/project/context'
import { setQuantumWorkloadAvailable } from '../lib/demoMode'
import { NAVIGATION_ICONS } from '../lib/navigationIcons'

/** Width of the collapsed sidebar in pixels (w-20 = 5rem = 80px) */
export const SIDEBAR_COLLAPSED_WIDTH_PX = 80
/** Default width of the expanded sidebar in pixels (w-64 = 16rem = 256px) */
export const SIDEBAR_DEFAULT_WIDTH_PX = 256

export interface SidebarItem {
  id: string
  name: string
  icon: string // Lucide icon name
  href: string
  type: 'link' | 'section' | 'card'
  children?: SidebarItem[]
  cardType?: string // For mini cards
  isCustom?: boolean
  description?: string
  order: number
}

export interface SidebarConfig {
  primaryNav: SidebarItem[]
  secondaryNav: SidebarItem[]
  sections: SidebarItem[]
  showClusterStatus: boolean
  collapsed: boolean
  isMobileOpen: boolean
  removedBuiltinItemIds: string[]
  width?: number
}

// Shared state store for sidebar config
let sharedConfig: SidebarConfig | null = null
const listeners = new Set<() => void>()

function notifyListeners() {
  listeners.forEach(listener => listener())
}

function getSnapshot(): SidebarConfig | null {
  return sharedConfig
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Core dashboards shown in sidebar by default (reduced from 28 to 9 to cut clutter)
export const DEFAULT_PRIMARY_NAV: SidebarItem[] = [
  { id: 'dashboard', name: 'Dashboard', icon: NAVIGATION_ICONS['dashboard'], href: '/', type: 'link', order: 0 },
  { id: 'clusters', name: 'My Clusters', icon: NAVIGATION_ICONS['clusters'], href: '/clusters', type: 'link', order: 1 },
  { id: 'cluster-admin', name: 'Cluster Admin', icon: NAVIGATION_ICONS['cluster-admin'], href: '/cluster-admin', type: 'link', order: 2 },
  { id: 'compliance', name: 'Sec. Compliance', icon: NAVIGATION_ICONS['compliance'], href: '/compliance', type: 'link', order: 2.5 },
  { id: 'enterprise', name: 'Enterprise', icon: NAVIGATION_ICONS['enterprise'], href: '/enterprise', type: 'link', order: 2.7 },
  { id: 'deploy', name: 'Deploy', icon: NAVIGATION_ICONS['deploy'], href: '/deploy', type: 'link', order: 3 },
  { id: 'insights', name: 'Insights', icon: NAVIGATION_ICONS['insights'], href: '/insights', type: 'link', order: 3.5 },
  { id: 'ai-ml', name: 'AI/ML', icon: NAVIGATION_ICONS['ai-ml'], href: '/ai-ml', type: 'link', order: 4 },
  { id: 'ai-agents', name: 'AI Agents', icon: NAVIGATION_ICONS['ai-agents'], href: '/ai-agents', type: 'link', order: 5 },
  { id: 'ci-cd', name: 'CI/CD', icon: NAVIGATION_ICONS['ci-cd'], href: '/ci-cd', type: 'link', order: 5.5 },
  { id: 'acmm', name: 'ACMM', icon: NAVIGATION_ICONS['acmm'], href: '/acmm', type: 'link', order: 6 },
  { id: 'multi-tenancy', name: 'Multi-Tenancy', icon: NAVIGATION_ICONS['multi-tenancy'], href: '/multi-tenancy', type: 'link', order: 6.5 },
  { id: 'alerts', name: 'Alerts', icon: NAVIGATION_ICONS['alerts'], href: '/alerts', type: 'link', order: 7 },
  { id: 'arcade', name: 'Arcade', icon: NAVIGATION_ICONS['arcade'], href: '/arcade', type: 'link', order: 8 },
]

/**
 * Dashboards available for discovery but NOT shown in the sidebar by default.
 * Surfaced in the "Recommended Dashboards" section of the customize modal.
 * Users can add any of these to their sidebar via the customizer.
 */
export const DISCOVERABLE_DASHBOARDS: SidebarItem[] = [
  { id: 'quantum', name: 'Quantum Demo', icon: NAVIGATION_ICONS['quantum'], href: '/quantum', type: 'link', order: 0 },
  { id: 'compute', name: 'Compute', icon: NAVIGATION_ICONS['compute'], href: '/compute', type: 'link', order: 1 },
  { id: 'cost', name: 'Cost', icon: NAVIGATION_ICONS['cost'], href: '/cost', type: 'link', order: 2 },
  { id: 'data-compliance', name: 'Data Compliance', icon: NAVIGATION_ICONS['data-compliance'], href: '/data-compliance', type: 'link', order: 3 },
  { id: 'deployments', name: 'Deployments', icon: NAVIGATION_ICONS['deployments'], href: '/deployments', type: 'link', order: 4 },
  { id: 'events', name: 'Events', icon: NAVIGATION_ICONS['events'], href: '/events', type: 'link', order: 5 },
  { id: 'gitops', name: 'GitOps', icon: NAVIGATION_ICONS['gitops'], href: '/gitops', type: 'link', order: 6 },
  { id: 'gpu-reservations', name: 'GPU Reservations', icon: NAVIGATION_ICONS['gpu-reservations'], href: '/gpu-reservations', type: 'link', order: 7 },
  { id: 'karmada-ops', name: 'Karmada Ops', icon: NAVIGATION_ICONS['karmada-ops'], href: '/karmada-ops', type: 'link', order: 8 },
  { id: 'helm', name: 'Helm', icon: NAVIGATION_ICONS['helm'], href: '/helm', type: 'link', order: 8 },
  { id: 'llm-d-benchmarks', name: 'llm-d Benchmarks', icon: NAVIGATION_ICONS['llm-d-benchmarks'], href: '/llm-d-benchmarks', type: 'link', order: 9 },
  { id: 'logs', name: 'Logs', icon: NAVIGATION_ICONS['logs'], href: '/logs', type: 'link', order: 10 },
  { id: 'network', name: 'Network', icon: NAVIGATION_ICONS['network'], href: '/network', type: 'link', order: 11 },
  { id: 'nodes', name: 'Nodes', icon: NAVIGATION_ICONS['nodes'], href: '/nodes', type: 'link', order: 12 },
  { id: 'operators', name: 'Operators', icon: NAVIGATION_ICONS['operators'], href: '/operators', type: 'link', order: 13 },
  { id: 'pods', name: 'Pods', icon: NAVIGATION_ICONS['pods'], href: '/pods', type: 'link', order: 14 },
  { id: 'security', name: 'Security', icon: NAVIGATION_ICONS['security'], href: '/security', type: 'link', order: 15 },
  { id: 'security-posture', name: 'Security Posture', icon: NAVIGATION_ICONS['security-posture'], href: '/security-posture', type: 'link', order: 16 },
  { id: 'services', name: 'Services', icon: NAVIGATION_ICONS['services'], href: '/services', type: 'link', order: 17 },
  { id: 'storage', name: 'Storage', icon: NAVIGATION_ICONS['storage'], href: '/storage', type: 'link', order: 18 },
  { id: 'workloads', name: 'Workloads', icon: NAVIGATION_ICONS['workloads'], href: '/workloads', type: 'link', order: 19 },
]

const DEFAULT_SECONDARY_NAV: SidebarItem[] = [
  { id: 'marketplace', name: 'Marketplace', icon: NAVIGATION_ICONS['marketplace'], href: '/marketplace', type: 'link', order: 0 },
  { id: 'history', name: 'Card History', icon: NAVIGATION_ICONS['history'], href: '/history', type: 'link', order: 1 },
  { id: 'namespaces', name: 'Namespaces', icon: NAVIGATION_ICONS['namespaces'], href: '/namespaces', type: 'link', order: 2 },
  { id: 'users', name: 'User Management', icon: NAVIGATION_ICONS['users'], href: '/users', type: 'link', order: 3 },
  { id: 'settings', name: 'Settings', icon: NAVIGATION_ICONS['settings'], href: '/settings', type: 'link', order: 4 },
]

const DEFAULT_CONFIG: SidebarConfig = {
  primaryNav: DEFAULT_PRIMARY_NAV,
  secondaryNav: DEFAULT_SECONDARY_NAV,
  sections: [],
  showClusterStatus: true,
  collapsed: false,
  isMobileOpen: false,
  removedBuiltinItemIds: [] }

const STORAGE_KEY = 'kubestellar-sidebar-config-v11'
const OLD_STORAGE_KEY = 'kubestellar-sidebar-config-v10'
const BUILTIN_NAV_ITEMS = [...DEFAULT_PRIMARY_NAV, ...DEFAULT_SECONDARY_NAV, ...DISCOVERABLE_DASHBOARDS]
const BUILTIN_NAV_ITEMS_BY_HREF = new Map(BUILTIN_NAV_ITEMS.map((item) => [item.href, item]))
const BUILTIN_NAV_ITEM_IDS = new Set(BUILTIN_NAV_ITEMS.map((item) => item.id))

// Routes to remove during migration (deprecated/removed routes)
const DEPRECATED_ROUTES = ['/apps']

// Server-side dashboard filter (fetched from /health endpoint)
// Stored as array (not Set) to preserve ordering from the env var
let enabledDashboardIds: string[] | null = null // null = show all
let enabledDashboardsFetched = false

// IDs that cannot be removed by the user
export const PROTECTED_SIDEBAR_IDS = ['dashboard', 'clusters', 'deploy']

export function getEnabledDashboardIds(): string[] | null {
  return enabledDashboardIds
}

function getRemovedBuiltinItemIds(config: Partial<SidebarConfig>): string[] {
  return Array.isArray(config.removedBuiltinItemIds)
    ? config.removedBuiltinItemIds.filter((id): id is string => typeof id === 'string')
    : []
}

function normalizeConfig(config: Partial<SidebarConfig>): SidebarConfig {
  return {
    primaryNav: Array.isArray(config.primaryNav) ? config.primaryNav : DEFAULT_PRIMARY_NAV,
    secondaryNav: Array.isArray(config.secondaryNav) ? config.secondaryNav : DEFAULT_SECONDARY_NAV,
    sections: Array.isArray(config.sections) ? config.sections : [],
    showClusterStatus: config.showClusterStatus ?? true,
    collapsed: config.collapsed ?? false,
    isMobileOpen: config.isMobileOpen ?? false,
    removedBuiltinItemIds: getRemovedBuiltinItemIds(config),
    width: config.width,
  }
}

function buildSidebarItem(
  item: Omit<SidebarItem, 'id' | 'order'>,
  order: number
): SidebarItem {
  const builtinItem = BUILTIN_NAV_ITEMS_BY_HREF.get(item.href)

  if (builtinItem) {
    return {
      ...builtinItem,
      name: item.name,
      icon: item.icon,
      type: item.type,
      cardType: item.cardType,
      description: item.description,
      order,
    }
  }

  return {
    ...item,
    id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    isCustom: true,
    order,
  }
}

function applyDashboardFilter(config: SidebarConfig): SidebarConfig {
  if (!enabledDashboardIds) return config
  const removedBuiltinItemIds = new Set(config.removedBuiltinItemIds)
  const enabledSet = new Set(enabledDashboardIds)
  const existingIds = new Set(config.primaryNav.map(item => item.id))

  // Promote discoverable dashboards into primaryNav when ENABLED_DASHBOARDS includes them
  const promoted = DISCOVERABLE_DASHBOARDS.filter(
    item => enabledSet.has(item.id) && !existingIds.has(item.id) && !removedBuiltinItemIds.has(item.id)
  )

  const combined = [...config.primaryNav, ...promoted]
  const filtered = combined.filter(
    item => item.isCustom || enabledSet.has(item.id)
  )
  // Sort filtered items to match the order specified in ENABLED_DASHBOARDS
  filtered.sort((a, b) => {
    if (a.isCustom && b.isCustom) return a.order - b.order
    if (a.isCustom) return 1 // custom items go after enabled ones
    if (b.isCustom) return -1
    const idxA = enabledDashboardIds!.indexOf(a.id)
    const idxB = enabledDashboardIds!.indexOf(b.id)
    return idxA - idxB
  })
  // Re-assign order numbers after sorting
  const reordered = filtered.map((item, idx) => ({ ...item, order: idx }))
  return {
    ...config,
    primaryNav: reordered }
}

export async function fetchEnabledDashboards(): Promise<void> {
  if (enabledDashboardsFetched) return
  enabledDashboardsFetched = true
  try {
    const resp = await fetch('/health', { signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
    const data = await resp.json()

    // Set active project context for white-label filtering
    if (data.project && typeof data.project === 'string') {
      setActiveProject(data.project)
    }

    // Set quantum workload availability (auto-locks demo mode if not available)
    if (data.workloads && typeof data.workloads.quantum_kc_demo_available === 'boolean') {
      setQuantumWorkloadAvailable(data.workloads.quantum_kc_demo_available)
    }

    if (data.enabled_dashboards && Array.isArray(data.enabled_dashboards) && data.enabled_dashboards.length > 0) {
      enabledDashboardIds = data.enabled_dashboards as string[]
      if (sharedConfig) {
        sharedConfig = applyDashboardFilter(sharedConfig)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sharedConfig))
        notifyListeners()
      }
    }
  } catch {
    // Ignore — show all dashboards if health check fails
  }
}

// Migrate config to ensure all default routes exist.
// By design, new routes added to DEFAULT_PRIMARY_NAV (e.g. /acmm) are
// automatically appended to any stored sidebar config that lacks them,
// so existing users pick up new dashboards without resetting their layout.
function migrateConfig(stored: SidebarConfig): SidebarConfig {
  const normalized = normalizeConfig(stored)

  // First, remove deprecated routes
  const primaryNav = normalized.primaryNav.filter(item => !DEPRECATED_ROUTES.includes(item.href))
  const secondaryNav = normalized.secondaryNav.filter(item => !DEPRECATED_ROUTES.includes(item.href))
  const removedBuiltinItemIds = new Set(normalized.removedBuiltinItemIds)

  // Find default routes that are missing from the stored config
  const existingHrefs = new Set([
    ...primaryNav.map(item => item.href),
    ...secondaryNav.map(item => item.href),
  ])

  // Add missing default primary nav items unless the user explicitly removed them
  const missingPrimaryItems = DEFAULT_PRIMARY_NAV.filter(
    item => !existingHrefs.has(item.href) && !removedBuiltinItemIds.has(item.id)
  )

  // Add missing default secondary nav items unless the user explicitly removed them
  const missingSecondaryItems = DEFAULT_SECONDARY_NAV.filter(
    item => !existingHrefs.has(item.href) && !removedBuiltinItemIds.has(item.id)
  )

  // If there are missing items or deprecated routes were removed, update the config
  const deprecatedRemoved = primaryNav.length !== normalized.primaryNav.length || secondaryNav.length !== normalized.secondaryNav.length
  const configWasNormalized = normalized.removedBuiltinItemIds.length !== getRemovedBuiltinItemIds(stored).length
    || !Array.isArray(stored.removedBuiltinItemIds)

  if (missingPrimaryItems.length > 0 || missingSecondaryItems.length > 0 || deprecatedRemoved || configWasNormalized) {
    return {
      ...normalized,
      primaryNav: [
        ...primaryNav,
        ...missingPrimaryItems.map((item, idx) => ({
          ...item,
          order: primaryNav.length + idx })),
      ],
      secondaryNav: [
        ...secondaryNav,
        ...missingSecondaryItems.map((item, idx) => ({
          ...item,
          order: secondaryNav.length + idx })),
      ] }
  }

  return normalized
}

// Initialize shared config from localStorage (called once)
function initSharedConfig(): SidebarConfig {
  if (sharedConfig) return sharedConfig

  // Try to load from current storage key
  let stored = localStorage.getItem(STORAGE_KEY)

  // Migrate from old storage key if needed
  if (!stored) {
    const oldStored = localStorage.getItem(OLD_STORAGE_KEY)
    if (oldStored) {
      stored = oldStored
      // Remove old key after migration
      localStorage.removeItem(OLD_STORAGE_KEY)
    }
  }

  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      // Migrate config to ensure all default routes exist
      sharedConfig = migrateConfig(parsed)
    } catch {
      sharedConfig = DEFAULT_CONFIG
    }
  } else {
    sharedConfig = DEFAULT_CONFIG
  }

  // Apply server-side dashboard filter if already fetched
  if (enabledDashboardIds) {
    sharedConfig = applyDashboardFilter(sharedConfig)
  }

  return sharedConfig
}

// Update shared config and notify all listeners
function updateSharedConfig(newConfig: SidebarConfig) {
  sharedConfig = newConfig
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig))
  notifyListeners()
}

export function useSidebarConfig() {
  // Initialize on first use
  if (!sharedConfig) {
    initSharedConfig()
  }

  // Fetch server-side dashboard filter (once, async)
  if (!enabledDashboardsFetched) {
    fetchEnabledDashboards()
  }

  // Subscribe to shared state changes
  const config = useSyncExternalStore(subscribe, getSnapshot) || DEFAULT_CONFIG

  // Wrapper to update shared state
  const setConfig = (updater: SidebarConfig | ((prev: SidebarConfig) => SidebarConfig)) => {
    const newConfig = typeof updater === 'function' ? updater(sharedConfig || DEFAULT_CONFIG) : updater
    updateSharedConfig(newConfig)
  }

  const addItem = (item: Omit<SidebarItem, 'id' | 'order'>, target: 'primary' | 'secondary' | 'sections') => {
    setConfig((prev) => {
      const newItem = buildSidebarItem(
        item,
        target === 'primary'
          ? prev.primaryNav.length
          : target === 'secondary'
            ? prev.secondaryNav.length
            : prev.sections.length
      )
      const removedBuiltinItemIds = BUILTIN_NAV_ITEM_IDS.has(newItem.id)
        ? prev.removedBuiltinItemIds.filter((removedId) => removedId !== newItem.id)
        : prev.removedBuiltinItemIds

      if (target === 'primary') {
        return { ...prev, primaryNav: [...prev.primaryNav, newItem], removedBuiltinItemIds }
      } else if (target === 'secondary') {
        return { ...prev, secondaryNav: [...prev.secondaryNav, newItem], removedBuiltinItemIds }
      } else {
        return { ...prev, sections: [...prev.sections, newItem], removedBuiltinItemIds }
      }
    })
  }

  // Add multiple items at once to avoid React batching issues
  const addItems = (items: Array<{ item: Omit<SidebarItem, 'id' | 'order'>, target: 'primary' | 'secondary' | 'sections' }>) => {
    setConfig((prev) => {
      let newPrimaryNav = [...prev.primaryNav]
      let newSecondaryNav = [...prev.secondaryNav]
      let newSections = [...prev.sections]

      let removedBuiltinItemIds = [...prev.removedBuiltinItemIds]

      items.forEach(({ item, target }) => {
        const newItem = buildSidebarItem(
          item,
          target === 'primary'
            ? newPrimaryNav.length
            : target === 'secondary'
              ? newSecondaryNav.length
              : newSections.length
        )

        if (BUILTIN_NAV_ITEM_IDS.has(newItem.id)) {
          removedBuiltinItemIds = removedBuiltinItemIds.filter((removedId) => removedId !== newItem.id)
        }

        if (target === 'primary') {
          newPrimaryNav = [...newPrimaryNav, newItem]
        } else if (target === 'secondary') {
          newSecondaryNav = [...newSecondaryNav, newItem]
        } else {
          newSections = [...newSections, newItem]
        }
      })

      return {
        ...prev,
        primaryNav: newPrimaryNav,
        secondaryNav: newSecondaryNav,
        sections: newSections,
        removedBuiltinItemIds }
    })
  }

  const removeItem = (id: string) => {
    setConfig((prev) => {
      const removedItem = [...prev.primaryNav, ...prev.secondaryNav, ...prev.sections].find((item) => item.id === id)
      const removedBuiltinItemIds = BUILTIN_NAV_ITEM_IDS.has(id) && removedItem && !removedItem.isCustom
        ? Array.from(new Set([...prev.removedBuiltinItemIds, id]))
        : prev.removedBuiltinItemIds

      return {
        ...prev,
        primaryNav: prev.primaryNav.filter((item) => item.id !== id),
        secondaryNav: prev.secondaryNav.filter((item) => item.id !== id),
        sections: prev.sections.filter((item) => item.id !== id),
        removedBuiltinItemIds,
      }
    })
  }

  const updateItem = (id: string, updates: Partial<SidebarItem>) => {
    setConfig((prev) => ({
      ...prev,
      primaryNav: prev.primaryNav.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
      secondaryNav: prev.secondaryNav.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
      sections: prev.sections.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ) }))
  }

  const reorderItems = (items: SidebarItem[], target: 'primary' | 'secondary' | 'sections') => {
    setConfig((prev) => {
      if (target === 'primary') {
        return { ...prev, primaryNav: items }
      } else if (target === 'secondary') {
        return { ...prev, secondaryNav: items }
      } else {
        return { ...prev, sections: items }
      }
    })
  }

  const toggleClusterStatus = () => {
    setConfig((prev) => ({ ...prev, showClusterStatus: !prev.showClusterStatus }))
  }

  const setWidth = (width: number) => {
    setConfig((prev) => ({ ...prev, width }))
  }

  const toggleCollapsed = () => {
    setConfig((prev) => ({ ...prev, collapsed: !prev.collapsed }))
  }

  const setCollapsed = (collapsed: boolean) => {
    setConfig((prev) => ({ ...prev, collapsed }))
  }

  const openMobileSidebar = useCallback(() => {
    updateSharedConfig({ ...(sharedConfig || DEFAULT_CONFIG), isMobileOpen: true })
  }, [])

  const closeMobileSidebar = useCallback(() => {
    updateSharedConfig({ ...(sharedConfig || DEFAULT_CONFIG), isMobileOpen: false })
  }, [])

  const toggleMobileSidebar = useCallback(() => {
    const prev = sharedConfig || DEFAULT_CONFIG
    updateSharedConfig({ ...prev, isMobileOpen: !prev.isMobileOpen })
  }, [])

  // Add a discoverable dashboard to the sidebar with its original ID (not a generated custom ID)
  const restoreDashboard = (dashboard: SidebarItem) => {
    setConfig((prev) => {
      // Skip if already present
      if (prev.primaryNav.some((item) => item.id === dashboard.id)) return prev
      const newItem: SidebarItem = {
        ...dashboard,
        order: prev.primaryNav.length }
      const removedBuiltinItemIds = prev.removedBuiltinItemIds.filter((removedId) => removedId !== dashboard.id)
      return { ...prev, primaryNav: [...prev.primaryNav, newItem], removedBuiltinItemIds }
    })
  }

  const resetToDefault = () => {
    setConfig(applyDashboardFilter(DEFAULT_CONFIG))
  }

  /**
   * Preview what generateFromBehavior would change — returns proposed
   * config without applying it, so the UI can show a diff.
   */
  const previewGenerateFromBehavior = useCallback((frequentlyUsedPaths: string[]): { proposed: SidebarConfig; changes: string[] } => {
    const allItems = [...config.primaryNav, ...config.secondaryNav]
    const reorderedPrimary: SidebarItem[] = []
    const usedIds = new Set<string>()

    frequentlyUsedPaths.forEach((path) => {
      const matchingItem = allItems.find(
        (item) => item.href === path || path.startsWith(item.href + '/') || path.startsWith(item.href + '?')
      )
      if (matchingItem && !usedIds.has(matchingItem.id)) {
        reorderedPrimary.push({ ...matchingItem, order: reorderedPrimary.length })
        usedIds.add(matchingItem.id)
      }
    })

    config.primaryNav.forEach((item) => {
      if (!usedIds.has(item.id)) {
        reorderedPrimary.push({ ...item, order: reorderedPrimary.length })
      }
    })

    const reorderedSecondary = config.secondaryNav.map((item, index) => ({
      ...item,
      order: index,
    }))

    const changes: string[] = []
    reorderedPrimary.forEach((item, i) => {
      const oldIdx = config.primaryNav.findIndex(p => p.id === item.id)
      if (oldIdx === -1) {
        changes.push(`+ Added "${item.name}"`)
      } else if (oldIdx !== i) {
        changes.push(`\u2195 Moved "${item.name}" from #${oldIdx + 1} to #${i + 1}`)
      }
    })
    if (changes.length === 0) changes.push('No changes needed')

    return {
      proposed: { ...config, primaryNav: reorderedPrimary, secondaryNav: reorderedSecondary },
      changes,
    }
  }, [config])

  const applyGeneratedConfig = useCallback((proposed: SidebarConfig) => {
    setConfig(proposed)
  }, [])

  const generateFromBehavior = useCallback((frequentlyUsedPaths: string[]) => {
    const { proposed } = previewGenerateFromBehavior(frequentlyUsedPaths)
    setConfig(proposed)
  }, [previewGenerateFromBehavior])

  return {
    config,
    addItem,
    addItems,
    removeItem,
    updateItem,
    reorderItems,
    restoreDashboard,
    toggleClusterStatus,
    setWidth,
    toggleCollapsed,
    setCollapsed,
    openMobileSidebar,
    closeMobileSidebar,
    toggleMobileSidebar,
    resetToDefault,
    generateFromBehavior,
    previewGenerateFromBehavior,
    applyGeneratedConfig,
  }
}

// Available icons for user to choose from
export const AVAILABLE_ICONS = [
  'LayoutDashboard', 'Server', 'Box', 'Activity', 'Shield', 'GitBranch',
  'History', 'Settings', 'Plus', 'Zap', 'Database', 'Cloud', 'Lock',
  'Key', 'Users', 'Bell', 'AlertTriangle', 'CheckCircle', 'XCircle',
  'RefreshCw', 'Search', 'Filter', 'Layers', 'Globe', 'Terminal',
  'Code', 'Cpu', 'HardDrive', 'Wifi', 'Monitor', 'Folder', 'Gamepad2', 'Bot',
  'Sparkles', 'GitMerge', 'Rocket', 'ShieldCheck', 'ClipboardCheck', 'Lightbulb',
  'DollarSign', 'Package', 'FileText', 'CircuitBoard', 'Cog', 'Hexagon', 'Network',
]
