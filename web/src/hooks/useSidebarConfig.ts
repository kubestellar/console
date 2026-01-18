import { useState, useEffect, useCallback } from 'react'

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

const DEFAULT_PRIMARY_NAV: SidebarItem[] = [
  { id: 'dashboard', name: 'Dashboard', icon: 'LayoutDashboard', href: '/', type: 'link', order: 0 },
  { id: 'clusters', name: 'Clusters', icon: 'Server', href: '/clusters', type: 'link', order: 1 },
  { id: 'applications', name: 'Applications', icon: 'Box', href: '/apps', type: 'link', order: 2 },
  { id: 'events', name: 'Events', icon: 'Activity', href: '/events', type: 'link', order: 3 },
  { id: 'security', name: 'Security', icon: 'Shield', href: '/security', type: 'link', order: 4 },
  { id: 'gitops', name: 'GitOps', icon: 'GitBranch', href: '/gitops', type: 'link', order: 5 },
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

const STORAGE_KEY = 'kubestellar-sidebar-config'

export function useSidebarConfig() {
  const [config, setConfig] = useState<SidebarConfig>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        return JSON.parse(stored)
      } catch {
        return DEFAULT_CONFIG
      }
    }
    return DEFAULT_CONFIG
  })

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  }, [config])

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
