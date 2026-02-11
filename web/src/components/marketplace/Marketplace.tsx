import { useState } from 'react'
import { Store, Search, Download, Tag, RefreshCw, Loader2, AlertCircle, Package } from 'lucide-react'
import { useMarketplace, MarketplaceItem } from '../../hooks/useMarketplace'
import { useToast } from '../ui/Toast'
import { DashboardHeader } from '../shared/DashboardHeader'

function MarketplaceCard({ item, onInstall }: { item: MarketplaceItem; onInstall: (item: MarketplaceItem) => void }) {
  const [installing, setInstalling] = useState(false)

  const handleInstall = async () => {
    setInstalling(true)
    try {
      await onInstall(item)
    } finally {
      setInstalling(false)
    }
  }

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
        <div className="h-36 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
          <Package className="w-12 h-12 text-primary/30" />
        </div>
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
            <span>{item.cardCount} cards</span>
          </div>
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
        </div>
      </div>
    </div>
  )
}

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
    installItem,
    refresh,
  } = useMarketplace()
  const { showToast } = useToast()

  const handleInstall = async (item: MarketplaceItem) => {
    try {
      await installItem(item)
      showToast(`Installed "${item.name}"`, 'success')
    } catch {
      showToast(`Failed to install "${item.name}"`, 'error')
    }
  }

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Marketplace"
        subtitle="Community dashboards and card presets"
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
            placeholder="Search dashboards..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-card border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelectedTag(null)}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md transition-colors ${
              !selectedTag
                ? 'bg-primary/15 text-primary font-medium'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                selectedTag === tag
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <Tag className="w-3 h-3" />
              {tag}
            </button>
          ))}
        </div>

        <button
          onClick={refresh}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-card border border-border rounded-md transition-colors ml-auto"
          title="Refresh registry"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
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
            {searchQuery || selectedTag ? 'No matching items' : 'No community content yet'}
          </p>
          <p className="text-xs text-muted-foreground/70">
            {searchQuery || selectedTag
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
            />
          ))}
        </div>
      )}
    </div>
  )
}
