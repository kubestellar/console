import type { CSSProperties } from 'react'
import {
  RefreshCw, AlertCircle, Package, ExternalLink, Heart,
  HandHelping, List, Grid3X3, SortAsc, SortDesc } from 'lucide-react'
import type { MarketplaceItem } from '../../hooks/useMarketplace'
import { MarketplaceCard } from './MarketplaceCard'
import { MarketplaceRow } from './MarketplaceRow'
import { ISSUES_URL } from './Marketplace.constants'

// Inline style constants
const MARKETPLACE_DIV_STYLE_1: CSSProperties = { gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }

const CONTRIBUTE_URL = 'https://github.com/kubestellar/console-marketplace'

export type ViewMode = 'grid' | 'list'
export type SortField = 'name' | 'author' | 'type' | 'difficulty'
export type SortOrder = 'asc' | 'desc'

interface MarketplaceViewControlsProps {
  sortField: SortField
  sortOrder: SortOrder
  showHelpWanted: boolean
  viewMode: ViewMode
  onToggleSort: (field: SortField) => void
  onViewModeChange: (mode: ViewMode) => void
}

export function MarketplaceViewControls({
  sortField,
  sortOrder,
  showHelpWanted,
  viewMode,
  onToggleSort,
  onViewModeChange }: MarketplaceViewControlsProps) {
  return (
    <div className="flex items-center justify-between">
      {/* Sort */}
      <div className="flex items-center gap-1.5">
        <span className="text-2xs text-muted-foreground mr-1">Sort:</span>
        {(['name', 'type', 'author', ...(showHelpWanted ? ['difficulty' as SortField] : [])] as SortField[]).map(field => (
          <button
            key={field}
            onClick={() => onToggleSort(field)}
            className={`flex items-center gap-0.5 px-2 py-1 text-2xs rounded transition-colors ${
              sortField === field
                ? 'bg-primary/15 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {field.charAt(0).toUpperCase() + field.slice(1)}
            {sortField === field && (
              sortOrder === 'asc' ? <SortAsc className="w-2.5 h-2.5" /> : <SortDesc className="w-2.5 h-2.5" />
            )}
          </button>
        ))}
      </div>

      {/* View mode */}
      <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
        <button
          onClick={() => onViewModeChange('grid')}
          className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
          title="Grid view"
        >
          <Grid3X3 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onViewModeChange('list')}
          className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
          title="List view"
        >
          <List className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

interface MarketplaceItemCollectionProps {
  items: MarketplaceItem[]
  viewMode: ViewMode
  onInstall: (item: MarketplaceItem) => void
  onRemove: (item: MarketplaceItem) => void
  isInstalled: (id: string) => boolean
}

export function MarketplaceItemCollection({
  items,
  viewMode,
  onInstall,
  onRemove,
  isInstalled }: MarketplaceItemCollectionProps) {
  return (
    viewMode === 'list' ? (
      <div className="space-y-1.5">
        {items.map(item => (
          <MarketplaceRow
            key={item.id}
            item={item}
            onInstall={onInstall}
            onRemove={onRemove}
            isInstalled={isInstalled(item.id)}
          />
        ))}
      </div>
    ) : (
      <div className="grid gap-4" style={MARKETPLACE_DIV_STYLE_1}>
        {items.map(item => (
          <MarketplaceCard
            key={item.id}
            item={item}
            onInstall={onInstall}
            onRemove={onRemove}
            isInstalled={isInstalled(item.id)}
          />
        ))}
      </div>
    )
  )
}

interface MarketplaceErrorStateProps {
  error: string
  isLoading: boolean
  refresh: () => void
}

export function MarketplaceErrorState({ error, isLoading, refresh }: MarketplaceErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <AlertCircle className="w-10 h-10 text-muted-foreground/50 mb-3" />
      <p className="text-sm text-muted-foreground mb-1">Failed to load marketplace</p>
      <p className="text-xs text-muted-foreground/70 mb-4">{error}</p>
      <button
        onClick={refresh}
        disabled={isLoading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
        Try again
      </button>
    </div>
  )
}

export function MarketplaceEmptyState({ hasActiveFilters }: { hasActiveFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Package className="w-10 h-10 text-muted-foreground/50 mb-3" />
      <p className="text-sm text-muted-foreground mb-1">
        {hasActiveFilters ? 'No matching items' : 'No community content yet'}
      </p>
      <p className="text-xs text-muted-foreground/70">
        {hasActiveFilters
          ? 'Try adjusting your search or filters'
          : 'Community dashboards and presets will appear here'}
      </p>
    </div>
  )
}

export function MarketplaceContributeFooter({ helpWanted }: { helpWanted: number }) {
  return (
    <div className="flex items-center justify-between bg-card border border-border rounded-lg px-5 py-4">
      <div className="flex items-center gap-3">
        <Heart className="w-5 h-5 text-purple-400 shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">
            {helpWanted > 0
              ? 'Help build CNCF ecosystem coverage'
              : 'Share with the community'}
          </p>
          <p className="text-xs text-muted-foreground">
            {helpWanted > 0
              ? `${helpWanted} projects need card implementations. Pick one, follow the tutorial, open a PR.`
              : 'Contribute dashboards, card presets, or themes — just open a PR with your JSON file.'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {helpWanted > 0 && (
          <a
            href={ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-md transition-colors"
          >
            <HandHelping className="w-3 h-3" />
            Browse Issues
          </a>
        )}
        <a
          href={CONTRIBUTE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Contribute
        </a>
      </div>
    </div>
  )
}
