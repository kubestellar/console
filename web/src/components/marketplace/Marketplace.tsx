import { useMemo, useState } from 'react'
import { AlertCircle, Loader2, Package, RefreshCw, Store } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  type MarketplaceItem,
  type MarketplaceItemType,
  useMarketplace,
} from '../../hooks/useMarketplace'
import { useSidebarConfig } from '../../hooks/useSidebarConfig'
import { NAV_AFTER_ANIMATION_MS } from '../../lib/constants/network'
import { suggestIconSync } from '../../lib/iconSuggester'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'
import { useToast } from '../ui/Toast'
import { CNCFProgressBanner } from './CNCFProgressBanner'
import { MarketplaceCard } from './MarketplaceCards'
import { MarketplaceControls } from './MarketplaceControls'
import { MarketplaceFooter } from './MarketplaceFooter'
import {
  MARKETPLACE_GRID_STYLE,
  type SortField,
  type SortOrder,
  type ViewMode,
  VIEW_MODE_KEY,
} from './MarketplaceConstants'
import { MarketplaceRow } from './MarketplaceRow'

const DIFFICULTY_ORDER: Record<NonNullable<MarketplaceItem['difficulty']>, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
}

export function Marketplace() {
  const {
    items,
    allTags,
    typeCounts,
    cncfStats,
    cncfCategories,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    selectedTag,
    setSelectedTag,
    selectedType,
    setSelectedType,
    showHelpWanted,
    setShowHelpWanted,
    installItem,
    removeItem,
    isInstalled,
    refresh,
  } = useMarketplace()
  const { config: sidebarConfig, addItem, removeItem: removeSidebarItem } = useSidebarConfig()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || 'grid'
    } catch {
      return 'grid'
    }
  })
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  const toggleViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode)
    } catch {
      // ignore localStorage write failures
    }
  }

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortField(field)
    setSortOrder('asc')
  }

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'author':
          cmp = a.author.localeCompare(b.author)
          break
        case 'type':
          cmp = a.type.localeCompare(b.type)
          break
        case 'difficulty':
          cmp = DIFFICULTY_ORDER[a.difficulty || 'intermediate'] - DIFFICULTY_ORDER[b.difficulty || 'intermediate']
          break
      }

      return sortOrder === 'asc' ? cmp : -cmp
    })
  }, [items, sortField, sortOrder])

  const groupedItems = useMemo(() => {
    if (!showHelpWanted) return null

    const groups: Record<string, MarketplaceItem[]> = {}
    for (const item of sortedItems) {
      const category = item.cncfProject?.category || 'Other'
      if (!groups[category]) groups[category] = []
      groups[category].push(item)
    }

    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [showHelpWanted, sortedItems])

  const handleInstall = async (item: MarketplaceItem) => {
    try {
      const result = await installItem(item)
      if (result.type === 'card-preset') {
        showToast(`Added "${item.name}" card to your dashboard`, 'success')
        return
      }

      if (result.type === 'theme') {
        showToast(`Installed theme "${item.name}" — activate in Settings`, 'success')
        return
      }

      if (result.type === 'dashboard' && result.data && typeof result.data === 'object' && 'id' in result.data) {
        const href = `/custom-dashboard/${item.id}`
        const dashboardData = result.data as Record<string, unknown>
        const cards = (Array.isArray(dashboardData.cards) ? dashboardData.cards : []) as unknown[]

        try {
          localStorage.setItem(`kubestellar-custom-dashboard-${item.id}-cards`, JSON.stringify(cards))
        } catch {
          // ignore localStorage write failures
        }

        const alreadyInSidebar = [...sidebarConfig.primaryNav, ...sidebarConfig.secondaryNav]
          .some(sidebarItem => sidebarItem.href === href)
        if (!alreadyInSidebar) {
          addItem({
            name: item.name,
            icon: suggestIconSync(item.name),
            href,
            type: 'link',
            description: item.description,
          }, 'primary')
        }

        showToast(`Installed "${item.name}" — redirecting to dashboard...`, 'success')
        setTimeout(() => navigate(href), NAV_AFTER_ANIMATION_MS)
        return
      }

      showToast(`Installed "${item.name}"`, 'success')
    } catch {
      showToast(`Failed to install "${item.name}"`, 'error')
    }
  }

  const handleRemove = async (item: MarketplaceItem) => {
    try {
      const href = `/custom-dashboard/${item.id}`
      ;[...sidebarConfig.primaryNav, ...sidebarConfig.secondaryNav]
        .filter(sidebarItem => sidebarItem.href === href)
        .forEach(sidebarItem => removeSidebarItem(sidebarItem.id))

      try {
        localStorage.removeItem(`kubestellar-custom-dashboard-${item.id}-cards`)
      } catch {
        // ignore localStorage write failures
      }

      await removeItem(item)
      showToast(`Removed "${item.name}"`, 'info')
    } catch {
      showToast(`Failed to remove "${item.name}"`, 'error')
    }
  }

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Marketplace"
        subtitle="Community dashboards, card presets, and themes"
        icon={<Store className="w-5 h-5" />}
        isFetching={isLoading}
        onRefresh={refresh}
        rightExtra={<RotatingTip page="marketplace" />}
      />

      {!isLoading && cncfStats.total > 0 && <CNCFProgressBanner stats={cncfStats} />}

      <MarketplaceControls
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedTag={selectedTag}
        setSelectedTag={setSelectedTag}
        selectedType={selectedType}
        setSelectedType={setSelectedType}
        showHelpWanted={showHelpWanted}
        setShowHelpWanted={setShowHelpWanted}
        cncfCategories={cncfCategories}
        cncfHelpWanted={cncfStats.helpWanted}
        allTags={allTags}
        typeCounts={typeCounts}
        sortField={sortField}
        sortOrder={sortOrder}
        toggleSort={toggleSort}
        viewMode={viewMode}
        toggleViewMode={toggleViewMode}
        isLoading={isLoading}
        hasError={Boolean(error)}
        hasItems={items.length > 0}
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground mb-1">Failed to load marketplace</p>
          <p className="text-xs text-muted-foreground/70 mb-4">{error}</p>
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="w-10 h-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground mb-1">
            {searchQuery || selectedTag || selectedType ? 'No matching items' : 'No community content yet'}
          </p>
          <p className="text-xs text-muted-foreground/70">
            {searchQuery || selectedTag || selectedType
              ? 'Try adjusting your search or filters'
              : 'Community dashboards and presets will appear here'}
          </p>
        </div>
      ) : showHelpWanted && groupedItems ? (
        <div className="space-y-6">
          {groupedItems
            .filter(([category]) => !selectedTag || category === selectedTag)
            .map(([category, categoryItems]) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{category}</h3>
                  <span className="text-2xs text-muted-foreground/60">
                    {categoryItems.length} {categoryItems.length === 1 ? 'project' : 'projects'}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                {viewMode === 'list' ? (
                  <div className="space-y-1.5">
                    {categoryItems.map(item => (
                      <MarketplaceRow
                        key={item.id}
                        item={item}
                        onInstall={handleInstall}
                        onRemove={handleRemove}
                        isInstalled={isInstalled(item.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-4" style={MARKETPLACE_GRID_STYLE}>
                    {categoryItems.map(item => (
                      <MarketplaceCard
                        key={item.id}
                        item={item}
                        onInstall={handleInstall}
                        onRemove={handleRemove}
                        isInstalled={isInstalled(item.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-1.5">
          {sortedItems.map(item => (
            <MarketplaceRow
              key={item.id}
              item={item}
              onInstall={handleInstall}
              onRemove={handleRemove}
              isInstalled={isInstalled(item.id)}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4" style={MARKETPLACE_GRID_STYLE}>
          {sortedItems.map(item => (
            <MarketplaceCard
              key={item.id}
              item={item}
              onInstall={handleInstall}
              onRemove={handleRemove}
              isInstalled={isInstalled(item.id)}
            />
          ))}
        </div>
      )}

      <MarketplaceFooter helpWantedCount={cncfStats.helpWanted} />
    </div>
  )
}

export { CNCFProgressBanner } from './CNCFProgressBanner'
export { AuthorBadge, DifficultyBadge, MarketplaceCard } from './MarketplaceCards'
export type { MarketplaceItemActionProps } from './MarketplaceCards'
export * from './MarketplaceConstants'
export { MarketplaceRow } from './MarketplaceRow'
