import type { ReactNode } from 'react'
import { Loader2, AlertCircle, Package, RefreshCw } from 'lucide-react'
import type { MarketplaceItem, MarketplaceItemType } from '../../hooks/useMarketplace'
import type { ViewMode } from './MarketplaceControls'

interface MarketplaceContentProps {
  isLoading: boolean
  error: string | null
  items: MarketplaceItem[]
  searchQuery: string
  selectedTag: string | null
  selectedType: MarketplaceItemType | null
  refresh: () => void
  showHelpWanted: boolean
  groupedItems: [string, MarketplaceItem[]][] | null
  viewMode: ViewMode
  sortedItems: MarketplaceItem[]
  renderList: (items: MarketplaceItem[]) => ReactNode
  renderGrid: (items: MarketplaceItem[]) => ReactNode
}

export function MarketplaceContent({
  isLoading,
  error,
  items,
  searchQuery,
  selectedTag,
  selectedType,
  refresh,
  showHelpWanted,
  groupedItems,
  viewMode,
  sortedItems,
  renderList,
  renderGrid,
}: MarketplaceContentProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
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
    )
  }

  if (items.length === 0) {
    return (
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
    )
  }

  if (showHelpWanted && groupedItems) {
    return (
      <div className="space-y-6">
        {groupedItems
          .filter(([cat]) => !selectedTag || cat === selectedTag)
          .map(([category, categoryItems]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{category}</h3>
                <span className="text-2xs text-muted-foreground/60">{categoryItems.length} {categoryItems.length === 1 ? 'project' : 'projects'}</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              {viewMode === 'list' ? renderList(categoryItems) : renderGrid(categoryItems)}
            </div>
          ))}
      </div>
    )
  }

  return viewMode === 'list' ? renderList(sortedItems) : renderGrid(sortedItems)
}
