import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Store, Search, Download, Tag, RefreshCw, Loader2, AlertCircle, Package,
  Check, Trash2, LayoutGrid, Puzzle, Palette, ExternalLink, Heart,
  HandHelping, ChevronDown, ChevronUp, Star, GraduationCap, Sparkles,
  List, Grid3X3, SortAsc, SortDesc,
} from 'lucide-react'
import { useMarketplace, MarketplaceItem, MarketplaceItemType, CNCFStats } from '../../hooks/useMarketplace'
import { useSidebarConfig } from '../../hooks/useSidebarConfig'
import { useToast } from '../ui/Toast'
import { DashboardHeader } from '../shared/DashboardHeader'
import { MarketplaceThumbnail } from './MarketplaceThumbnail'
import { suggestIconSync } from '../../lib/iconSuggester'

type ViewMode = 'grid' | 'list'
type SortField = 'name' | 'author' | 'type' | 'difficulty'
type SortOrder = 'asc' | 'desc'

const VIEW_MODE_KEY = 'kc-marketplace-view-mode'
const CONTRIBUTE_URL = 'https://github.com/kubestellar/console-marketplace'
const ISSUES_URL = 'https://github.com/kubestellar/console-marketplace/issues?q=is%3Aissue%20is%3Aopen%20field.label%3Ahelp%20wanted'
const BANNER_COLLAPSED_KEY = 'kc-cncf-banner-collapsed'

const TYPE_LABELS: Record<MarketplaceItemType, { label: string; icon: typeof LayoutGrid }> = {
  dashboard: { label: 'Dashboards', icon: LayoutGrid },
  'card-preset': { label: 'Card Presets', icon: Puzzle },
  theme: { label: 'Themes', icon: Palette },
}

const DIFFICULTY_CONFIG = {
  beginner: { label: 'Beginner', color: 'text-green-400 bg-green-500/10', stars: 1 },
  intermediate: { label: 'Intermediate', color: 'text-yellow-400 bg-yellow-500/10', stars: 2 },
  advanced: { label: 'Advanced', color: 'text-red-400 bg-red-500/10', stars: 3 },
} as const

