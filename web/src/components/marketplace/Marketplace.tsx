import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Store, Search, Download, Tag, RefreshCw, Loader2, AlertCircle, Package,
  Check, Trash2, LayoutGrid, Puzzle, Palette, ExternalLink, Heart,
  HandHelping, List, Grid3X3, SortAsc, SortDesc, Sparkles } from 'lucide-react'
import { useMarketplace, MarketplaceItem, MarketplaceItemType } from '../../hooks/useMarketplace'
import { useSidebarConfig } from '../../hooks/useSidebarConfig'
import { useToast } from '../ui/Toast'
import { Input } from '../ui/Input'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'
import { CNCFProgressBanner } from './CNCFProgressBanner'
import { MarketplaceCard } from './MarketplaceCard'
import { AuthorBadge } from './AuthorBadge'
import { DifficultyBadge } from './DifficultyBadge'
import { NAV_AFTER_ANIMATION_MS } from '../../lib/constants/network'
import { suggestIconSync } from '../../lib/iconSuggester'
import { useTranslation } from 'react-i18next'
import type { CSSProperties } from 'react'
import { validateExternalUrl } from '../../lib/validateExternalUrl'

// Inline style constants
const MARKETPLACE_DIV_STYLE_1: CSSProperties = { gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }

type ViewMode = 'grid' | 'list'
type SortField = 'name' | 'author' | 'type' | 'difficulty'
type SortOrder = 'asc' | 'desc'

const VIEW_MODE_KEY = 'kc-marketplace-view-mode'
const CONTRIBUTE_URL = 'https://github.com/kubestellar/console-marketplace'
const ISSUES_URL = 'https://github.com/kubestellar/console-marketplace/issues?q=is%3Aissue%20is%3Aopen%20field.label%3Ahelp%20wanted'

const TYPE_LABELS: Record<MarketplaceItemType, { label: string; icon: typeof LayoutGrid }> = {
  dashboard: { label: 'Dashboards', icon: LayoutGrid },
  'card-preset': { label: 'Card Presets', icon: Puzzle },
  theme: { label: 'Themes', icon: Palette } }

const MATURITY_CONFIG = {
  graduated: { label: 'Graduated', color: 'text-green-400 bg-green-950 border-green-800' },
  incubating: { label: 'Incubating', color: 'text-blue-400 bg-blue-950 border-blue-800' } } as const

