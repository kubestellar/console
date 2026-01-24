import { useCallback, useSyncExternalStore } from 'react'

export interface SidebarItem {
  id: string
  name: string
  icon: string // Lucide icon name
  href: string
  type: 'link' | 'section' | 'card'
  children?: SidebarItem[]
  cardType?: string // For mini cards
  isCustom?: boolean
  order: number
}

export interface SidebarConfig {
  primaryNav: SidebarItem[]
  secondaryNav: SidebarItem[]
  sections: SidebarItem[]
  showClusterStatus: boolean
  collapsed: boolean
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

const DEFAULT_PRIMARY_NAV: SidebarItem[] = [
  { id: 'dashboard', name: 'Dashboard', icon: 'LayoutDashboard', href: '/', type: 'link', order: 0 },
  { id: 'clusters', name: 'Clusters', icon: 'Server', href: '/clusters', type: 'link', order: 1 },
  { id: 'workloads', name: 'Workloads', icon: 'Box', href: '/workloads', type: 'link', order: 2 },
  { id: 'compute', name: 'Compute', icon: 'Cpu', href: '/compute', type: 'link', order: 3 },
  { id: 'storage', name: 'Storage', icon: 'HardDrive', href: '/storage', type: 'link', order: 4 },
  { id: 'network', name: 'Network', icon: 'Globe', href: '/network', type: 'link', order: 5 },
  { id: 'events', name: 'Events', icon: 'Activity', href: '/events', type: 'link', order: 6 },
  { id: 'security', name: 'Security', icon: 'Shield', href: '/security', type: 'link', order: 7 },
  { id: 'security-posture', name: 'Security Posture', icon: 'ShieldCheck', href: '/security-posture', type: 'link', order: 8 },
  { id: 'data-compliance', name: 'Data Compliance', icon: 'Database', href: '/data-compliance', type: 'link', order: 9 },
  { id: 'gitops', name: 'GitOps', icon: 'GitBranch', href: '/gitops', type: 'link', order: 10 },
  { id: 'alerts', name: 'Alerts', icon: 'Bell', href: '/alerts', type: 'link', order: 11 },
]

const DEFAULT_SECONDARY_NAV: SidebarItem[] = [
  { id: 'history', name: 'Card History', icon: 'History', href: '/history', type: 'link', order: 0 },
  { id: 'namespaces', name: 'Namespaces', icon: 'Folder', href: '/namespaces', type: 'link', order: 1 },
  { id: 'users', name: 'User Management', icon: 'Users', href: '/users', type: 'link', order: 2 },
  { id: 'settings', name: 'Settings', icon: 'Settings', href: '/settings', type: 'link', order: 3 },
]

const DEFAULT_CONFIG: SidebarConfig = {
  primaryNav: DEFAULT_PRIMARY_NAV,
  secondaryNav: DEFAULT_SECONDARY_NAV,
  sections: [],
  showClusterStatus: true,
  collapsed: false,
}

const STORAGE_KEY = 'kubestellar-sidebar-config-v5'
const OLD_STORAGE_KEY = 'kubestellar-sidebar-config-v4'

// Routes to remove during migration (deprecated/removed routes)
const DEPRECATED_ROUTES = ['/apps']

// Migrate config to ensure all default routes exist
function migrateConfig(stored: SidebarConfig): SidebarConfig {
  // First, remove deprecated routes
  let primaryNav = stored.primaryNav.filter(item => !DEPRECATED_ROUTES.includes(item.href))
  let secondaryNav = stored.secondaryNav.filter(item => !DEPRECATED_ROUTES.includes(item.href))

  // Find default routes that are missing from the stored config
  const existingHrefs = new Set([
    ...primaryNav.map(item => item.href),
    ...secondaryNav.map(item => item.href),
  ])

  // Add missing default primary nav items
  const missingPrimaryItems = DEFAULT_PRIMARY_NAV.filter(
    item => !existingHrefs.has(item.href)
  )

  // Add missing default secondary nav items
  const missingSecondaryItems = DEFAULT_SECONDARY_NAV.filter(
    item => !existingHrefs.has(item.href)
  )

  // If there are missing items or deprecated routes were removed, update the config
  const deprecatedRemoved = primaryNav.length !== stored.primaryNav.length || secondaryNav.length !== stored.secondaryNav.length

  if (missingPrimaryItems.length > 0 || missingSecondaryItems.length > 0 || deprecatedRemoved) {
    return {
      ...stored,
      primaryNav: [
        ...primaryNav,
        ...missingPrimaryItems.map((item, idx) => ({
          ...item,
          order: primaryNav.length + idx,
        })),
      ],
      secondaryNav: [
        ...secondaryNav,
        ...missingSecondaryItems.map((item, idx) => ({
          ...item,
          order: secondaryNav.length + idx,
        })),
      ],
    }
  }

  return stored
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

  // Subscribe to shared state changes
  const config = useSyncExternalStore(subscribe, getSnapshot) || DEFAULT_CONFIG

  // Wrapper to update shared state
  const setConfig = useCallback((updater: SidebarConfig | ((prev: SidebarConfig) => SidebarConfig)) => {
    const newConfig = typeof updater === 'function' ? updater(sharedConfig || DEFAULT_CONFIG) : updater
    updateSharedConfig(newConfig)
  }, [])

  const addItem = useCallback((item: Omit<SidebarItem, 'id' | 'order'>, target: 'primary' | 'secondary' | 'sections') => {
    setConfig((prev) => {
      const newItem: SidebarItem = {
        ...item,
        id: `custom-${Date.now()}`,
        isCustom: true,
        order: target === 'primary'
          ? prev.primaryNav.length
          : target === 'secondary'
            ? prev.secondaryNav.length
            : prev.sections.length,
      }

      if (target === 'primary') {
        return { ...prev, primaryNav: [...prev.primaryNav, newItem] }
      } else if (target === 'secondary') {
        return { ...prev, secondaryNav: [...prev.secondaryNav, newItem] }
      } else {
        return { ...prev, sections: [...prev.sections, newItem] }
      }
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    setConfig((prev) => ({
      ...prev,
      primaryNav: prev.primaryNav.filter((item) => item.id !== id),
      secondaryNav: prev.secondaryNav.filter((item) => item.id !== id),
      sections: prev.sections.filter((item) => item.id !== id),
    }))
  }, [])

  const updateItem = useCallback((id: string, updates: Partial<SidebarItem>) => {
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
      ),
    }))
  }, [])

  const reorderItems = useCallback((items: SidebarItem[], target: 'primary' | 'secondary' | 'sections') => {
    setConfig((prev) => {
      if (target === 'primary') {
        return { ...prev, primaryNav: items }
      } else if (target === 'secondary') {
        return { ...prev, secondaryNav: items }
      } else {
        return { ...prev, sections: items }
      }
    })
  }, [])

  const toggleClusterStatus = useCallback(() => {
    setConfig((prev) => ({ ...prev, showClusterStatus: !prev.showClusterStatus }))
  }, [])

  const toggleCollapsed = useCallback(() => {
    setConfig((prev) => ({ ...prev, collapsed: !prev.collapsed }))
  }, [])

  const resetToDefault = useCallback(() => {
    setConfig(DEFAULT_CONFIG)
  }, [])

  const generateFromBehavior = useCallback((frequentlyUsedPaths: string[]) => {
    // Reorder items based on user's frequently visited paths
    setConfig((prev) => {
      const allItems = [...prev.primaryNav, ...prev.secondaryNav]

      // Find matching items for frequently used paths
      const reorderedPrimary: SidebarItem[] = []
      const usedIds = new Set<string>()

      // First, add items that match frequently used paths (in order of frequency)
      frequentlyUsedPaths.forEach((path) => {
        const matchingItem = allItems.find(
          (item) => item.href === path || path.startsWith(item.href + '/') || path.startsWith(item.href + '?')
        )
        if (matchingItem && !usedIds.has(matchingItem.id)) {
          reorderedPrimary.push({ ...matchingItem, order: reorderedPrimary.length })
          usedIds.add(matchingItem.id)
        }
      })

      // Then add remaining primary nav items
      prev.primaryNav.forEach((item) => {
        if (!usedIds.has(item.id)) {
          reorderedPrimary.push({ ...item, order: reorderedPrimary.length })
        }
      })

      // Keep secondary nav as-is but update order
      const reorderedSecondary = prev.secondaryNav.map((item, index) => ({
        ...item,
        order: index,
      }))

      return {
        ...prev,
        primaryNav: reorderedPrimary,
        secondaryNav: reorderedSecondary,
      }
    })
  }, [])

  return {
    config,
    addItem,
    removeItem,
    updateItem,
    reorderItems,
    toggleClusterStatus,
    toggleCollapsed,
    resetToDefault,
    generateFromBehavior,
  }
}

// Available icons for user to choose from
export const AVAILABLE_ICONS = [
  'LayoutDashboard', 'Server', 'Box', 'Activity', 'Shield', 'GitBranch',
  'History', 'Settings', 'Plus', 'Zap', 'Database', 'Cloud', 'Lock',
  'Key', 'Users', 'Bell', 'AlertTriangle', 'CheckCircle', 'XCircle',
  'RefreshCw', 'Search', 'Filter', 'Layers', 'Globe', 'Terminal',
  'Code', 'Cpu', 'HardDrive', 'Wifi', 'Monitor', 'Folder',
]
