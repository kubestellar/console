import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Store, Search, Tag, Loader2, HandHelping } from 'lucide-react'
import { useMarketplace, MarketplaceItem, MarketplaceItemType } from '../../hooks/useMarketplace'
import { useSidebarConfig } from '../../hooks/useSidebarConfig'
import { useToast } from '../ui/Toast'
import { Input } from '../ui/Input'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'
import { CNCFProgressBanner } from './CNCFProgressBanner'
import { TYPE_LABELS } from './Marketplace.constants'
import {
  MarketplaceViewControls,
  MarketplaceItemCollection,
  MarketplaceErrorState,
  MarketplaceEmptyState,
  MarketplaceContributeFooter,
  type ViewMode,
  type SortField,
  type SortOrder } from './Marketplace.parts'
import { NAV_AFTER_ANIMATION_MS } from '../../lib/constants/network'
import { suggestIconSync } from '../../lib/iconSuggester'
import { useTranslation } from 'react-i18next'

const VIEW_MODE_KEY = 'kc-marketplace-view-mode'

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
        <MarketplaceViewControls
          sortField={sortField}
          sortOrder={sortOrder}
          showHelpWanted={showHelpWanted}
          viewMode={viewMode}
          onToggleSort={toggleSort}
          onViewModeChange={toggleViewMode}
        />
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <MarketplaceErrorState error={error} isLoading={isLoading} refresh={refresh} />
      ) : items.length === 0 ? (
        <MarketplaceEmptyState hasActiveFilters={!!(searchQuery || selectedTag || selectedType)} />
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
              <MarketplaceItemCollection
                items={categoryItems}
                viewMode={viewMode}
                onInstall={handleInstall}
                onRemove={handleRemove}
                isInstalled={isInstalled}
              />
            </div>
          ))}
        </div>
      ) : (
        <MarketplaceItemCollection
          items={sortedItems}
          viewMode={viewMode}
          onInstall={handleInstall}
          onRemove={handleRemove}
          isInstalled={isInstalled}
        />
      )}

      {/* Contribute Footer */}
      <MarketplaceContributeFooter helpWanted={cncfStats.helpWanted} />
    </div>
  )
}