// --- List Row (compact view) ---
function MarketplaceRow({ item, onInstall, onRemove, isInstalled }: {
  item: MarketplaceItem
  onInstall: (item: MarketplaceItem) => void
  onRemove: (item: MarketplaceItem) => void
  isInstalled: boolean
}) {
  const [installing, setInstalling] = useState(false)
  const [removing, setRemoving] = useState(false)
  const isHelpWanted = item.status === 'help-wanted'
  const typeInfo = TYPE_LABELS[item.type]

  const handleInstall = async () => {
    setInstalling(true)
    try { await onInstall(item) } finally { setInstalling(false) }
  }
  const handleRemove = async () => {
    setRemoving(true)
    try { await onRemove(item) } finally { setRemoving(false) }
  }

  return (
    <div className={`flex items-center gap-4 px-4 py-2.5 bg-card border rounded-md transition-colors hover:bg-muted/30 ${
      isHelpWanted ? 'border-dashed border-yellow-500/20' : 'border-border'
    }`}>
      {/* Type icon */}
      <typeInfo.icon className="w-4 h-4 text-muted-foreground shrink-0" />

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
          {item.cncfProject && (
            <span className={`text-[9px] font-medium px-1 py-0.5 rounded border ${MATURITY_CONFIG[item.cncfProject.maturity].color}`}>
              {item.cncfProject.maturity === 'graduated' ? 'Grad' : 'Incub'}
            </span>
          )}
          {isHelpWanted && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-300 border border-yellow-500/20 rounded">
              Help Wanted
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{item.description}</p>
      </div>

      {/* Author */}
      <span className="text-xs text-muted-foreground shrink-0 w-24 truncate hidden sm:block">
        <AuthorBadge author={item.author} github={item.authorGithub} compact />
      </span>

      {/* Type label */}
      <span className="text-2xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0 hidden md:block">
        {typeInfo.label.replace(/s$/, '')}
      </span>

      {/* Difficulty (for help-wanted) */}
      {isHelpWanted && item.difficulty ? (
        <div className="shrink-0 hidden lg:block">
          <DifficultyBadge difficulty={item.difficulty} />
        </div>
      ) : (
        <span className="text-2xs text-muted-foreground shrink-0 w-10 text-right hidden lg:block">v{item.version}</span>
      )}

      {/* Action */}
      <div className="shrink-0">
        {isHelpWanted ? (
          <a
            href={validateExternalUrl(item.issueUrl) || ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded transition-colors"
          >
            <Sparkles className="w-3 h-3" />
            Contribute
          </a>
        ) : isInstalled ? (
          <div className="flex items-center gap-1">
            <span className="flex items-center gap-0.5 px-2 py-1 text-2xs font-medium text-green-400 bg-green-500/10 rounded">
              <Check className="w-3 h-3" />
            </span>
            <button
              onClick={handleRemove}
              disabled={removing}
              className="flex items-center px-1.5 py-1 text-2xs text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
            >
              {removing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            </button>
          </div>
        ) : (
          <button
            onClick={handleInstall}
            disabled={installing}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors disabled:opacity-50"
          >
            {installing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            Install
          </button>
        )}
      </div>
    </div>
  )
}

const filterBtnClass = (active: boolean) =>
  `flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md transition-colors ${
    active
      ? 'bg-primary/15 text-primary font-medium'
      : 'bg-card border border-border text-muted-foreground hover:text-foreground'
  }`

export function Marketplace() {
  const { t } = useTranslation()
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
    refresh } = useMarketplace()
  const { config: sidebarConfig, addItem, removeItem: removeSidebarItem } = useSidebarConfig()
  const { showToast } = useToast()

  const navigate = useNavigate()

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || 'grid' } catch { return 'grid' }
  })
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  // Type filter keyboard navigation
  const typeOptions: (MarketplaceItemType | null)[] = [null, ...Object.keys(TYPE_LABELS) as MarketplaceItemType[]]
  
  const handleTypeKeyDown = (e: React.KeyboardEvent, currentType: MarketplaceItemType | null) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const currentIndex = typeOptions.indexOf(currentType)
      const nextIndex = e.key === 'ArrowRight'
        ? (currentIndex + 1) % typeOptions.length
        : (currentIndex - 1 + typeOptions.length) % typeOptions.length
      const nextType = typeOptions[nextIndex]
      setSelectedType(nextType)
      setShowHelpWanted(false)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setSelectedType(null)
      setShowHelpWanted(false)
    } else if (e.key === 'End') {
      e.preventDefault()
      setSelectedType(typeOptions[typeOptions.length - 1])
      setShowHelpWanted(false)
    }
  }

  // Tag filter keyboard navigation
  const handleTagKeyDown = (e: React.KeyboardEvent, currentTag: string | null, tagList: string[]) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const currentIndex = currentTag ? tagList.indexOf(currentTag) : -1
      const nextIndex = e.key === 'ArrowRight'
        ? (currentIndex + 1) % tagList.length
        : currentIndex === -1 ? tagList.length - 1 : (currentIndex - 1 + tagList.length) % tagList.length
      setSelectedTag(tagList[nextIndex])
    } else if (e.key === 'Home') {
      e.preventDefault()
      setSelectedTag(tagList[0])
    } else if (e.key === 'End') {
      e.preventDefault()
      setSelectedTag(tagList[tagList.length - 1])
    }
  }

  const toggleViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    try { localStorage.setItem(VIEW_MODE_KEY, mode) } catch { /* ok */ }
  }

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  // Sort items
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'author': cmp = a.author.localeCompare(b.author); break
        case 'type': cmp = a.type.localeCompare(b.type); break
        case 'difficulty': {
          const diffOrder = { beginner: 0, intermediate: 1, advanced: 2 }
          cmp = (diffOrder[a.difficulty || 'intermediate'] || 1) - (diffOrder[b.difficulty || 'intermediate'] || 1)
          break
        }
      }
      return sortOrder === 'asc' ? cmp : -cmp
    })
  }, [items, sortField, sortOrder])

  // Group items by CNCF category when help-wanted is active
  const groupedItems = useMemo(() => {
    if (!showHelpWanted) return null
    const groups: Record<string, MarketplaceItem[]> = {}
    for (const item of sortedItems) {
      const cat = item.cncfProject?.category || 'Other'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(item)
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [showHelpWanted, sortedItems])

  const handleInstall = async (item: MarketplaceItem) => {
    try {
      const result = await installItem(item)
      if (result.type === 'card-preset') {
        showToast(`Added "${item.name}" card to your dashboard`, 'success')
      } else if (result.type === 'theme') {
        showToast(`Installed theme "${item.name}" — activate in Settings`, 'success')
      } else if (result.type === 'dashboard' && result.data && typeof result.data === 'object' && 'id' in result.data) {
        // Use the marketplace slug as the vanity URL
        const href = `/custom-dashboard/${item.id}`
        // Seed localStorage so CustomDashboard loads cards instantly
        const dashData = result.data as Record<string, unknown>
        const cards = (Array.isArray(dashData.cards) ? dashData.cards : []) as unknown[]
        try {
          localStorage.setItem(`kubestellar-custom-dashboard-${item.id}-cards`, JSON.stringify(cards))
        } catch { /* non-critical */ }
        // Add to sidebar if not already present
        const alreadyInSidebar = [...sidebarConfig.primaryNav, ...sidebarConfig.secondaryNav]
          .some(si => si.href === href)
        if (!alreadyInSidebar) {
          addItem({
            name: item.name,
            icon: suggestIconSync(item.name),
            href,
            type: 'link',
            description: item.description }, 'primary')
        }
        showToast(`Installed "${item.name}" — redirecting to dashboard...`, 'success')
        setTimeout(() => navigate(href), NAV_AFTER_ANIMATION_MS)
      } else {
        showToast(`Installed "${item.name}"`, 'success')
      }
    } catch {
      showToast(`Failed to install "${item.name}"`, 'error')
    }
  }

  const handleRemove = async (item: MarketplaceItem) => {
    try {
      // Remove all sidebar entries matching this marketplace dashboard
      const href = `/custom-dashboard/${item.id}`
      ;[...sidebarConfig.primaryNav, ...sidebarConfig.secondaryNav]
        .filter(si => si.href === href)
        .forEach(si => removeSidebarItem(si.id))
      // Clean up localStorage cards
      try { localStorage.removeItem(`kubestellar-custom-dashboard-${item.id}-cards`) } catch { /* ok */ }
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

      {/* CNCF Progress Banner */}
      {!isLoading && cncfStats.total > 0 && (
        <CNCFProgressBanner stats={cncfStats} />
      )}

      {/* Search and filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] max-w-md">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('common.searchMarketplace')}
            leadingIcon={<Search className="w-4 h-4" />}
            inputSize="md"
          />
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-1.5">
          <button 
            onClick={() => { setSelectedType(null); setShowHelpWanted(false) }} 
            onKeyDown={(e) => handleTypeKeyDown(e, null)}
            className={filterBtnClass(!selectedType && !showHelpWanted)}
          >
            All
            <span className="text-2xs ml-0.5 opacity-60">{typeCounts.all}</span>
          </button>
          {(Object.entries(TYPE_LABELS) as [MarketplaceItemType, typeof TYPE_LABELS[MarketplaceItemType]][]).map(([type, { label, icon: Icon }]) => (
            <button
              key={type}
              onClick={() => { setSelectedType(selectedType === type ? null : type); setShowHelpWanted(false) }}
              onKeyDown={(e) => handleTypeKeyDown(e, type)}
              className={filterBtnClass(selectedType === type && !showHelpWanted)}
            >
              <Icon className="w-3 h-3" />
              {label}
              <span className="text-2xs ml-0.5 opacity-60">{typeCounts[type]}</span>
            </button>
          ))}

          {cncfStats.helpWanted > 0 && (
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
                  ({cncfStats.helpWanted})
                </span>
              </button>
            </>
          )}
        </div>

        {/* Tag filter */}
        {!showHelpWanted && (
          <div className="flex flex-wrap items-center gap-1.5">
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                onKeyDown={(e) => handleTagKeyDown(e, tag, allTags)}
                className={filterBtnClass(selectedTag === tag)}
              >
                <Tag className="w-3 h-3" />
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Category filter (shown when help-wanted is active) */}
        {showHelpWanted && cncfCategories.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {cncfCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedTag(selectedTag === cat ? null : cat)}
                onKeyDown={(e) => handleTagKeyDown(e, cat, cncfCategories)}
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

      {/* View controls */}
      {!isLoading && !error && items.length > 0 && (
        <div className="flex items-center justify-between">
          {/* Sort */}
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

          {/* View mode */}
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

      {/* Content */}
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
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
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
        // Grouped view for help-wanted items
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
                <div className="grid gap-4" style={MARKETPLACE_DIV_STYLE_1}>
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
        <div className="grid gap-4" style={MARKETPLACE_DIV_STYLE_1}>
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

      {/* Contribute Footer */}
      <div className="flex items-center justify-between bg-card border border-border rounded-lg px-5 py-4">
        <div className="flex items-center gap-3">
          <Heart className="w-5 h-5 text-purple-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {cncfStats.helpWanted > 0
                ? 'Help build CNCF ecosystem coverage'
                : 'Share with the community'}
            </p>
            <p className="text-xs text-muted-foreground">
              {cncfStats.helpWanted > 0
                ? `${cncfStats.helpWanted} projects need card implementations. Pick one, follow the tutorial, open a PR.`
                : 'Contribute dashboards, card presets, or themes — just open a PR with your JSON file.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {cncfStats.helpWanted > 0 && (
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
    </div>
  )
}
