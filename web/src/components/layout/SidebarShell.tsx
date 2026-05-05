/**
 * SidebarShell — Reusable sidebar infrastructure component.
 *
 * Provides the common sidebar chrome (collapse/expand, pin, resize, mobile,
 * glass effect) while accepting navigation items and optional feature panels
 * via props. Used by:
 *   - Main console sidebar (Sidebar.tsx)
 *   - Enterprise compliance sidebar (EnterpriseSidebar.tsx)
 *   - Future white-label / partner portals
 */
import { useState, useRef, useEffect, useCallback, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  Plus, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle,
  WifiOff, GripVertical, X, User, Pin, PinOff, Satellite, Loader2,
  ChevronDown,
} from 'lucide-react'
import { iconRegistry } from '../../lib/icons'
import { cn } from '../../lib/cn'
import { Tooltip } from '../ui/Tooltip'
import { SnoozedCards } from './SnoozedCards'
import {
  useSidebarConfig,
  PROTECTED_SIDEBAR_IDS,
  SIDEBAR_COLLAPSED_WIDTH_PX,
  SIDEBAR_DEFAULT_WIDTH_PX,
} from '../../hooks/useSidebarConfig'
import { useMobile } from '../../hooks/useMobile'
import { useClusters } from '../../hooks/mcp/clusters'
import { isClusterUnreachable, isClusterHealthy } from '../clusters/utils'
import { useDashboardContextOptional } from '../../hooks/useDashboardContext'
import type { SnoozedSwap } from '../../hooks/useSnoozedCards'
import type { SnoozedRecommendation } from '../../hooks/useSnoozedRecommendations'
import type { SnoozedMission } from '../../hooks/useSnoozedMissions'
import { useActiveUsers } from '../../hooks/useActiveUsers'
import { useMissions } from '../../hooks/useMissions'
import { ROUTES } from '../../config/routes'
import { DASHBOARD_CONFIGS } from '../../config/dashboards/index'
import { emitSidebarNavigated, emitDashboardRenamed } from '../../lib/analytics'
import { prefetchDashboard } from '../../lib/prefetchDashboard'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import { useUpgradeState } from '../../hooks/useUpgradeState'
import { STORAGE_KEY_GROUND_CONTROL_DASHBOARDS } from '../../lib/constants/storage'
import { SIDEBAR_CONTROLS_LEFT_OFFSET_PX } from '../../lib/constants/ui'
import { safeGetJSON } from '../../lib/utils/localStorage'
import { getSidebarCardCount } from './sidebarCardCount'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NavSection {
  id: string
  label?: string
  items: SidebarNavItem[]
  collapsible?: boolean
}

export interface SidebarNavItem {
  id: string
  label: string
  href: string
  icon: string
  badge?: string
  badgeColor?: string
  /** When true the item came from the user's sidebar config and supports
   *  inline rename / removal.  Maps to `SidebarItem.isCustom`. */
  isCustom?: boolean
}

export interface SidebarFeatures {
  /** Show AI missions panel */
  missions?: boolean
  /** Show Console Studio "Add Card" button */
  addCard?: boolean
  /** Show "Add more dashboards" button */
  addMore?: boolean
  /** Show cluster status summary */
  clusterStatus?: boolean
  /** Show active users count */
  activeUsers?: boolean
  /** Show version check indicator */
  versionCheck?: boolean
  /** Enable drag-drop reorder of nav items */
  dragReorder?: boolean
  /** Enable sidebar resize */
  resize?: boolean
  /** Enable collapse/pin */
  collapsePin?: boolean
  /** Show snoozed cards panel */
  snoozedCards?: boolean
}

export interface SidebarBranding {
  title?: string
  logo?: React.ReactNode
  subtitle?: string
}

export interface SidebarShellProps {
  /** Navigation sections to render */
  navSections: NavSection[]
  /** Optional features to enable */
  features?: SidebarFeatures
  /** Optional branding for white-label */
  branding?: SidebarBranding
  /** Storage key prefix for persistence */
  storageKeyPrefix?: string
  /** Optional footer content */
  footer?: React.ReactNode
  /** Called when "Add more" is clicked */
  onAddMore?: () => void
  /** Called when "Add Card" is clicked */
  onAddCard?: () => void
  /** Custom children rendered between nav and footer */
  children?: React.ReactNode
  /**
   * Override the sidebar width instead of using the shared config width.
   * Used by portal sidebars (e.g. Enterprise) that should not inherit a
   * user-resized width from the main console sidebar.
   */
  widthOverride?: number
}

