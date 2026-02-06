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
  // Priority dashboards at the top
  { id: 'dashboard', name: 'Dashboard', icon: 'LayoutDashboard', href: '/', type: 'link', order: 0 },
  { id: 'clusters', name: 'My Clusters', icon: 'Server', href: '/clusters', type: 'link', order: 1 },
  { id: 'deploy', name: 'Deploy', icon: 'Rocket', href: '/deploy', type: 'link', order: 2 },
  { id: 'ai-ml', name: 'AI/ML', icon: 'Sparkles', href: '/ai-ml', type: 'link', order: 3 },
  { id: 'ci-cd', name: 'CI/CD', icon: 'GitMerge', href: '/ci-cd', type: 'link', order: 4 },
  // All other dashboards (alphabetical)
  { id: 'alerts', name: 'Alerts', icon: 'Bell', href: '/alerts', type: 'link', order: 5 },
  { id: 'arcade', name: 'Arcade', icon: 'Gamepad2', href: '/arcade', type: 'link', order: 6 },
  { id: 'compliance', name: 'Compliance', icon: 'ClipboardCheck', href: '/compliance', type: 'link', order: 7 },
  { id: 'compute', name: 'Compute', icon: 'Monitor', href: '/compute', type: 'link', order: 8 },
  { id: 'cost', name: 'Cost', icon: 'DollarSign', href: '/cost', type: 'link', order: 9 },
  { id: 'data-compliance', name: 'Data Compliance', icon: 'Database', href: '/data-compliance', type: 'link', order: 10 },
  { id: 'deployments', name: 'Deployments', icon: 'Layers', href: '/deployments', type: 'link', order: 11 },
  { id: 'events', name: 'Events', icon: 'Activity', href: '/events', type: 'link', order: 12 },
  { id: 'gitops', name: 'GitOps', icon: 'GitBranch', href: '/gitops', type: 'link', order: 13 },
  { id: 'gpu-reservations', name: 'GPU Reservations', icon: 'Cpu', href: '/gpu-reservations', type: 'link', order: 14 },
  { id: 'helm', name: 'Helm', icon: 'Package', href: '/helm', type: 'link', order: 15 },
  { id: 'logs', name: 'Logs', icon: 'FileText', href: '/logs', type: 'link', order: 16 },
  { id: 'network', name: 'Network', icon: 'Globe', href: '/network', type: 'link', order: 17 },
  { id: 'nodes', name: 'Nodes', icon: 'CircuitBoard', href: '/nodes', type: 'link', order: 18 },
  { id: 'operators', name: 'Operators', icon: 'Cog', href: '/operators', type: 'link', order: 19 },
  { id: 'pods', name: 'Pods', icon: 'Hexagon', href: '/pods', type: 'link', order: 20 },
  { id: 'security', name: 'Security', icon: 'Shield', href: '/security', type: 'link', order: 21 },
  { id: 'security-posture', name: 'Security Posture', icon: 'ShieldCheck', href: '/security-posture', type: 'link', order: 22 },
  { id: 'services', name: 'Services', icon: 'Network', href: '/services', type: 'link', order: 23 },
  { id: 'storage', name: 'Storage', icon: 'HardDrive', href: '/storage', type: 'link', order: 24 },
  { id: 'workloads', name: 'Workloads', icon: 'Box', href: '/workloads', type: 'link', order: 25 },
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
  isMobileOpen: false,
}

const STORAGE_KEY = 'kubestellar-sidebar-config-v8'
const OLD_STORAGE_KEY = 'kubestellar-sidebar-config-v7'

// Routes to remove during migration (deprecated/removed routes)
const DEPRECATED_ROUTES = ['/apps']

// Migrate config to ensure all default routes exist
function migrateConfig(stored: SidebarConfig): SidebarConfig {
  // First, remove deprecated routes
  const primaryNav = stored.primaryNav.filter(item => !DEPRECATED_ROUTES.includes(item.href))
  const secondaryNav = stored.secondaryNav.filter(item => !DEPRECATED_ROUTES.includes(item.href))

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
      // Generate unique ID using timestamp + random string to avoid collisions when adding multiple items
      const uniqueId = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const newItem: SidebarItem = {
        ...item,
        id: uniqueId,
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

  // Add multiple items at once to avoid React batching issues
  const addItems = useCallback((items: Array<{ item: Omit<SidebarItem, 'id' | 'order'>, target: 'primary' | 'secondary' | 'sections' }>) => {
    setConfig((prev) => {
      let newPrimaryNav = [...prev.primaryNav]
      let newSecondaryNav = [...prev.secondaryNav]
      let newSections = [...prev.sections]

      items.forEach(({ item, target }) => {
        const uniqueId = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const newItem: SidebarItem = {
          ...item,
          id: uniqueId,
          isCustom: true,
          order: target === 'primary'
            ? newPrimaryNav.length
            : target === 'secondary'
              ? newSecondaryNav.length
              : newSections.length,
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

  const openMobileSidebar = useCallback(() => {
    setConfig((prev) => ({ ...prev, isMobileOpen: true }))
  }, [])

  const closeMobileSidebar = useCallback(() => {
    setConfig((prev) => ({ ...prev, isMobileOpen: false }))
  }, [])

  const toggleMobileSidebar = useCallback(() => {
    setConfig((prev) => ({ ...prev, isMobileOpen: !prev.isMobileOpen }))
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
    addItems,
    removeItem,
    updateItem,
    reorderItems,
    toggleClusterStatus,
    toggleCollapsed,
    openMobileSidebar,
    closeMobileSidebar,
    toggleMobileSidebar,
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
  'Code', 'Cpu', 'HardDrive', 'Wifi', 'Monitor', 'Folder', 'Gamepad2',
  'Sparkles', 'GitMerge', 'Rocket', 'ShieldCheck', 'ClipboardCheck',
  'DollarSign', 'Package', 'FileText', 'CircuitBoard', 'Cog', 'Hexagon', 'Network',
]
