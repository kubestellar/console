import {
  Grid3X3,
  HandHelping,
  List,
  Search,
  SortAsc,
  SortDesc,
  Tag,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MarketplaceItemType } from '../../hooks/useMarketplace'
import {
  TYPE_LABELS,
  type SortField,
  type SortOrder,
  type ViewMode,
} from './MarketplaceConstants'

interface MarketplaceControlsProps {
  searchQuery: string
  setSearchQuery: (value: string) => void
  selectedTag: string | null
  setSelectedTag: (value: string | null) => void
  selectedType: MarketplaceItemType | null
  setSelectedType: (value: MarketplaceItemType | null) => void
  showHelpWanted: boolean
  setShowHelpWanted: (value: boolean) => void
  cncfCategories: string[]
  cncfHelpWanted: number
  allTags: string[]
  typeCounts: Record<'all' | MarketplaceItemType, number>
  sortField: SortField
  sortOrder: SortOrder
  toggleSort: (field: SortField) => void
  viewMode: ViewMode
  toggleViewMode: (mode: ViewMode) => void
  isLoading: boolean
  hasError: boolean
  hasItems: boolean
}

const filterBtnClass = (active: boolean) =>
  `flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md transition-colors ${
    active
      ? 'bg-primary/15 text-primary font-medium'
      : 'bg-card border border-border text-muted-foreground hover:text-foreground'
  }`

export function MarketplaceControls({
  searchQuery,
  setSearchQuery,
  selectedTag,
  setSelectedTag,
  selectedType,
  setSelectedType,
  showHelpWanted,
  setShowHelpWanted,
  cncfCategories,
  cncfHelpWanted,
  allTags,
  typeCounts,
  sortField,
  sortOrder,
  toggleSort,
  viewMode,
  toggleViewMode,
  isLoading,
  hasError,
  hasItems,
}: MarketplaceControlsProps) {
  const { t } = useTranslation()

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t('common.searchMarketplace')}
            className="w-full pl-9 pr-3 py-2 text-sm bg-card border border-border rounded-md focus:outline-hidden focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={() => { setSelectedType(null); setShowHelpWanted(false) }} className={filterBtnClass(!selectedType && !showHelpWanted)}>
            All
            <span className="text-2xs ml-0.5 opacity-60">{typeCounts.all}</span>
          </button>
          {(Object.entries(TYPE_LABELS) as [MarketplaceItemType, (typeof TYPE_LABELS)[MarketplaceItemType]][]).map(([type, { label, icon: Icon }]) => (
            <button
              key={type}
              onClick={() => { setSelectedType(selectedType === type ? null : type); setShowHelpWanted(false) }}
              className={filterBtnClass(selectedType === type && !showHelpWanted)}
            >
              <Icon className="w-3 h-3" />
              {label}
              <span className="text-2xs ml-0.5 opacity-60">{typeCounts[type]}</span>
            </button>
          ))}

          {cncfHelpWanted > 0 && (
            <>
              <div className="w-px h-5 bg-border mx-1" />
              <button
                onClick={() => {
                  setShowHelpWanted(!showHelpWanted)
                  if (!showHelpWanted) {
                    setSelectedType('card-preset')
                  } else {
                    setSelectedType(null)
                  }
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
                  ({cncfHelpWanted})
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
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
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
            {cncfCategories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedTag(selectedTag === category ? null : category)}
                className={`flex items-center gap-1 px-2 py-1 text-2xs rounded transition-colors ${
                  selectedTag === category
                    ? 'bg-yellow-500/15 text-yellow-400 font-medium'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        )}
      </div>

      {!isLoading && !hasError && hasItems && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-muted-foreground mr-1">Sort:</span>
            {(['name', 'type', 'author', ...(showHelpWanted ? ['difficulty' as SortField] : [])] as SortField[]).map(field => (
              <button
                key={field}
                onClick={() => toggleSort(field)}
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
              onClick={() => toggleViewMode('grid')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
              title="Grid view"
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => toggleViewMode('list')}
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
