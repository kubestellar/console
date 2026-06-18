/**
 * SidebarShell — Reusable sidebar infrastructure component.
 *
 * Provides the common sidebar chrome (collapse/expand, pin, resize, mobile,
 * glass effect) while accepting navigation items and optional feature panels
 * via props. Used by:
 *   - Main console sidebar (Sidebar.tsx)
 *   - Enterprise compliance sidebar (EnterpriseSidebar.tsx)
 *   - Future white-label / partner portals
 *
 * Navigation rendering is handled by SidebarNavGroups.
 * Footer rendering is handled by SidebarFooter.
 * Section collapse state lives in useSidebarSectionCollapse (used inside SidebarNavGroups).
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Pin, PinOff, Plus } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SnoozedCards } from './SnoozedCards'
import {
  useSidebarConfig,
  SIDEBAR_COLLAPSED_WIDTH_PX,
  SIDEBAR_DEFAULT_WIDTH_PX,
} from '../../hooks/useSidebarConfig'
import { useMobile } from '../../hooks/useMobile'
import type { SnoozedSwap } from '../../hooks/useSnoozedCards'
import type { SnoozedRecommendation } from '../../hooks/useSnoozedRecommendations'
import type { SnoozedMission } from '../../hooks/useSnoozedMissions'
import { useMissions } from '../../hooks/useMissions'
import { NAVBAR_HEIGHT_PX, SIDEBAR_CONTROLS_LEFT_OFFSET_PX } from '../../lib/constants/ui'
import { useEscapeLayer, useModalFocusTrap } from '../../lib/modals'
import { ROUTES } from '../../config/routes'
import { SidebarNavGroups } from './SidebarNavGroups'
import { SidebarFooter } from './SidebarFooter'

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
// Internal helpers
// ---------------------------------------------------------------------------

const SIDEBAR_MIN_WIDTH_PX = 180
const SIDEBAR_MAX_WIDTH_PX = 480
const SIDEBAR_RESIZE_STEP_PX = 16
const SIDEBAR_RESIZE_HANDLE_TOP_PX = 160
const SIDEBAR_RESIZE_HANDLE_OFFSET_PX = 3
const SIDEBAR_RESIZE_HANDLE_WIDTH_PX = 6

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
  const { config, toggleCollapsed, setCollapsed, closeMobileSidebar, setWidth } = useSidebarConfig()
  const { isMobile } = useMobile()
  const { isFullScreen: isMissionFullScreen } = useMissions()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sidebarRef = useRef<HTMLElement | null>(null)
  const isMobileSidebarOpen = isMobile && config.isMobileOpen
  const isTopEscapeLayer = useEscapeLayer(isMobileSidebarOpen)
  /** True while the user is inline-renaming a custom dashboard nav item. */
  const [isNavEditing, setIsNavEditing] = useState(false)

  // Close mobile sidebar on route change
  useEffect(() => {
    if (isMobile) {
      closeMobileSidebar()
    }
  }, [location.pathname, isMobile, closeMobileSidebar])

  useEffect(() => {
    if (isMobileSidebarOpen && sidebarRef.current) {
      sidebarRef.current.scrollTop = 0
    }
  }, [isMobileSidebarOpen])

  useModalFocusTrap(sidebarRef, isMobileSidebarOpen)

  useEffect(() => {
    if (!isMobileSidebarOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isTopEscapeLayer() || isNavEditing) return
      event.preventDefault()
      event.stopPropagation()
      closeMobileSidebar()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeMobileSidebar, isNavEditing, isMobileSidebarOpen, isTopEscapeLayer])

  // ---- Auto-hide: collapse sidebar when mouse leaves, expand on hover ----
  const [isPinned, setIsPinned] = useState(() => {
    try { return localStorage.getItem('sidebar-left-pinned') !== 'false' } catch { return true }
  })

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

  const handleMobileBackdropClose = () => {
    if (isNavEditing) return
    closeMobileSidebar()
  }

  useEffect(() => () => clearAutoHideTimer(), [clearAutoHideTimer])

  const isCollapsed = !isMobile && config.collapsed
  const sidebarWidth = isCollapsed
    ? SIDEBAR_COLLAPSED_WIDTH_PX
    : (widthOverride ?? config.width ?? SIDEBAR_DEFAULT_WIDTH_PX)

  // ---- Resize handle ----
  const [isResizing, setIsResizing] = useState(false)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  const clampSidebarWidth = useCallback((nextWidth: number) => {
    return Math.min(SIDEBAR_MAX_WIDTH_PX, Math.max(SIDEBAR_MIN_WIDTH_PX, nextWidth))
  }, [])

  // Clean up resize listeners on unmount to prevent leaks if mouseup never fires
  useEffect(() => () => { resizeCleanupRef.current?.() }, [])

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    const startX = e.clientX
    const startWidth = widthOverride ?? config.width ?? SIDEBAR_DEFAULT_WIDTH_PX

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = clampSidebarWidth(startWidth + (moveEvent.clientX - startX))
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

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let delta = 0

    if (event.key === 'ArrowLeft') {
      delta = -SIDEBAR_RESIZE_STEP_PX
    } else if (event.key === 'ArrowRight') {
      delta = SIDEBAR_RESIZE_STEP_PX
    }

    if (delta === 0) {
      return
    }

    event.preventDefault()
    setWidth(clampSidebarWidth(sidebarWidth + delta))
  }

  // ---- Snoozed / swap handlers ----
  const handleApplySwap = (_swap: SnoozedSwap) => { navigate(ROUTES.HOME) }
  const handleApplyRecommendation = (_rec: SnoozedRecommendation) => { navigate(ROUTES.HOME) }
  const handleApplyMission = (_mission: SnoozedMission) => { navigate(ROUTES.HOME) }

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

        {/* Navigation sections */}
        <SidebarNavGroups
          navSections={navSections}
          features={features}
          isCollapsed={isCollapsed}
          onAddMore={onAddMore}
          onEditingChange={setIsNavEditing}
        />

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

        {/* Cluster status, active users, and custom footer */}
        <SidebarFooter
          features={features}
          isCollapsed={isCollapsed}
          footer={footer}
        />
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
