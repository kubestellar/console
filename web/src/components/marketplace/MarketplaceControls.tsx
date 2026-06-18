import { Search, Tag, HandHelping, List, Grid3X3, SortAsc, SortDesc, LayoutGrid, Puzzle, Palette } from 'lucide-react'
import type { MarketplaceItemType } from '../../hooks/useMarketplace'

export type ViewMode = 'grid' | 'list'
export type SortField = 'name' | 'author' | 'type' | 'difficulty'
export type SortOrder = 'asc' | 'desc'

interface MarketplaceControlsProps {
  isLoading: boolean
  error: string | null
  itemCount: number
  searchPlaceholder: string
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  selectedType: MarketplaceItemType | null
  onSelectedTypeChange: (value: MarketplaceItemType | null) => void
  showHelpWanted: boolean
  onShowHelpWantedChange: (value: boolean) => void
  typeCounts: Record<MarketplaceItemType | 'all', number>
  helpWantedCount: number
  allTags: string[]
  selectedTag: string | null
  onSelectedTagChange: (value: string | null) => void
  cncfCategories: string[]
  sortField: SortField
  sortOrder: SortOrder
  onToggleSort: (field: SortField) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

const TYPE_LABELS: Record<MarketplaceItemType, { label: string; icon: typeof LayoutGrid }> = {
  dashboard: { label: 'Dashboards', icon: LayoutGrid },
  'card-preset': { label: 'Card Presets', icon: Puzzle },
  theme: { label: 'Themes', icon: Palette },
}

const filterBtnClass = (active: boolean) =>
  `flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md transition-colors ${
    active
      ? 'bg-primary/15 text-primary font-medium'
      : 'bg-card border border-border text-muted-foreground hover:text-foreground'
  }`

export function MarketplaceControls({
  isLoading,
  error,
  itemCount,
  searchPlaceholder,
  searchQuery,
  onSearchQueryChange,
  selectedType,
  onSelectedTypeChange,
  showHelpWanted,
  onShowHelpWantedChange,
  typeCounts,
  helpWantedCount,
  allTags,
  selectedTag,
  onSelectedTagChange,
  cncfCategories,
  sortField,
  sortOrder,
  onToggleSort,
  viewMode,
  onViewModeChange,
}: MarketplaceControlsProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 text-sm bg-card border border-border rounded-md focus:outline-hidden focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={() => { onSelectedTypeChange(null); onShowHelpWantedChange(false) }} className={filterBtnClass(!selectedType && !showHelpWanted)}>
            All
            <span className="text-2xs ml-0.5 opacity-60">{typeCounts.all}</span>
          </button>
          {(Object.entries(TYPE_LABELS) as [MarketplaceItemType, typeof TYPE_LABELS[MarketplaceItemType]][]).map(([type, { label, icon: Icon }]) => (
            <button
              key={type}
              onClick={() => { onSelectedTypeChange(selectedType === type ? null : type); onShowHelpWantedChange(false) }}
              className={filterBtnClass(selectedType === type && !showHelpWanted)}
            >
              <Icon className="w-3 h-3" />
              {label}
              <span className="text-2xs ml-0.5 opacity-60">{typeCounts[type]}</span>
            </button>
          ))}

          {helpWantedCount > 0 && (
            <>
              <div className="w-px h-5 bg-border mx-1" />
              <button
                onClick={() => {
                  const next = !showHelpWanted
                  onShowHelpWantedChange(next)
                  onSelectedTypeChange(next ? 'card-preset' : null)
                }}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                  showHelpWanted
                    ? 'bg-yellow-500/15 text-yellow-400 font-medium'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <HandHelping className="w-3 h-3" />
                Help Wanted
                <span className={`text-2xs ml-0.5 ${showHelpWanted ? 'text-yellow-400/70' : 'text-muted-foreground/60'}`}>
                  ({helpWantedCount})
                </span>
              </button>
            </>
          )}
        </div>

        {!showHelpWanted && (
          <div className="flex flex-wrap items-center gap-1.5">
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => onSelectedTagChange(selectedTag === tag ? null : tag)}
                className={filterBtnClass(selectedTag === tag)}
              >
                <Tag className="w-3 h-3" />
                {tag}
              </button>
            ))}
          </div>
        )}

        {showHelpWanted && cncfCategories.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {cncfCategories.map(cat => (
              <button
                key={cat}
                onClick={() => onSelectedTagChange(selectedTag === cat ? null : cat)}
                className={`flex items-center gap-1 px-2 py-1 text-2xs rounded transition-colors ${
                  selectedTag === cat
                    ? 'bg-yellow-500/15 text-yellow-400 font-medium'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {!isLoading && !error && itemCount > 0 && (
        <div className="flex items-center justify-between">
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
      )}
    </>
  )
}
