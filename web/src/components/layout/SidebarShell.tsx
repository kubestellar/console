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
import { useState, useRef, useEffect, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { cn } from '../../lib/cn'
import { ROUTES } from '../../config/routes'
import { SnoozedCards } from './SnoozedCards'
import {
  useSidebarConfig,
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
import { emitDashboardRenamed } from '../../lib/analytics'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import { useUpgradeState } from '../../hooks/useUpgradeState'
import { NAVBAR_HEIGHT_PX } from '../../lib/constants/ui'
import { moveFocusByKey } from '../../lib/a11y/rovingFocus'
import { useEscapeLayer, useModalFocusTrap } from '../../lib/modals'
import { useSidebarPin } from './sidebar/useSidebarPin'
import { useSidebarResize } from './sidebar/useSidebarResize'
import { useSidebarDragDrop } from './sidebar/useSidebarDragDrop'
import { SidebarNavItemRow } from './sidebar/SidebarNavItemRow'
import { SidebarClusterStatus } from './sidebar/SidebarClusterStatus'
import { SidebarActiveUsersFooter } from './sidebar/SidebarActiveUsersFooter'
import { SidebarCollapseControls } from './sidebar/SidebarCollapseControls'

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
const SIDEBAR_RESIZE_STEP_PX = 16
const SIDEBAR_RESIZE_HANDLE_TOP_PX = 160
const SIDEBAR_RESIZE_HANDLE_OFFSET_PX = 3
const SIDEBAR_RESIZE_HANDLE_WIDTH_PX = 6

/** Index of the primary (dashboard list) section — "Add more..." button renders after it */
const PRIMARY_SECTION_INDEX = 0

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
  const sidebarRef = useRef<HTMLElement | null>(null)
  const isMobileSidebarOpen = isMobile && config.isMobileOpen
  const isTopEscapeLayer = useEscapeLayer(isMobileSidebarOpen)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  // Close mobile sidebar on route change
  useEffect(() => {
    if (isMobile) closeMobileSidebar()
  }, [location.pathname, isMobile, closeMobileSidebar])

  useEffect(() => {
    if (isMobileSidebarOpen && sidebarRef.current) sidebarRef.current.scrollTop = 0
  }, [isMobileSidebarOpen])

  useModalFocusTrap(sidebarRef, isMobileSidebarOpen)

  useEffect(() => {
    if (!isMobileSidebarOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isTopEscapeLayer() || editingItemId !== null) return
      event.preventDefault()
      event.stopPropagation()
      closeMobileSidebar()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeMobileSidebar, editingItemId, isMobileSidebarOpen, isTopEscapeLayer])

  const isCollapsed = !isMobile && config.collapsed
  const sidebarWidth = isCollapsed ? SIDEBAR_COLLAPSED_WIDTH_PX : (widthOverride ?? config.width ?? SIDEBAR_DEFAULT_WIDTH_PX)

  const { isPinned, handleSidebarMouseEnter, handleSidebarMouseLeave, toggleSidebarPin } = useSidebarPin({
    isCollapsed, isMobile, collapsed: config.collapsed, setCollapsed,
  })

  const { isResizing, handleResizeStart, handleResizeKeyDown } = useSidebarResize({
    sidebarWidth, widthOverride, configWidth: config.width, setWidth,
    SIDEBAR_DEFAULT_WIDTH_PX, SIDEBAR_MIN_WIDTH_PX, SIDEBAR_MAX_WIDTH_PX, SIDEBAR_RESIZE_STEP_PX,
  })

  const {
    draggedItem, dragOverItem, dragSection,
    handleDragStart, handleDragEnd, handleDragEnter,
    handleDragLeave, handleDragOver, handleDrop,
  } = useSidebarDragDrop({ primaryNav: config.primaryNav, secondaryNav: config.secondaryNav, reorderItems })

  const unreachableClusters = deduplicatedClusters.filter((c) => isClusterUnreachable(c)).length
  const healthyClusters = deduplicatedClusters.filter((c) => !isClusterUnreachable(c) && isClusterHealthy(c)).length
  const unhealthyClusters = deduplicatedClusters.length - healthyClusters - unreachableClusters

  // ---- Snoozed / swap handlers ----
  const handleApplySwap = (_s: SnoozedSwap) => navigate(ROUTES.HOME)
  const handleApplyRecommendation = (_r: SnoozedRecommendation) => navigate(ROUTES.HOME)
  const handleApplyMission = (_m: SnoozedMission) => navigate(ROUTES.HOME)

  const handleMobileBackdropClose = () => {
    if (editingItemId !== null) return
    closeMobileSidebar()
  }

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

  const handleCancelRename = () => { setEditingItemId(null); setEditingName('') }
  const handleClusterStatusClick = (status: 'healthy' | 'unhealthy' | 'unreachable') => navigate(`${ROUTES.CLUSTERS}?status=${status}`)
  const canDrag = features.dragReorder !== false && !isMobile

  /** Render a collapsible nav section with header */
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const toggleSection = (id: string) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const renderSection = (section: NavSection, index: number) => {
    const isOpen = !collapsedSections[section.id]

    return (
      <div key={section.id}>
        {index > 0 && <div className="my-6 border-t border-border/50" />}

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
              isOpen
                ? <span className="text-xs">▾</span>
                : <span className="text-xs">▸</span>
            )}
          </button>
        )}

        {(isOpen || !section.collapsible) && (
          <nav
            data-testid={`sidebar-${section.id}-nav`}
            className="space-y-1"
            onKeyDown={(event) => {
              moveFocusByKey(event, { selector: 'a[data-testid="sidebar-item"]', orientation: 'vertical' })
            }}
          >
            {section.items.map(item => (
              <SidebarNavItemRow
                key={item.id}
                item={item}
                sectionId={section.id}
                isCollapsed={isCollapsed}
                canDrag={canDrag}
                editingItemId={editingItemId}
                editingName={editingName}
                draggedItem={draggedItem}
                dragOverItem={dragOverItem}
                dragSection={dragSection}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDoubleClick={handleDoubleClick}
                onSaveRename={handleSaveRename}
                onCancelRename={handleCancelRename}
                onRenameChange={setEditingName}
                onRemove={removeItem}
              />
            ))}
          </nav>
        )}
      </div>
    )
  }

  // ---- Main render ----
  return (
    <>
      {/* Mobile backdrop — keep the navbar close control tappable while the
          drawer is open, and close immediately on touch/pointer interaction. */}
      {isMobile && config.isMobileOpen && (
        <div
          className="fixed inset-x-0 bottom-0 bg-black/60 backdrop-blur-xs z-overlay md:hidden"
          style={{ top: NAVBAR_HEIGHT_PX }}
          onClick={handleMobileBackdropClose}
          onPointerDown={handleMobileBackdropClose}
          tabIndex={-1}
          aria-hidden="true"
        />
      )}

      <aside
        ref={sidebarRef}
        data-testid="sidebar"
        data-tour="sidebar"
        role={isMobileSidebarOpen ? 'dialog' : undefined}
        aria-modal={isMobileSidebarOpen ? 'true' : undefined}
        aria-label={isMobileSidebarOpen ? t('sidebar.navigation', 'Navigation') : undefined}
        tabIndex={-1}
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
          <SidebarClusterStatus
            healthyClusters={healthyClusters}
            unhealthyClusters={unhealthyClusters}
            unreachableClusters={unreachableClusters}
            onStatusClick={handleClusterStatusClick}
          />
        )}

        {/* Viewer count + commit hash */}
        {features.activeUsers && !isCollapsed && (
          <SidebarActiveUsersFooter
            viewerCount={viewerCount}
            viewersError={!!viewersError}
            viewersLoading={viewersLoading}
            showVersionCheck={features.versionCheck ?? false}
            channel={channel}
            hasUpdate={hasUpdate}
            isUpgrading={isUpgrading}
            latestMainSHA={latestMainSHA}
          />
        )}

        {/* Custom footer */}
        {footer}
      </aside>

      {/* Collapse + Pin controls */}
      {features.collapsePin !== false && !isMobile && (
        <SidebarCollapseControls
          isCollapsed={isCollapsed}
          isPinned={isPinned}
          sidebarWidth={sidebarWidth}
          isMissionFullScreen={isMissionFullScreen}
          onToggleCollapse={() => {
            if (config.collapsed) {
              setCollapsed(false)
            } else {
              toggleCollapsed()
            }
          }}
          onTogglePin={toggleSidebarPin}
        />
      )}

      {/* Resize handle */}
      {features.resize !== false && !isCollapsed && !isMobile && (
        <div
          onMouseDown={handleResizeStart}
          onKeyDown={handleResizeKeyDown}
          tabIndex={0}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('layout.sidebar.resizeSidebar')}
          aria-valuemin={SIDEBAR_MIN_WIDTH_PX}
          aria-valuemax={SIDEBAR_MAX_WIDTH_PX}
          aria-valuenow={sidebarWidth}
          className={cn(
            'fixed bottom-0 hidden cursor-col-resize z-sidebar transition-colors md:block',
            'hover:bg-purple-500/30 focus-visible:bg-purple-500/30 focus-visible:outline-none',
            'focus-visible:ring-2 focus-visible:ring-purple-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            isResizing && 'bg-purple-500/50'
          )}
          style={{
            top: SIDEBAR_RESIZE_HANDLE_TOP_PX,
            left: sidebarWidth - SIDEBAR_RESIZE_HANDLE_OFFSET_PX,
            width: SIDEBAR_RESIZE_HANDLE_WIDTH_PX,
          }}
        />
      )}
    </>
  )
}
