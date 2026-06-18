import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { emitDashboardRenamed } from '../../lib/analytics'
import { cn } from '../../lib/cn'
import { ROUTES } from '../../config/routes'
import {
  useSidebarConfig,
  SIDEBAR_COLLAPSED_WIDTH_PX,
  SIDEBAR_DEFAULT_WIDTH_PX,
} from '../../hooks/useSidebarConfig'
import { useMobile } from '../../hooks/useMobile'
import { useClusters } from '../../hooks/mcp/clusters'
import { isClusterHealthy, isClusterUnreachable } from '../clusters/utils'
import { useDashboardContextOptional } from '../../hooks/useDashboardContext'
import type { SnoozedMission } from '../../hooks/useSnoozedMissions'
import type { SnoozedRecommendation } from '../../hooks/useSnoozedRecommendations'
import type { SnoozedSwap } from '../../hooks/useSnoozedCards'
import { useActiveUsers } from '../../hooks/useActiveUsers'
import { useMissions } from '../../hooks/useMissions'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import { useUpgradeState } from '../../hooks/useUpgradeState'
import { NAVBAR_HEIGHT_PX } from '../../lib/constants/ui'
import { useEscapeLayer, useModalFocusTrap } from '../../lib/modals'
import {
  SIDEBAR_AUTO_HIDE_MS,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_RESIZE_STEP_PX,
} from './SidebarShell.constants'
import { SidebarShellControls } from './SidebarShellControls'
import { SidebarShellNav } from './SidebarShellNav'
import { SidebarShellPanels } from './SidebarShellPanels'
import type { NavSection, SidebarBranding, SidebarFeatures, SidebarNavItem, SidebarShellProps } from './SidebarShell.types'

export type {
  NavSection,
  SidebarBranding,
  SidebarFeatures,
  SidebarNavItem,
  SidebarShellProps,
} from './SidebarShell.types'

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

  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sidebarRef = useRef<HTMLElement | null>(null)
  const isMobileSidebarOpen = isMobile && config.isMobileOpen
  const isTopEscapeLayer = useEscapeLayer(isMobileSidebarOpen)

  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [isPinned, setIsPinned] = useState(() => {
    try { return localStorage.getItem('sidebar-left-pinned') !== 'false' } catch { return true }
  })
  const [isResizing, setIsResizing] = useState(false)
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragOverItem, setDragOverItem] = useState<string | null>(null)
  const [dragSection, setDragSection] = useState<string | null>(null)
  const dragCounter = useRef(0)

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
      if (event.key !== 'Escape' || !isTopEscapeLayer() || editingItemId !== null) return
      event.preventDefault()
      event.stopPropagation()
      closeMobileSidebar()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeMobileSidebar, editingItemId, isMobileSidebarOpen, isTopEscapeLayer])

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
    if (editingItemId !== null) return
    closeMobileSidebar()
  }

  useEffect(() => () => clearAutoHideTimer(), [clearAutoHideTimer])

  const isCollapsed = !isMobile && config.collapsed
  const sidebarWidth = isCollapsed
    ? SIDEBAR_COLLAPSED_WIDTH_PX
    : (widthOverride ?? config.width ?? SIDEBAR_DEFAULT_WIDTH_PX)

  const clampSidebarWidth = useCallback((nextWidth: number) => {
    return Math.min(SIDEBAR_MAX_WIDTH_PX, Math.max(SIDEBAR_MIN_WIDTH_PX, nextWidth))
  }, [])

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

  const unreachableClusters = deduplicatedClusters.filter((c) => isClusterUnreachable(c)).length
  const healthyClusters = deduplicatedClusters.filter((c) => !isClusterUnreachable(c) && isClusterHealthy(c)).length
  const unhealthyClusters = deduplicatedClusters.length - healthyClusters - unreachableClusters

  const handleApplySwap = (_swap: SnoozedSwap) => { navigate(ROUTES.HOME) }
  const handleApplyRecommendation = (_rec: SnoozedRecommendation) => { navigate(ROUTES.HOME) }
  const handleApplyMission = (_mission: SnoozedMission) => { navigate(ROUTES.HOME) }

  const handleClusterStatusClick = (status: 'healthy' | 'unhealthy' | 'unreachable') => {
    navigate(`${ROUTES.CLUSTERS}?status=${status}`)
  }

  const onRenameSaved = () => {
    emitDashboardRenamed()
  }

  return (
    <>
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

        <SidebarShellNav
          navSections={navSections}
          isCollapsed={isCollapsed}
          isMobile={isMobile}
          features={features}
          onAddMore={onAddMore}
          dashboardContext={dashboardContext}
          t={t}
          editingItemId={editingItemId}
          editingName={editingName}
          setEditingName={setEditingName}
          setEditingItemId={setEditingItemId}
          draggedItem={draggedItem}
          dragOverItem={dragOverItem}
          dragSection={dragSection}
          setDraggedItem={setDraggedItem}
          setDragOverItem={setDragOverItem}
          setDragSection={setDragSection}
          dragCounter={dragCounter}
          config={{ primaryNav: config.primaryNav, secondaryNav: config.secondaryNav }}
          reorderItems={reorderItems}
          updateItem={updateItem}
          removeItem={removeItem}
          onRenameSaved={onRenameSaved}
        />

        <SidebarShellPanels
          features={features}
          isCollapsed={isCollapsed}
          children={children}
          onAddCard={onAddCard}
          footer={footer}
          deduplicatedClustersCount={deduplicatedClusters.length}
          healthyClusters={healthyClusters}
          unhealthyClusters={unhealthyClusters}
          unreachableClusters={unreachableClusters}
          handleClusterStatusClick={handleClusterStatusClick}
          onApplySwap={handleApplySwap}
          onApplyRecommendation={handleApplyRecommendation}
          onApplyMission={handleApplyMission}
          t={t}
          viewerCount={viewerCount}
          viewersError={viewersError}
          viewersLoading={viewersLoading}
          hasUpdate={hasUpdate}
          channel={channel}
          latestMainSHA={latestMainSHA}
          isUpgrading={isUpgrading}
        />
      </aside>

      <SidebarShellControls
        enableCollapsePin={features.collapsePin !== false}
        enableResize={features.resize !== false}
        isMobile={isMobile}
        isMissionFullScreen={isMissionFullScreen}
        isCollapsed={isCollapsed}
        sidebarWidth={sidebarWidth}
        isPinned={isPinned}
        setIsPinned={setIsPinned}
        configCollapsed={config.collapsed}
        setCollapsed={setCollapsed}
        toggleCollapsed={toggleCollapsed}
        clearAutoHideTimer={clearAutoHideTimer}
        toggleSidebarPin={toggleSidebarPin}
        isResizing={isResizing}
        onResizeStart={handleResizeStart}
        onResizeKeyDown={handleResizeKeyDown}
        t={(key) => t(key)}
      />
    </>
  )
}
