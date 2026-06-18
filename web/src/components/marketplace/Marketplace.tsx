/* eslint-disable max-lines -- TODO: split this file (tracked by #15790) */
import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Store, Download,
  Check, Trash2, LayoutGrid, Puzzle, Palette, ExternalLink, Heart,
  HandHelping, ChevronDown, ChevronUp, Star, GraduationCap, Sparkles,
  Coins } from 'lucide-react'
import { useMarketplace, useAuthorProfile, MarketplaceItem, MarketplaceItemType, CNCFStats } from '../../hooks/useMarketplace'
import { useSidebarConfig } from '../../hooks/useSidebarConfig'
import { useToast } from '../ui/Toast'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'
import { MarketplaceThumbnail } from './MarketplaceThumbnail'
import { NAV_AFTER_ANIMATION_MS } from '../../lib/constants/network'
import { suggestIconSync } from '../../lib/iconSuggester'
import { useTranslation } from 'react-i18next'
import type { CSSProperties } from 'react'
import { validateExternalUrl } from '../../lib/validateExternalUrl'
import { MarketplaceControls, type SortField, type SortOrder, type ViewMode } from './MarketplaceControls'
import { MarketplaceContent } from './MarketplaceContent'

// Inline style constants
const MARKETPLACE_DIV_STYLE_1: CSSProperties = { gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }


const VIEW_MODE_KEY = 'kc-marketplace-view-mode'
const CONTRIBUTE_URL = 'https://github.com/kubestellar/console-marketplace'
const ISSUES_URL = 'https://github.com/kubestellar/console-marketplace/issues?q=is%3Aissue%20is%3Aopen%20field.label%3Ahelp%20wanted'
const BANNER_COLLAPSED_KEY = 'kc-cncf-banner-collapsed'
const MAX_SKILLS = 3
const MAX_TAGS = 3
const MAX_THEME_COLORS = 5

const TYPE_LABELS: Record<MarketplaceItemType, { label: string; icon: typeof LayoutGrid }> = {
  dashboard: { label: 'Dashboards', icon: LayoutGrid },
  'card-preset': { label: 'Card Presets', icon: Puzzle },
  theme: { label: 'Themes', icon: Palette } }