// ---------------------------------------------------------------------------
// Internal helpers (same as original Sidebar.tsx)
// ---------------------------------------------------------------------------

const SIDEBAR_MIN_WIDTH_PX = 180
const SIDEBAR_MAX_WIDTH_PX = 480

/** Index of the primary (dashboard list) section — "Add more..." button renders after it */
const PRIMARY_SECTION_INDEX = 0

/** Map sidebar item href to dashboard config ID for card count display.
 * NOTE: '/alerts' is intentionally excluded — displaying the card count
 * next to "Alerts" would be confused with the active alert count shown
 * in the header badge (#11404). */
const HREF_TO_DASHBOARD_ID: Record<string, string> = {
  '/': 'main', '/compute': 'compute', '/security': 'security',
  '/gitops': 'gitops', '/storage': 'storage', '/network': 'network',
  '/events': 'events', '/workloads': 'workloads', '/operators': 'operators',
  '/clusters': 'clusters', '/compliance': 'compliance', '/cost': 'cost',
  '/gpu-reservations': 'gpu', '/nodes': 'nodes', '/deployments': 'deployments',
  '/pods': 'pods', '/services': 'services', '/helm': 'helm',
  '/ai-ml': 'ai-ml', '/ci-cd': 'ci-cd',
  '/logs': 'logs', '/data-compliance': 'data-compliance', '/arcade': 'arcade',
  '/deploy': 'deploy', '/ai-agents': 'ai-agents',
  '/llm-d-benchmarks': 'llm-d-benchmarks', '/cluster-admin': 'cluster-admin',
  '/insights': 'insights', '/drasi': 'drasi',
  '/multi-tenancy': 'multi-tenancy', '/acmm': 'acmm',
}

const CUSTOM_DASHBOARD_PREFIX = '/custom-dashboard/'

function isGroundControlItem(href: string): boolean {
  if (!href.startsWith(CUSTOM_DASHBOARD_PREFIX)) return false
  const dashboardId = href.slice(CUSTOM_DASHBOARD_PREFIX.length)
  const gcMapping = safeGetJSON<Record<string, unknown>>(STORAGE_KEY_GROUND_CONTROL_DASHBOARDS) ?? {}
  return dashboardId in gcMapping
}

