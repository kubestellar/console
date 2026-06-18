import { useCallback, useSyncExternalStore } from 'react'
import {
  BUILTIN_NAV_ITEM_IDS,
  DEFAULT_CONFIG,
  type SidebarConfig,
  type SidebarItem,
} from './constants'
import {
  applyDashboardFilter,
  buildSidebarItem,
  fetchEnabledDashboards,
  getSnapshot,
  initSharedConfig,
  subscribe,
  updateSharedConfig,
} from './store'

export function useSidebarConfig() {
  if (!getSnapshot()) {
    initSharedConfig()
  }
  void fetchEnabledDashboards()

  const config = useSyncExternalStore(subscribe, getSnapshot) || DEFAULT_CONFIG
  const setConfig = (updater: SidebarConfig | ((prev: SidebarConfig) => SidebarConfig)) => {
    const current = getSnapshot() || DEFAULT_CONFIG
    const nextConfig = typeof updater === 'function' ? updater(current) : updater
    updateSharedConfig(nextConfig)
  }

  const addItem = (item: Omit<SidebarItem, 'id' | 'order'>, target: 'primary' | 'secondary' | 'sections') => {
    setConfig(prev => {
      const newItem = buildSidebarItem(item, target === 'primary' ? prev.primaryNav.length : target === 'secondary' ? prev.secondaryNav.length : prev.sections.length)
      const removedBuiltinItemIds = BUILTIN_NAV_ITEM_IDS.has(newItem.id) ? prev.removedBuiltinItemIds.filter(id => id !== newItem.id) : prev.removedBuiltinItemIds
      if (target === 'primary') return { ...prev, primaryNav: [...prev.primaryNav, newItem], removedBuiltinItemIds }
      if (target === 'secondary') return { ...prev, secondaryNav: [...prev.secondaryNav, newItem], removedBuiltinItemIds }
      return { ...prev, sections: [...prev.sections, newItem], removedBuiltinItemIds }
    })
  }

  const addItems = (items: Array<{ item: Omit<SidebarItem, 'id' | 'order'>; target: 'primary' | 'secondary' | 'sections' }>) => {
    setConfig(prev => {
      let newPrimaryNav = [...prev.primaryNav]
      let newSecondaryNav = [...prev.secondaryNav]
      let newSections = [...prev.sections]
      let removedBuiltinItemIds = [...prev.removedBuiltinItemIds]

      items.forEach(({ item, target }) => {
        const newItem = buildSidebarItem(item, target === 'primary' ? newPrimaryNav.length : target === 'secondary' ? newSecondaryNav.length : newSections.length)
        if (BUILTIN_NAV_ITEM_IDS.has(newItem.id)) {
          removedBuiltinItemIds = removedBuiltinItemIds.filter(id => id !== newItem.id)
        }
        if (target === 'primary') newPrimaryNav = [...newPrimaryNav, newItem]
        else if (target === 'secondary') newSecondaryNav = [...newSecondaryNav, newItem]
        else newSections = [...newSections, newItem]
      })

      return { ...prev, primaryNav: newPrimaryNav, secondaryNav: newSecondaryNav, sections: newSections, removedBuiltinItemIds }
    })
  }

  const removeItem = (id: string) => {
    setConfig(prev => {
      const removedItem = [...prev.primaryNav, ...prev.secondaryNav, ...prev.sections].find(item => item.id === id)
      const removedBuiltinItemIds = BUILTIN_NAV_ITEM_IDS.has(id) && removedItem && !removedItem.isCustom
        ? Array.from(new Set([...prev.removedBuiltinItemIds, id]))
        : prev.removedBuiltinItemIds
      return {
        ...prev,
        primaryNav: prev.primaryNav.filter(item => item.id !== id),
        secondaryNav: prev.secondaryNav.filter(item => item.id !== id),
        sections: prev.sections.filter(item => item.id !== id),
        removedBuiltinItemIds,
      }
    })
  }

  const updateItem = (id: string, updates: Partial<SidebarItem>) => {
    setConfig(prev => ({
      ...prev,
      primaryNav: prev.primaryNav.map(item => item.id === id ? { ...item, ...updates } : item),
      secondaryNav: prev.secondaryNav.map(item => item.id === id ? { ...item, ...updates } : item),
      sections: prev.sections.map(item => item.id === id ? { ...item, ...updates } : item),
    }))
  }

  const reorderItems = (items: SidebarItem[], target: 'primary' | 'secondary' | 'sections') => {
    setConfig(prev => target === 'primary' ? { ...prev, primaryNav: items } : target === 'secondary' ? { ...prev, secondaryNav: items } : { ...prev, sections: items })
  }

  const toggleClusterStatus = () => setConfig(prev => ({ ...prev, showClusterStatus: !prev.showClusterStatus }))
  const setWidth = (width: number) => setConfig(prev => ({ ...prev, width }))
  const toggleCollapsed = () => setConfig(prev => ({ ...prev, collapsed: !prev.collapsed }))
  const setCollapsed = (collapsed: boolean) => setConfig(prev => ({ ...prev, collapsed }))

  const openMobileSidebar = useCallback(() => updateSharedConfig({ ...(getSnapshot() || DEFAULT_CONFIG), isMobileOpen: true }), [])
  const closeMobileSidebar = useCallback(() => updateSharedConfig({ ...(getSnapshot() || DEFAULT_CONFIG), isMobileOpen: false }), [])
  const toggleMobileSidebar = useCallback(() => {
    const prev = getSnapshot() || DEFAULT_CONFIG
    updateSharedConfig({ ...prev, isMobileOpen: !prev.isMobileOpen })
  }, [])

  const restoreDashboard = (dashboard: SidebarItem) => {
    setConfig(prev => {
      if (prev.primaryNav.some(item => item.id === dashboard.id)) return prev
      const newItem: SidebarItem = { ...dashboard, order: prev.primaryNav.length }
      const removedBuiltinItemIds = prev.removedBuiltinItemIds.filter(id => id !== dashboard.id)
      return { ...prev, primaryNav: [...prev.primaryNav, newItem], removedBuiltinItemIds }
    })
  }

  const resetToDefault = () => setConfig(applyDashboardFilter(DEFAULT_CONFIG))

  const previewGenerateFromBehavior = useCallback((frequentlyUsedPaths: string[]): { proposed: SidebarConfig; changes: string[] } => {
    const allItems = [...config.primaryNav, ...config.secondaryNav]
    const reorderedPrimary: SidebarItem[] = []
    const usedIds = new Set<string>()

    frequentlyUsedPaths.forEach(path => {
      const matchingItem = allItems.find(item => item.href === path || path.startsWith(item.href + '/') || path.startsWith(item.href + '?'))
      if (matchingItem && !usedIds.has(matchingItem.id)) {
        reorderedPrimary.push({ ...matchingItem, order: reorderedPrimary.length })
        usedIds.add(matchingItem.id)
      }
    })

    config.primaryNav.forEach(item => {
      if (!usedIds.has(item.id)) {
        reorderedPrimary.push({ ...item, order: reorderedPrimary.length })
      }
    })

    const reorderedSecondary = config.secondaryNav.map((item, index) => ({ ...item, order: index }))
    const changes: string[] = []
    reorderedPrimary.forEach((item, index) => {
      const oldIdx = config.primaryNav.findIndex(current => current.id === item.id)
      if (oldIdx === -1) changes.push(`+ Added "${item.name}"`)
      else if (oldIdx !== index) changes.push(`↕ Moved "${item.name}" from #${oldIdx + 1} to #${index + 1}`)
    })
    if (changes.length === 0) changes.push('No changes needed')

    return { proposed: { ...config, primaryNav: reorderedPrimary, secondaryNav: reorderedSecondary }, changes }
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
