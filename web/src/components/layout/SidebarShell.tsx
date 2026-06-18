import { useState, useRef, useEffect, useCallback, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'
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
import { NAVBAR_HEIGHT_PX, SIDEBAR_CONTROLS_LEFT_OFFSET_PX } from '../../lib/constants/ui'
import { useEscapeLayer, useModalFocusTrap } from '../../lib/modals'
import { SidebarNavSections } from './SidebarNavSections'
import { SidebarFooter } from './SidebarFooter'
import { SidebarControls } from './SidebarControls'
import {
  SIDEBAR_AUTO_HIDE_MS,
  SIDEBAR_LEFT_PINNED_KEY,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_RESIZE_STEP_PX,
} from './SidebarConstants'
import type { SidebarNavItem, SidebarShellProps } from './SidebarTypes'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import { useUpgradeState } from '../../hooks/useUpgradeState'

export type {
  NavSection,
  SidebarNavItem,
  SidebarFeatures,
  SidebarBranding,
  SidebarShellProps,
} from './SidebarTypes'

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
    try {
      return localStorage.getItem(SIDEBAR_LEFT_PINNED_KEY) !== 'false'
    } catch {
      return true
    }
  })
  const [isResizing, setIsResizing] = useState(false)
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragOverItem, setDragOverItem] = useState<string | null>(null)
  const [dragSection, setDragSection] = useState<string | null>(null)
  const dragCounter = useRef(0)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

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
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
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
      autoHideTimerRef.current = setTimeout(() => setCollapsed(true), SIDEBAR_AUTO_HIDE_MS)
    }
  }

  const toggleSidebarPin = () => {
    setIsPinned(prev => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_LEFT_PINNED_KEY, String(next))
      } catch {
        // ignore
      }
      if (next) {
        clearAutoHideTimer()
        if (config.collapsed) setCollapsed(false)
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

  const handleResizeStart = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsResizing(true)
    const startX = event.clientX
    const startWidth = widthOverride ?? config.width ?? SIDEBAR_DEFAULT_WIDTH_PX

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
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

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let delta = 0
    if (event.key === 'ArrowLeft') delta = -SIDEBAR_RESIZE_STEP_PX
    else if (event.key === 'ArrowRight') delta = SIDEBAR_RESIZE_STEP_PX
    if (delta === 0) return
    event.preventDefault()
    setWidth(clampSidebarWidth(sidebarWidth + delta))
  }

  const unreachableClusters = deduplicatedClusters.filter((c) => isClusterUnreachable(c)).length
  const healthyClusters = deduplicatedClusters.filter((c) => !isClusterUnreachable(c) && isClusterHealthy(c)).length
  const unhealthyClusters = deduplicatedClusters.length - healthyClusters - unreachableClusters

  const handleApplySwap = (_swap: SnoozedSwap) => { navigate(ROUTES.HOME) }
  const handleApplyRecommendation = (_rec: SnoozedRecommendation) => { navigate(ROUTES.HOME) }
  const handleApplyMission = (_mission: SnoozedMission) => { navigate(ROUTES.HOME) }

  const handleDoubleClick = (item: SidebarNavItem, event: MouseEvent) => {
    if (!item.isCustom || !item.href.startsWith('/custom-dashboard/')) return
    event.preventDefault()
    event.stopPropagation()
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

  const handleDragStart = (event: DragEvent, itemId: string, sectionId: string) => {
    setDraggedItem(itemId)
    setDragSection(sectionId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', itemId)
    requestAnimationFrame(() => {
      const target = event.target as HTMLElement
      target.style.opacity = '0.5'
    })
  }

  const handleDragEnd = (event: DragEvent) => {
    const target = event.target as HTMLElement
    target.style.opacity = '1'
    setDraggedItem(null)
    setDragOverItem(null)
    setDragSection(null)
    dragCounter.current = 0
  }

  const handleDragEnter = (event: DragEvent, itemId: string) => {
    event.preventDefault()
    dragCounter.current += 1
    if (itemId !== draggedItem) {
      setDragOverItem(itemId)
    }
  }

  const handleDragLeave = () => {
    dragCounter.current -= 1
    if (dragCounter.current === 0) {
      setDragOverItem(null)
    }
  }

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (event: DragEvent, targetId: string, sectionId: string) => {
    event.preventDefault()
    dragCounter.current = 0

    if (!draggedItem || draggedItem === targetId || sectionId !== dragSection) {
      setDraggedItem(null)
      setDragOverItem(null)
      setDragSection(null)
      return
    }

    const section = sectionId as 'primary' | 'secondary'
    const items = section === 'primary' ? [...config.primaryNav] : [...config.secondaryNav]
    const draggedIndex = items.findIndex(item => item.id === draggedItem)
    const targetIndex = items.findIndex(item => item.id === targetId)

    if (draggedIndex === -1 || targetIndex === -1) return

    const [removed] = items.splice(draggedIndex, 1)
    items.splice(targetIndex, 0, removed)
    reorderItems(items.map((item, index) => ({ ...item, order: index })), section)

    setDraggedItem(null)
    setDragOverItem(null)
    setDragSection(null)
  }

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => ({ ...prev, [id]: !prev[id] }))
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
          isMobile && config.isMobileOpen && 'translate-x-0',
        )}
        style={{ width: isMobile ? SIDEBAR_DEFAULT_WIDTH_PX : sidebarWidth }}
      >
        {branding && !isCollapsed && (
          <div className="mb-4">
            <div className="flex items-center gap-2">
              {branding.logo}
              {branding.title && <h1 className="text-base font-semibold text-foreground">{branding.title}</h1>}
            </div>
            {branding.subtitle && <p className="text-xs text-muted-foreground mt-1">{branding.subtitle}</p>}
          </div>
        )}

        <SidebarNavSections
          navSections={navSections}
          isCollapsed={isCollapsed}
          isMobile={isMobile}
          features={features}
          editingItemId={editingItemId}
          editingName={editingName}
          setEditingName={setEditingName}
          setEditingItemId={setEditingItemId}
          dragOverItem={dragOverItem}
          dragSection={dragSection}
          draggedItem={draggedItem}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          removeItem={removeItem}
          onAddMore={() => onAddMore?.() ?? dashboardContext?.openAddCardModal('dashboards')}
          t={t}
          collapsedSections={collapsedSections}
          toggleSection={toggleSection}
          onRenameSave={handleSaveRename}
          onDoubleClick={handleDoubleClick}
        />

        {features.snoozedCards && !isCollapsed && (
          <div data-tour="snoozed" className="min-w-0">
            <SnoozedCards
              onApplySwap={handleApplySwap}
              onApplyRecommendation={handleApplyRecommendation}
              onApplyMission={handleApplyMission}
            />
          </div>
        )}

        {children}

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

        <SidebarFooter
          features={features}
          isCollapsed={isCollapsed}
          deduplicatedClusters={deduplicatedClusters}
          healthyClusters={healthyClusters}
          unhealthyClusters={unhealthyClusters}
          unreachableClusters={unreachableClusters}
          onClusterStatusClick={handleClusterStatusClick}
          t={t}
          viewerCount={viewerCount}
          viewersError={viewersError}
          viewersLoading={viewersLoading}
          hasUpdate={hasUpdate}
          channel={channel}
          latestMainSHA={latestMainSHA}
          isUpgrading={isUpgrading}
        />

        {footer}
      </aside>

      <SidebarControls
        collapsePinEnabled={features.collapsePin !== false}
        resizeEnabled={features.resize !== false}
        isMobile={isMobile}
        isMissionFullScreen={isMissionFullScreen}
        sidebarWidth={sidebarWidth}
        isCollapsed={isCollapsed}
        isResizing={isResizing}
        isPinned={isPinned}
        configCollapsed={config.collapsed}
        setCollapsed={setCollapsed}
        toggleCollapsed={toggleCollapsed}
        setPinned={(next) => {
          setIsPinned(next)
          try {
            localStorage.setItem(SIDEBAR_LEFT_PINNED_KEY, String(next))
          } catch {
            // ignore
          }
        }}
        clearAutoHideTimer={clearAutoHideTimer}
        t={t}
        onTogglePin={toggleSidebarPin}
        onResizeStart={handleResizeStart}
        onResizeKeyDown={handleResizeKeyDown}
        controlsLeftOffsetPx={SIDEBAR_CONTROLS_LEFT_OFFSET_PX}
      />
    </>
  )
}