const SIDEBAR_AUTO_HIDE_MS = 2000

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SidebarShell({
  navSections,
  features = {},
  branding,
  storageKeyPrefix: _storageKeyPrefix,
  footer,
  onAddMore,
  onAddCard,
  children,
  widthOverride,
}: SidebarShellProps) {
  const { config, toggleCollapsed, setCollapsed, reorderItems, updateItem, removeItem, closeMobileSidebar, setWidth } = useSidebarConfig()
  const { isMobile } = useMobile()
  const { deduplicatedClusters } = useClusters()
  const dashboardContext = useDashboardContextOptional()
  const { isFullScreen: isMissionFullScreen } = useMissions()
  const { viewerCount, hasError: viewersError, isLoading: viewersLoading } = useActiveUsers()
  const { hasUpdate, channel, latestMainSHA } = useVersionCheck()
  const upgradeState = useUpgradeState()
  const isUpgrading = upgradeState.phase === 'triggering' || upgradeState.phase === 'restarting'
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  // Close mobile sidebar on route change
  useEffect(() => {
    if (isMobile) {
      closeMobileSidebar()
    }
  }, [location.pathname, isMobile, closeMobileSidebar])

  // ---- Auto-hide: collapse sidebar when mouse leaves, expand on hover ----
  const [isPinned, setIsPinned] = useState(() => {
    try { return localStorage.getItem('sidebar-left-pinned') !== 'false' } catch { return true }
  })
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearAutoHideTimer = useCallback(() => {
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current)
      autoHideTimerRef.current = null
    }
  }, [])

  const handleSidebarMouseEnter = () => {
    clearAutoHideTimer()
    if (!isPinned && config.collapsed && !isMobile) {
      setCollapsed(false)
    }
  }

  const handleSidebarMouseLeave = () => {
    if (!isPinned && !isMobile) {
      clearAutoHideTimer()
      autoHideTimerRef.current = setTimeout(() => {
        setCollapsed(true)
      }, SIDEBAR_AUTO_HIDE_MS)
    }
  }

  const toggleSidebarPin = () => {
    setIsPinned(prev => {
      const next = !prev
      try { localStorage.setItem('sidebar-left-pinned', String(next)) } catch { /* ignore */ }
      if (next) {
        clearAutoHideTimer()
        if (config.collapsed) {
          setCollapsed(false)
        }
      } else if (!config.collapsed) {
        autoHideTimerRef.current = setTimeout(() => setCollapsed(true), SIDEBAR_AUTO_HIDE_MS)
      }
      return next
    })
  }

  useEffect(() => () => clearAutoHideTimer(), [clearAutoHideTimer])

  const isCollapsed = !isMobile && config.collapsed
  const sidebarWidth = isCollapsed
    ? SIDEBAR_COLLAPSED_WIDTH_PX
    : (widthOverride ?? config.width ?? SIDEBAR_DEFAULT_WIDTH_PX)

  // ---- Resize handle ----
  const [isResizing, setIsResizing] = useState(false)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  // Clean up resize listeners on unmount to prevent leaks if mouseup never fires
  useEffect(() => () => { resizeCleanupRef.current?.() }, [])

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    const startX = e.clientX
    const startWidth = widthOverride ?? config.width ?? SIDEBAR_DEFAULT_WIDTH_PX

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.min(
        SIDEBAR_MAX_WIDTH_PX,
        Math.max(SIDEBAR_MIN_WIDTH_PX, startWidth + (moveEvent.clientX - startX))
      )
      setWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      resizeCleanupRef.current = null
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    resizeCleanupRef.current = handleMouseUp
  }

  // ---- Inline rename state ----
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  // ---- Drag and drop state ----
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragOverItem, setDragOverItem] = useState<string | null>(null)
  const [dragSection, setDragSection] = useState<string | null>(null)
  const dragCounter = useRef(0)

  // ---- Cluster status counts ----
  const unreachableClusters = deduplicatedClusters.filter((c) => isClusterUnreachable(c)).length
  const healthyClusters = deduplicatedClusters.filter((c) => !isClusterUnreachable(c) && isClusterHealthy(c)).length
  const unhealthyClusters = deduplicatedClusters.length - healthyClusters - unreachableClusters

  // ---- Snoozed / swap handlers ----
  const handleApplySwap = (_swap: SnoozedSwap) => { navigate(ROUTES.HOME) }
  const handleApplyRecommendation = (_rec: SnoozedRecommendation) => { navigate(ROUTES.HOME) }
  const handleApplyMission = (_mission: SnoozedMission) => { navigate(ROUTES.HOME) }

  // ---- Inline rename handlers ----
  const handleDoubleClick = (item: SidebarNavItem, e: React.MouseEvent) => {
    if (!item.isCustom || !item.href.startsWith('/custom-dashboard/')) return
    e.preventDefault()
    e.stopPropagation()
    setEditingItemId(item.id)
    setEditingName(item.label)
  }

  const handleSaveRename = (itemId: string) => {
    const trimmed = editingName.trim()
    if (trimmed) {
      updateItem(itemId, { name: trimmed })
      emitDashboardRenamed()
    }
    setEditingItemId(null)
    setEditingName('')
  }

  const handleClusterStatusClick = (status: 'healthy' | 'unhealthy' | 'unreachable') => {
    navigate(`${ROUTES.CLUSTERS}?status=${status}`)
  }

  // ---- Drag handlers ----
  const handleDragStart = (e: React.DragEvent, itemId: string, sectionId: string) => {
    setDraggedItem(itemId)
    setDragSection(sectionId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', itemId)
    requestAnimationFrame(() => {
      const target = e.target as HTMLElement
      target.style.opacity = '0.5'
    })
  }

  const handleDragEnd = (e: React.DragEvent) => {
    const target = e.target as HTMLElement
    target.style.opacity = '1'
    setDraggedItem(null)
    setDragOverItem(null)
    setDragSection(null)
    dragCounter.current = 0
  }

  const handleDragEnter = (e: React.DragEvent, itemId: string) => {
    e.preventDefault()
    dragCounter.current++
    if (itemId !== draggedItem) {
      setDragOverItem(itemId)
    }
  }

  const handleDragLeave = () => {
    dragCounter.current--
    if (dragCounter.current === 0) {
      setDragOverItem(null)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, targetId: string, sectionId: string) => {
    e.preventDefault()
    dragCounter.current = 0

    if (!draggedItem || draggedItem === targetId || sectionId !== dragSection) {
      setDraggedItem(null)
      setDragOverItem(null)
      setDragSection(null)
      return
    }

    // Map section IDs back to the sidebar config sections
    const section = sectionId as 'primary' | 'secondary'
    const items = section === 'primary' ? [...config.primaryNav] : [...config.secondaryNav]
    const draggedIndex = items.findIndex(item => item.id === draggedItem)
    const targetIndex = items.findIndex(item => item.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) return

    const [removed] = items.splice(draggedIndex, 1)
    items.splice(targetIndex, 0, removed)

    const reorderedItems = items.map((item, index) => ({ ...item, order: index }))
    reorderItems(reorderedItems, section)

    setDraggedItem(null)
    setDragOverItem(null)
    setDragSection(null)
  }

  // ---- Rendering helpers ----
  const renderIcon = (iconName: string, className?: string) => {
    const IconComponent = iconRegistry[iconName] as React.ComponentType<{ className?: string }> | undefined
    return IconComponent ? <IconComponent className={className} /> : null
  }

  /* Disable drag-reorder on mobile — draggable elements intercept touch
   * events on Safari, preventing NavLink taps from registering. */
  const canDrag = features.dragReorder !== false && !isMobile

  const renderNavItem = (item: SidebarNavItem, sectionId: string) => {
    const isEditing = editingItemId === item.id
    const showTooltip = isCollapsed && !isEditing
    const tooltipContent = showTooltip
      ? `${item.label} — ${t('help.sidebarNavItem')}`
      : ''

    return (
      <Tooltip
        key={item.id}
        content={tooltipContent}
        side="right"
        disabled={!showTooltip}
        wrapperClassName="block w-full"
      >
      <div
        draggable={canDrag && !isCollapsed && !isEditing}
        onDragStart={(e) => handleDragStart(e, item.id, sectionId)}
        onDragEnd={handleDragEnd}
        onDragEnter={(e) => handleDragEnter(e, item.id)}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, item.id, sectionId)}
        className={cn(
          'group relative transition-opacity duration-150 w-full',
          dragOverItem === item.id && dragSection === sectionId && 'before:absolute before:inset-x-0 before:-top-0.5 before:h-0.5 before:bg-purple-500 before:rounded-full',
          draggedItem === item.id && 'opacity-50'
        )}
      >
        {isEditing ? (
          <div className={cn(
            'flex items-center gap-3 rounded-lg text-sm font-medium',
            'bg-purple-500/20 text-purple-400',
            isCollapsed ? 'justify-center p-3' : 'px-3 py-2'
          )}>
            {renderIcon(item.icon, isCollapsed ? 'w-6 h-6' : 'w-5 h-5')}
            {!isCollapsed && (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => handleSaveRename(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveRename(item.id)
                  if (e.key === 'Escape') { setEditingItemId(null); setEditingName('') }
                }}
                autoFocus
                className="w-[150px] md:w-full md:flex-1 shrink bg-transparent border-b border-purple-500 outline-hidden text-foreground text-sm min-w-0"
              />
            )}
            {!isCollapsed && <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
          </div>
        ) : (
          <>
          <NavLink
            to={item.href}
            data-testid="sidebar-item"
            data-test-label={item.label}
            onClick={() => emitSidebarNavigated(item.href)}
            onDoubleClick={(e) => handleDoubleClick(item, e)}
            onMouseEnter={() => prefetchDashboard(item.href)}
            className={({ isActive }) => cn(
              'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-200',
              isActive
                ? 'bg-purple-500/15 text-purple-400 border-l-[3px] border-purple-500 shadow-[inset_0_0_12px_rgba(168,85,247,0.08)]'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50 border-l-[3px] border-transparent',
              isCollapsed ? 'justify-center p-3' : 'px-3 py-2'
            )}
            title={item.isCustom && item.href.startsWith('/custom-dashboard/') ? `${item.label} — ${t('sidebar.doubleClickRename')}` : item.label}
          >
            {renderIcon(item.icon, isCollapsed ? 'w-6 h-6' : 'w-5 h-5')}
            {!isCollapsed && (() => {
              const dashId = HREF_TO_DASHBOARD_ID[item.href]
              // Skip card count for alerts dashboard — the header AlertBadge already
              // shows the actual firing alert count; showing the dashboard card count
              // here (e.g. "5") creates a conflicting signal (#11404).
              const count = dashId && item.href !== '/alerts'
                ? getSidebarCardCount(DASHBOARD_CONFIGS[dashId]) : null
              const isGC = isGroundControlItem(item.href)
              return (
                <span className="flex-1 min-w-0 flex items-center gap-1">
                  <span className="truncate">{item.label}</span>
                  {isGC && (
                    <Satellite className="w-3.5 h-3.5 text-purple-400 shrink-0" aria-label="Ground Control dashboard" />
                  )}
                  {count != null && (
                    <span
                      className="text-[10px] text-muted-foreground/40 tabular-nums ml-0.5 shrink-0"
                      title={t('sidebar.cardCount', { count })}
                    >{count}</span>
                  )}
                </span>
              )
            })()}
          </NavLink>
            {!isCollapsed && canDrag && (
              <span className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-xs rounded px-1 z-10">
                {!PROTECTED_SIDEBAR_IDS.includes(item.id) && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeItem(item.id) }}
                    className="p-1 rounded hover:bg-red-500/20 hover:text-red-400 text-muted-foreground/50 transition-colors"
                    title={t('sidebar.removeFromSidebar')}
                    aria-label={t('sidebar.removeFromSidebar')}
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
                <span
                  className="p-1 rounded hover:bg-secondary text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing transition-colors"
                  aria-hidden="true"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <GripVertical
                    className="w-4 h-4"
                  />
                </span>
              </span>
            )}
          </>
        )}
      </div>
      </Tooltip>
    )
  }

  /** Render a collapsible nav section with header */
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const toggleSection = (id: string) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const renderSection = (section: NavSection, index: number) => {
    const isOpen = !collapsedSections[section.id]

    return (
      <div key={section.id}>
        {/* Divider between sections (except before the first) */}
        {index > 0 && <div className="my-6 border-t border-border/50" />}

        {/* Collapsible section header */}
        {section.label && !isCollapsed && (
          <button
            onClick={() => section.collapsible && toggleSection(section.id)}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors',
              section.collapsible && 'cursor-pointer',
              !section.collapsible && 'cursor-default',
            )}
          >
            <span className="flex-1 text-left">{section.label}</span>
            {section.collapsible && (
              isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
            )}
          </button>
        )}

        {/* Section items */}
        {(isOpen || !section.collapsible) && (
          <nav data-testid={`sidebar-${section.id}-nav`} className="space-y-1">
            {section.items.map(item => renderNavItem(item, section.id))}
          </nav>
        )}
      </div>
    )
  }

  // ---- Main render ----
  return (
    <>
      {/* Mobile backdrop — closes sidebar when tapped outside the sidebar panel */}
      {isMobile && config.isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-overlay md:hidden"
          onClick={closeMobileSidebar}
        />
      )}

      <aside
        data-testid="sidebar"
        data-tour="sidebar"
        onMouseEnter={handleSidebarMouseEnter}
        onMouseLeave={handleSidebarMouseLeave}
        className={cn(
          'fixed left-0 top-16 bottom-0 glass border-r border-border/50 overflow-y-auto scroll-enhanced',
          isMobile ? 'z-modal touch-manipulation' : 'z-sidebar',
          !isResizing && 'transition-[width,transform,padding] duration-300',
          !isMobile && (config.collapsed ? 'p-3' : 'p-4'),
          isMobile && 'p-4',
          isMobile && !config.isMobileOpen && '-translate-x-full hidden md:flex',
          isMobile && config.isMobileOpen && 'translate-x-0'
        )}
        style={{ width: isMobile ? SIDEBAR_DEFAULT_WIDTH_PX : sidebarWidth }}
      >
        {/* Branding header */}
        {branding && !isCollapsed && (
          <div className="mb-4">
            <div className="flex items-center gap-2">
              {branding.logo}
              {branding.title && (
                <h1 className="text-base font-semibold text-foreground">{branding.title}</h1>
              )}
            </div>
            {branding.subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{branding.subtitle}</p>
            )}
          </div>
        )}

        {/* Navigation sections with "Add more" button after the primary section */}
        {navSections.map((section, index) => {
          return (
            <Fragment key={section.id}>
              {renderSection(section, index)}

              {/* "Add more" button — placed after the primary dashboard list */}
              {index === PRIMARY_SECTION_INDEX && features.addMore && !isCollapsed && (
                <button
                  data-testid="sidebar-customize"
                  onClick={() => onAddMore?.() ?? dashboardContext?.openAddCardModal('dashboards')}
                  className="w-full flex items-center gap-3 px-3 py-1.5 mt-1 text-xs text-muted-foreground/60 hover:text-muted-foreground hover:bg-secondary/30 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('sidebar.addMore', 'Add dashboard cards…')}</span>
                </button>
              )}
            </Fragment>
          )
        })}

        {/* Snoozed card swaps */}
        {features.snoozedCards && !isCollapsed && (
          <div data-tour="snoozed" className="min-w-0">
            <SnoozedCards
              onApplySwap={handleApplySwap}
              onApplyRecommendation={handleApplyRecommendation}
              onApplyMission={handleApplyMission}
            />
          </div>
        )}

        {/* Custom children */}
        {children}

        {/* Add card button */}
        {features.addCard && !isCollapsed && (
          <div className="mt-6">
            <button
              data-testid="sidebar-add-card"
              onClick={onAddCard}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-purple-500/50 hover:bg-purple-500/10 transition-all duration-200"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span className="text-sm">{t('buttons.addCard')}</span>
            </button>
          </div>
        )}

        {/* Cluster status summary */}
        {features.clusterStatus && !isCollapsed && (
          <div data-testid="sidebar-cluster-status" className="mt-6 p-4 rounded-lg bg-secondary/30">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              {t('labels.clusterStatus')}
            </h4>
            {deduplicatedClusters.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('labels.noClusters')}</p>
            ) : (
            <div className="space-y-2">
              {healthyClusters > 0 && (
              <button
                onClick={() => handleClusterStatusClick('healthy')}
                className="w-full flex items-center justify-between hover:bg-secondary/50 rounded px-1 py-0.5 transition-colors"
              >
                <span className="flex items-center gap-1.5 text-sm text-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400" aria-hidden="true" />
                  {t('labels.healthy')}
                </span>
                <span
                  className="text-sm font-medium text-green-400"
                  title={t('sidebar.healthyClusters', { count: healthyClusters })}
                >{healthyClusters}</span>
              </button>
              )}
              {unhealthyClusters > 0 && (
              <button
                onClick={() => handleClusterStatusClick('unhealthy')}
                className="w-full flex items-center justify-between hover:bg-secondary/50 rounded px-1 py-0.5 transition-colors"
              >
                <span className="flex items-center gap-1.5 text-sm text-foreground">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" aria-hidden="true" />
                  {t('labels.unhealthy')}
                </span>
                <span
                  className="text-sm font-medium text-red-400"
                  title={t('sidebar.unhealthyClusters', { count: unhealthyClusters })}
                >{unhealthyClusters}</span>
              </button>
              )}
              {unreachableClusters > 0 && (
              <button
                onClick={() => handleClusterStatusClick('unreachable')}
                className="w-full flex items-center justify-between hover:bg-secondary/50 rounded px-1 py-0.5 transition-colors"
              >
                <span className="flex items-center gap-1.5 text-sm text-foreground">
                  <WifiOff className="w-3.5 h-3.5 text-yellow-400" aria-hidden="true" />
                  {t('labels.offline')}
                </span>
                <span
                  className="text-sm font-medium text-yellow-400"
                  title={t('sidebar.unreachableClusters', { count: unreachableClusters })}
                >{unreachableClusters}</span>
              </button>
              )}
              {healthyClusters === 0 && unhealthyClusters === 0 && unreachableClusters === 0 && (
                <span className="text-xs text-muted-foreground italic">{t('labels.noClusters', 'No clusters configured')}</span>
              )}
            </div>
            )}
          </div>
        )}

        {/* Viewer count + commit hash — separated from cluster status to prevent
          * the commit SHA from visually merging with cluster counts (#11403). */}
        {features.activeUsers && !isCollapsed && (
          <div className="mt-auto pt-4 border-t border-border/30 flex flex-col items-center gap-1">
            <div className="flex items-center justify-center gap-2">
              <div
                className="flex items-center gap-1 px-2 text-muted-foreground/60"
                aria-label={t('sidebar.activeViewers', { count: viewerCount })}
              >
                <User className={cn('w-3 h-3', viewersError && 'text-red-400')} aria-hidden="true" />
                <span className="text-2xs tabular-nums" aria-hidden="true">
                  {viewersError ? '!' : viewersLoading ? '…' : viewerCount}
                </span>
              </div>
              <span className="text-2xs text-muted-foreground/40 font-mono" aria-label={`Commit: ${__COMMIT_HASH__}`}>
                #{__COMMIT_HASH__.substring(0, 7)}
              </span>
            </div>
            {/* Developer mode: warn when running an older commit, or show upgrade progress */}
            {features.versionCheck && channel === 'developer' && hasUpdate && (
              <div
                className={cn(
                  'flex items-center gap-1 text-2xs',
                  isUpgrading ? 'text-cyan-400/80' : 'text-yellow-400/80',
                )}
                title={isUpgrading
                  ? t('update.upgrading', 'Upgrading...')
                  : `Behind main — latest: ${latestMainSHA?.substring(0, 7) ?? 'unknown'}`}
              >
                {isUpgrading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <AlertTriangle className="w-3 h-3" />
                )}
                <span>
                  {isUpgrading
                    ? t('update.upgrading', 'Upgrading...')
                    : t('sidebar.behindMain', 'Behind main')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Custom footer */}
        {footer}
      </aside>

      {/* Collapse + Pin controls */}
      {features.collapsePin !== false && !isMobile && !isMissionFullScreen && (
        <div
          className="fixed top-18 z-sidebar flex flex-col gap-1.5 items-center transition-[left] duration-300 bg-background border border-border/50 rounded-full p-1 shadow-md"
          style={{ left: sidebarWidth + SIDEBAR_CONTROLS_LEFT_OFFSET_PX }}
        >
          <button
            data-testid="sidebar-collapse-toggle"
            onClick={() => {
              if (config.collapsed) {
                setCollapsed(false)
                if (!isPinned) {
                  setIsPinned(true)
                  try { localStorage.setItem('sidebar-left-pinned', 'true') } catch { /* ignore */ }
                  clearAutoHideTimer()
                }
              } else {
                toggleCollapsed()
              }
            }}
            aria-expanded={!config.collapsed}
            className="hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
            title={config.collapsed ? t('layout.sidebar.expandSidebar') : t('layout.sidebar.collapseSidebar')}
            aria-label={config.collapsed ? t('layout.sidebar.expandSidebar') : t('layout.sidebar.collapseSidebar')}
          >
            {config.collapsed ? <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />}
          </button>
          <button
            onClick={toggleSidebarPin}
            aria-pressed={isPinned}
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-full transition-colors",
              isPinned
                ? "bg-purple-500/15 text-purple-400 hover:bg-purple-500/25"
                : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
            )}
            title={isPinned ? t('layout.sidebar.unpinSidebar') : t('layout.sidebar.pinSidebar')}
            aria-label={isPinned ? t('layout.sidebar.unpinSidebar') : t('layout.sidebar.pinSidebar')}
          >
            {isPinned ? <Pin className="w-3.5 h-3.5" aria-hidden="true" /> : <PinOff className="w-3.5 h-3.5" aria-hidden="true" />}
          </button>
        </div>
      )}

      {/* Resize handle */}
      {features.resize !== false && !isCollapsed && !isMobile && (
        <div
          onMouseDown={handleResizeStart}
          className={cn(
            "fixed bottom-0 cursor-col-resize z-sidebar hover:bg-purple-500/30 transition-colors hidden md:block",
            isResizing && "bg-purple-500/50"
          )}
          style={{ top: 160, left: sidebarWidth - 3, width: 6 }}
        />
      )}
    </>
  )
}
