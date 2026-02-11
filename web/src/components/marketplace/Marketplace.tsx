import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Store, Search, Download, Tag, RefreshCw, Loader2, AlertCircle, Package, Check, Trash2, LayoutGrid, Puzzle, Palette, ExternalLink, Heart } from 'lucide-react'
import { useMarketplace, MarketplaceItem, MarketplaceItemType } from '../../hooks/useMarketplace'
import { useSidebarConfig } from '../../hooks/useSidebarConfig'
import { useToast } from '../ui/Toast'
import { DashboardHeader } from '../shared/DashboardHeader'
import { MarketplaceThumbnail } from './MarketplaceThumbnail'
import { suggestIconSync } from '../../lib/iconSuggester'

const CONTRIBUTE_URL = 'https://github.com/kubestellar/console-marketplace'

const TYPE_LABELS: Record<MarketplaceItemType, { label: string; icon: typeof LayoutGrid }> = {
  dashboard: { label: 'Dashboards', icon: LayoutGrid },
  'card-preset': { label: 'Card Presets', icon: Puzzle },
  theme: { label: 'Themes', icon: Palette },
}

function MarketplaceCard({ item, onInstall, onRemove, isInstalled }: {
  item: MarketplaceItem
  onInstall: (item: MarketplaceItem) => void
  onRemove: (item: MarketplaceItem) => void
  isInstalled: boolean
}) {
  const [installing, setInstalling] = useState(false)
  const [removing, setRemoving] = useState(false)

  const handleInstall = async () => {
    setInstalling(true)
    try {
      await onInstall(item)
    } finally {
      setInstalling(false)
    }
  }

  const handleRemove = async () => {
    setRemoving(true)
    try {
      await onRemove(item)
    } finally {
      setRemoving(false)
    }
  }

  const typeInfo = TYPE_LABELS[item.type]

  return (
    <div className="group bg-card border border-border rounded-lg overflow-hidden hover:border-primary/30 transition-all hover:shadow-lg">
      {item.screenshot ? (
        <div className="h-36 bg-muted overflow-hidden">
          <img
            src={item.screenshot}
            alt={item.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      ) : (
        <MarketplaceThumbnail itemId={item.id} itemType={item.type} className="group-hover:scale-105 transition-transform duration-300 origin-center" />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-foreground line-clamp-1">{item.name}</h3>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
            v{item.version}
          </span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{item.description}</p>
        <div className="flex flex-wrap gap-1 mb-3">
          {item.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{item.author}</span>
            <span>&middot;</span>
            {item.type === 'theme' && item.themeColors ? (
              <div className="flex gap-0.5">
                {item.themeColors.slice(0, 5).map((color, i) => (
                  <div key={i} className="w-3 h-3 rounded-full border border-border/50" style={{ backgroundColor: color }} />
                ))}
              </div>
            ) : item.type === 'card-preset' ? (
              <span className="flex items-center gap-1">
                <typeInfo.icon className="w-3 h-3" />
                1 card
              </span>
            ) : (
              <span>{item.cardCount} cards</span>
            )}
          </div>
          {isInstalled ? (
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-green-400 bg-green-500/10 rounded">
                <Check className="w-3 h-3" />
                Installed
              </span>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                title="Remove"
              >
                {removing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              </button>
            </div>
          ) : (
            <button
              onClick={handleInstall}
              disabled={installing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors disabled:opacity-50"
            >
              {installing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Download className="w-3 h-3" />
              )}
              Install
            </button>
          )}
        </div>
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
  const {
    items,
    allTags,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    selectedTag,
    setSelectedTag,
    selectedType,
    setSelectedType,
    installItem,
    removeItem,
    isInstalled,
    refresh,
  } = useMarketplace()
  const { config: sidebarConfig, addItem, removeItem: removeSidebarItem } = useSidebarConfig()
  const { showToast } = useToast()

  const navigate = useNavigate()

  const handleInstall = async (item: MarketplaceItem) => {
    try {
      const result = await installItem(item)
      if (result.type === 'card-preset') {
        showToast(`Added "${item.name}" card to your dashboard`, 'success')
      } else if (result.type === 'theme') {
        showToast(`Installed theme "${item.name}" — activate in Settings`, 'success')
      } else if (result.type === 'dashboard' && result.data?.id) {
        // Use the marketplace slug as the vanity URL
        const href = `/custom-dashboard/${item.id}`
        // Seed localStorage so CustomDashboard loads cards instantly
        const cards = result.data.cards || []
        try {
          localStorage.setItem(`kubestellar-custom-dashboard-${item.id}-cards`, JSON.stringify(cards))
        } catch { /* non-critical */ }
        // Add to sidebar so it appears in the left menu
        addItem({
          name: item.name,
          icon: suggestIconSync(item.name),
          href,
          type: 'link',
          description: item.description,
        }, 'primary')
        showToast(`Installed "${item.name}" — redirecting to dashboard...`, 'success')
        setTimeout(() => navigate(href), 1500)
      } else {
        showToast(`Installed "${item.name}"`, 'success')
      }
    } catch {
      showToast(`Failed to install "${item.name}"`, 'error')
    }
  }

  const handleRemove = async (item: MarketplaceItem) => {
    try {
      // Find and remove sidebar entry using the marketplace slug (not backend UUID)
      const href = `/custom-dashboard/${item.id}`
      const sidebarItem = [...sidebarConfig.primaryNav, ...sidebarConfig.secondaryNav]
        .find(si => si.href === href)
      if (sidebarItem) removeSidebarItem(sidebarItem.id)
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
      />

      {/* Search and filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search marketplace..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-card border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => setSelectedType(null)} className={filterBtnClass(!selectedType)}>
            All
          </button>
          {(Object.entries(TYPE_LABELS) as [MarketplaceItemType, typeof TYPE_LABELS[MarketplaceItemType]][]).map(([type, { label, icon: Icon }]) => (
            <button
              key={type}
              onClick={() => setSelectedType(selectedType === type ? null : type)}
              className={filterBtnClass(selectedType === type)}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>

        {/* Tag filter */}
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

      </div>

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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map(item => (
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

      {/* Contribute */}
      <div className="flex items-center justify-between bg-card border border-border rounded-lg px-5 py-4">
        <div className="flex items-center gap-3">
          <Heart className="w-5 h-5 text-pink-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Share with the community</p>
            <p className="text-xs text-muted-foreground">Contribute dashboards, card presets, or themes — just open a PR with your JSON file.</p>
          </div>
        </div>
        <a
          href={CONTRIBUTE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors shrink-0"
        >
          <ExternalLink className="w-3 h-3" />
          Contribute
        </a>
      </div>
    </div>
  )
}