const MATURITY_CONFIG = {
  graduated: { label: 'Graduated', color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/20' },
  incubating: { label: 'Incubating', color: 'text-blue-400 bg-blue-500/15 border-blue-500/20' },
} as const

// --- CNCF Progress Banner ---
function CNCFProgressBanner({ stats }: { stats: CNCFStats }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(BANNER_COLLAPSED_KEY) === 'true' } catch { return false }
  })

  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(BANNER_COLLAPSED_KEY, String(next)) } catch { /* ok */ }
  }

  if (stats.total === 0) return null

  const pct = Math.round((stats.completed / stats.total) * 100)

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <button
        onClick={toggleCollapse}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-left">
            <span className="text-sm font-medium text-foreground">CNCF Project Coverage</span>
            <span className="text-xs text-muted-foreground ml-2">
              {stats.completed} of {stats.total} cards implemented
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground">{pct}%</span>
          {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {!collapsed && (
        <div className="px-5 pb-4 space-y-3">
          {/* Progress bar */}
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {stats.graduatedTotal} Graduated
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              {stats.incubatingTotal} Incubating
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {stats.helpWanted} Help Wanted
            </span>
          </div>

          {/* Action links */}
          <div className="flex items-center gap-2">
            <a
              href={ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-md transition-colors"
            >
              <HandHelping className="w-3 h-3" />
              Browse Issues
            </a>
            <a
              href={CONTRIBUTE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Contributor Guide
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Marketplace Card ---
function MarketplaceCard({ item, onInstall, onRemove, isInstalled }: {
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

  return (
    <div className={`group bg-card border rounded-lg overflow-hidden transition-all hover:shadow-lg ${
      isHelpWanted
        ? 'border-dashed border-amber-500/20 hover:border-amber-500/40'
        : 'border-border hover:border-primary/30'
    }`}>
      {/* Thumbnail */}
      <div className="relative">
        {item.screenshot ? (
          <div className="h-36 bg-muted overflow-hidden">
            <img
              src={item.screenshot}
              alt={item.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </div>
        ) : (
          <MarketplaceThumbnail
            itemId={item.id}
            itemType={item.type}
            className="group-hover:scale-105 transition-transform duration-300 origin-center"
            cncfCategory={item.cncfProject?.category}
            isHelpWanted={isHelpWanted}
          />
        )}
        {/* Help Wanted badge */}
        {isHelpWanted && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-500/30 rounded-md backdrop-blur-sm">
            <HandHelping className="w-3 h-3" />
            Help Wanted
          </div>
        )}
        {/* CNCF badge */}
        {item.cncfProject && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-bold bg-card/80 backdrop-blur-sm text-muted-foreground rounded border border-border/50">
            CNCF
          </div>
        )}
      </div>

      <div className="p-4">
        {/* Title + type + version */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="text-sm font-semibold text-foreground line-clamp-1">{item.name}</h3>
          <div className="flex items-center gap-1 shrink-0">
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              <typeInfo.icon className="w-2.5 h-2.5" />
              {typeInfo.label.replace(/s$/, '')}
            </span>
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              v{item.version}
            </span>
          </div>
        </div>

        {/* Maturity pill */}
        {item.cncfProject && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${MATURITY_CONFIG[item.cncfProject.maturity].color}`}>
              {MATURITY_CONFIG[item.cncfProject.maturity].label}
            </span>
            <span className="text-[10px] text-muted-foreground">{item.cncfProject.category}</span>
          </div>
        )}

        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{item.description}</p>

        {/* Tags / Skills */}
        <div className="flex flex-wrap gap-1 mb-3">
          {isHelpWanted && item.skills ? (
            item.skills.slice(0, 3).map(skill => (
              <span key={skill} className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
                {skill}
              </span>
            ))
          ) : (
            item.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                {tag}
              </span>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isHelpWanted && item.difficulty ? (
              <DifficultyBadge difficulty={item.difficulty} />
            ) : (
              <>
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
              </>
            )}
          </div>

          {/* Action button */}
          {isHelpWanted ? (
            <a
              href={item.issueUrl || ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-md transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              Contribute
            </a>
          ) : isInstalled ? (
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

function DifficultyBadge({ difficulty }: { difficulty: 'beginner' | 'intermediate' | 'advanced' }) {
  const config = DIFFICULTY_CONFIG[difficulty]
  return (
    <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${config.color}`}>
      {Array.from({ length: config.stars }).map((_, i) => (
        <Star key={i} className="w-2.5 h-2.5 fill-current" />
      ))}
      {config.label}
    </span>
  )
}

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
      isHelpWanted ? 'border-dashed border-amber-500/20' : 'border-border'
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
            <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-amber-950/80 text-amber-300 border border-amber-500/30 rounded">
              Help Wanted
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground truncate">{item.description}</p>
      </div>

      {/* Author */}
      <span className="text-xs text-muted-foreground shrink-0 w-20 truncate hidden sm:block">{item.author}</span>

      {/* Type label */}
      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0 hidden md:block">
        {typeInfo.label.replace(/s$/, '')}
      </span>

      {/* Difficulty (for help-wanted) */}
      {isHelpWanted && item.difficulty ? (
        <div className="shrink-0 hidden lg:block">
          <DifficultyBadge difficulty={item.difficulty} />
        </div>
      ) : (
        <span className="text-[10px] text-muted-foreground shrink-0 w-10 text-right hidden lg:block">v{item.version}</span>
      )}

      {/* Action */}
      <div className="shrink-0">
        {isHelpWanted ? (
          <a
            href={item.issueUrl || ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded transition-colors"
          >
            <Sparkles className="w-3 h-3" />
            Contribute
          </a>
        ) : isInstalled ? (
          <div className="flex items-center gap-1">
            <span className="flex items-center gap-0.5 px-2 py-1 text-[10px] font-medium text-green-400 bg-green-500/10 rounded">
              <Check className="w-3 h-3" />
            </span>
            <button
              onClick={handleRemove}
              disabled={removing}
              className="flex items-center px-1.5 py-1 text-[10px] text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
            >
              {removing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            </button>
          </div>
        ) : (
          <button
            onClick={handleInstall}
            disabled={installing}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors disabled:opacity-50"
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
    try { return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || 'grid' } catch { return 'grid' }
  })
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

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
    const sorted = [...items].sort((a, b) => {
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
    return sorted
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
  }, [sortedItems, showHelpWanted])

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
        // Add to sidebar if not already present
        const alreadyInSidebar = [...sidebarConfig.primaryNav, ...sidebarConfig.secondaryNav]
          .some(si => si.href === href)
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
      />

      {/* CNCF Progress Banner */}
      {!isLoading && cncfStats.total > 0 && (
        <CNCFProgressBanner stats={cncfStats} />
      )}

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
          <button onClick={() => { setSelectedType(null); setShowHelpWanted(false) }} className={filterBtnClass(!selectedType && !showHelpWanted)}>
            All
            <span className="text-[10px] ml-0.5 opacity-60">{typeCounts.all}</span>
          </button>
          {(Object.entries(TYPE_LABELS) as [MarketplaceItemType, typeof TYPE_LABELS[MarketplaceItemType]][]).map(([type, { label, icon: Icon }]) => (
            <button
              key={type}
              onClick={() => { setSelectedType(selectedType === type ? null : type); setShowHelpWanted(false) }}
              className={filterBtnClass(selectedType === type && !showHelpWanted)}
            >
              <Icon className="w-3 h-3" />
              {label}
              <span className="text-[10px] ml-0.5 opacity-60">{typeCounts[type]}</span>
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
                    ? 'bg-amber-500/15 text-amber-400 font-medium'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <HandHelping className="w-3 h-3" />
                Help Wanted
                <span className={`text-[10px] ml-0.5 ${showHelpWanted ? 'text-amber-400/70' : 'text-muted-foreground/60'}`}>
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
                className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ${
                  selectedTag === cat
                    ? 'bg-amber-500/15 text-amber-400 font-medium'
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
            <span className="text-[10px] text-muted-foreground mr-1">Sort:</span>
            {(['name', 'type', 'author', ...(showHelpWanted ? ['difficulty' as SortField] : [])] as SortField[]).map(field => (
              <button
                key={field}
                onClick={() => toggleSort(field)}
                className={`flex items-center gap-0.5 px-2 py-1 text-[10px] rounded transition-colors ${
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
              className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              title="Grid view"
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => toggleViewMode('list')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
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
        // Grouped view for help-wanted items
        <div className="space-y-6">
          {groupedItems
            .filter(([cat]) => !selectedTag || cat === selectedTag)
            .map(([category, categoryItems]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{category}</h3>
                <span className="text-[10px] text-muted-foreground/60">{categoryItems.length} {categoryItems.length === 1 ? 'project' : 'projects'}</span>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
          <Heart className="w-5 h-5 text-pink-400 shrink-0" />
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-md transition-colors"
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