const DIFFICULTY_CONFIG = {
  beginner: { label: 'Beginner', color: 'text-green-400 bg-green-950', stars: 1 },
  intermediate: { label: 'Intermediate', color: 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10', stars: 2 },
  advanced: { label: 'Advanced', color: 'text-red-400 bg-red-950', stars: 3 } } as const

const MATURITY_CONFIG = {
  graduated: { label: 'Graduated', color: 'text-green-400 bg-green-950 border-green-800' },
  incubating: { label: 'Incubating', color: 'text-blue-400 bg-blue-950 border-blue-800' } } as const

// --- CNCF Progress Banner ---
function CNCFProgressBanner({ stats }: { stats: CNCFStats }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(BANNER_COLLAPSED_KEY) === 'true' } catch { return false }
  })

  // Sync banner collapsed state across tabs (fix #6006).
  // The `storage` event only fires in OTHER tabs when localStorage changes,
  // so toggling in tab A will update tab B automatically.
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== BANNER_COLLAPSED_KEY) return
      // If the key was removed, e.newValue is null — default to not collapsed.
      setCollapsed(e.newValue === 'true')
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

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
          <div className="w-8 h-8 rounded-lg bg-linear-to-br from-blue-900 to-cyan-900 flex items-center justify-center">
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
              className="h-full bg-linear-to-r from-green-500 to-cyan-500 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              {stats.graduatedTotal} Graduated
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              {stats.incubatingTotal} Incubating
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              {stats.helpWanted} Help Wanted
            </span>
          </div>

          {/* Action links */}
          <div className="flex items-center gap-2">
            <a
              href={ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-md transition-colors"
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
  const { t } = useTranslation()
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
        ? 'border-dashed border-yellow-500/20 hover:border-yellow-500/40'
        : 'border-border hover:border-primary/30'
    }`}>
      {/* Thumbnail */}
      <div className="relative">
        {item.screenshot ? (
          <div className="h-20 bg-muted overflow-hidden">
            <img
              src={item.screenshot}
              alt={item.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
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
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 text-2xs font-semibold bg-yellow-500/10 text-yellow-600 dark:text-yellow-300 border border-yellow-500/20 rounded-md">
            <HandHelping className="w-3 h-3" />
            Help Wanted
          </div>
        )}
        {/* CNCF badge — only shown on non-gradient thumbnails (gradient header already shows category) */}
        {item.cncfProject && !item.cncfProject.category && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-bold bg-card text-muted-foreground rounded border border-border">
            CNCF
          </div>
        )}
      </div>

      <div className="p-4">
        {/* Title + type + version */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="text-sm font-semibold text-foreground line-clamp-1">{item.name}</h3>
          <div className="flex items-center gap-1 shrink-0">
            <span className="flex items-center gap-0.5 text-2xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              <typeInfo.icon className="w-2.5 h-2.5" />
              {typeInfo.label.replace(/s$/, '')}
            </span>
            <span className="text-2xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              v{item.version}
            </span>
          </div>
        </div>

        {/* Maturity pill */}
        {item.cncfProject && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className={`text-2xs font-medium px-1.5 py-0.5 rounded border ${MATURITY_CONFIG[item.cncfProject.maturity].color}`}>
              {MATURITY_CONFIG[item.cncfProject.maturity].label}
            </span>
            <span className="text-2xs text-muted-foreground">{item.cncfProject.category}</span>
          </div>
        )}

        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{item.description}</p>

        {/* Tags / Skills */}
        <div className="flex flex-wrap gap-1 mb-3">
          {isHelpWanted && item.skills ? (
            (item.skills || []).slice(0, MAX_SKILLS).map(skill => (
              <span key={skill} className="text-2xs px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
                {skill}
              </span>
            ))
          ) : (
            (item.tags || []).slice(0, MAX_TAGS).map(tag => (
              <span key={tag} className="text-2xs px-1.5 py-0.5 bg-primary/80 text-primary-foreground rounded">
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
                <AuthorBadge author={item.author} github={item.authorGithub} />
                <span>&middot;</span>
                {item.type === 'theme' && item.themeColors ? (
                  <div className="flex gap-0.5">
                    {(item.themeColors || []).slice(0, MAX_THEME_COLORS).map((color, i) => (
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
              href={validateExternalUrl(item.issueUrl) || ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-md transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              Contribute
            </a>
          ) : isInstalled ? (
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 px-2 py-1 text-2xs font-medium text-green-400 bg-green-950 rounded">
                <Check className="w-3 h-3" />
                Installed
              </span>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="flex items-center gap-1 px-2 py-1 text-2xs text-red-400 hover:bg-red-950 rounded transition-colors disabled:opacity-50"
                title={t('common.remove')}
              >
                {removing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              </button>
            </div>
          ) : (
            <button
              onClick={handleInstall}
              disabled={installing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/80 hover:bg-primary text-primary-foreground rounded-md transition-colors disabled:opacity-50"
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

// --- Author Badge with Hover Profile Card ---
function AuthorBadge({ author, github, compact }: { author: string; github?: string; compact?: boolean }) {
  const [hovered, setHovered] = useState(false)
  const triggerRef = useRef<HTMLAnchorElement | HTMLSpanElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const profile = useAuthorProfile(github, hovered)

  const updatePos = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ x: rect.left + rect.width / 2, y: rect.top - 8 })
  }

  const handleEnter = () => {
    updatePos()
    setHovered(true)
  }

  // Dismiss tooltip on scroll (fix #6007).
  // The tooltip captures its position once on mouse enter and does not
  // track the trigger on scroll, so it detaches visually. Dismissing on
  // scroll matches user expectation (the cursor has left the trigger anyway).
  // Capture phase is used to catch scrolls in any nested container.
  useEffect(() => {
    if (!hovered) return
    const dismiss = () => setHovered(false)
    window.addEventListener('scroll', dismiss, { capture: true, passive: true })
    return () => window.removeEventListener('scroll', dismiss, { capture: true })
  }, [hovered])

  if (!github) {
    return <span>{author}</span>
  }

  const link = (
    <a
      ref={triggerRef as React.RefObject<HTMLAnchorElement | null>}
      href={`https://github.com/${github}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary/80 hover:text-primary transition-colors hover:underline"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => e.stopPropagation()}
    >
      @{github}
    </a>
  )

  if (compact) return link

  return (
    <>
      {link}
      {createPortal(
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.15 }}
              className="fixed z-dropdown pointer-events-none"
              style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -100%)' }}
            >
              <div className="px-4 py-3 bg-background border border-border rounded-lg shadow-xl backdrop-blur-xs min-w-[200px]">
                <div className="flex items-center gap-3 mb-2">
                  <img
                    src={`https://github.com/${github}.png?size=80`}
                    alt={github}
                    className="w-10 h-10 rounded-full border border-border"
                    loading="lazy"
                    width={40}
                    height={40}
                  />
                  <div>
                    <div className="text-sm font-semibold text-white">@{github}</div>
                    <div className="text-2xs text-muted-foreground">Contributor</div>
                  </div>
                </div>
                {profile.loading ? (
                  <div className="text-[11px] text-muted-foreground">Loading stats...</div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <Coins className="w-3.5 h-3.5 text-yellow-400" />
                      <span className="text-yellow-300 font-medium">{profile.coins.toLocaleString()} coins</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {profile.consolePRs} PR{profile.consolePRs !== 1 ? 's' : ''} to console
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {profile.marketplacePRs} PR{profile.marketplacePRs !== 1 ? 's' : ''} to marketplace
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}

function DifficultyBadge({ difficulty }: { difficulty: 'beginner' | 'intermediate' | 'advanced' }) {
  const config = DIFFICULTY_CONFIG[difficulty]
  return (
    <span className={`flex items-center gap-1 text-2xs font-medium px-1.5 py-0.5 rounded ${config.color}`}>
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
        <p className="text-[11px] text-muted-foreground truncate">{item.description}</p>
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
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded transition-colors"
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

      <MarketplaceControls
        isLoading={isLoading}
        error={error}
        itemCount={items.length}
        searchPlaceholder={t('common.searchMarketplace')}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        selectedType={selectedType}
        onSelectedTypeChange={setSelectedType}
        showHelpWanted={showHelpWanted}
        onShowHelpWantedChange={setShowHelpWanted}
        typeCounts={typeCounts}
        helpWantedCount={cncfStats.helpWanted}
        allTags={allTags}
        selectedTag={selectedTag}
        onSelectedTagChange={setSelectedTag}
        cncfCategories={cncfCategories}
        sortField={sortField}
        sortOrder={sortOrder}
        onToggleSort={toggleSort}
        viewMode={viewMode}
        onViewModeChange={toggleViewMode}
      />

      <MarketplaceContent
        isLoading={isLoading}
        error={error}
        items={items}
        searchQuery={searchQuery}
        selectedTag={selectedTag}
        selectedType={selectedType}
        refresh={refresh}
        showHelpWanted={showHelpWanted}
        groupedItems={groupedItems}
        viewMode={viewMode}
        sortedItems={sortedItems}
        renderList={(contentItems) => (
          <div className="space-y-1.5">
            {contentItems.map(item => (
              <MarketplaceRow
                key={item.id}
                item={item}
                onInstall={handleInstall}
                onRemove={handleRemove}
                isInstalled={isInstalled(item.id)}
              />
            ))}
          </div>
        )}
        renderGrid={(contentItems) => (
          <div className="grid gap-4" style={MARKETPLACE_DIV_STYLE_1}>
            {contentItems.map(item => (
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
      />

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
