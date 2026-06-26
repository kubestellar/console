import { useMemo } from 'react'
import type { CNCFStats, MarketplaceItem, MarketplaceItemType } from './types'

interface UseMarketplaceFiltersOptions {
  items: MarketplaceItem[]
  searchQuery: string
  selectedTag: string | null
  selectedType: MarketplaceItemType | null
  showHelpWanted: boolean
}

export function useMarketplaceFilters({
  items,
  searchQuery,
  selectedTag,
  selectedType,
  showHelpWanted,
}: UseMarketplaceFiltersOptions) {
  const allTags = useMemo(() =>
    Array.from(new Set(items.flatMap(item => item.tags))).sort(),
    [items])

  const cncfItems = useMemo(() => items.filter(item => item.cncfProject), [items])

  const cncfStats: CNCFStats = useMemo(() => ({
    total: cncfItems.length,
    completed: cncfItems.filter(item => (item.status || 'available') === 'available').length,
    helpWanted: cncfItems.filter(item => item.status === 'help-wanted').length,
    graduatedTotal: cncfItems.filter(item => item.cncfProject?.maturity === 'graduated').length,
    incubatingTotal: cncfItems.filter(item => item.cncfProject?.maturity === 'incubating').length,
  }), [cncfItems])

  const cncfCategories = useMemo(() => Array.from(new Set(
    cncfItems.map(item => item.cncfProject!.category)
  )).sort(), [cncfItems])

  const typeCounts: Record<string, number> = useMemo(() => ({
    all: items.length,
    dashboard: items.filter(item => item.type === 'dashboard').length,
    'card-preset': items.filter(item => item.type === 'card-preset').length,
    theme: items.filter(item => item.type === 'theme').length,
  }), [items])

  const filteredItems = useMemo(() => items.filter(item => {
    const normalizedQuery = searchQuery.toLowerCase()
    const matchesSearch = !searchQuery ||
      item.name.toLowerCase().includes(normalizedQuery) ||
      item.description.toLowerCase().includes(normalizedQuery)
    const matchesTag = !selectedTag || (item.tags || []).includes(selectedTag)
    const matchesType = !selectedType || item.type === selectedType
    const matchesStatus = !showHelpWanted || item.status === 'help-wanted'
    return matchesSearch && matchesTag && matchesType && matchesStatus
  }), [items, searchQuery, selectedTag, selectedType, showHelpWanted])

  return {
    allTags,
    cncfCategories,
    cncfStats,
    filteredItems,
    typeCounts,
  }
}
