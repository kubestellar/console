import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../config/routes'
import { NAVBAR_HEIGHT_PX } from '../../../lib/constants/ui'
import { cn } from '../../../lib/cn'
import {
  SIDEBAR_COLLAPSED_WIDTH_PX,
  SIDEBAR_DEFAULT_WIDTH_PX,
  useSidebarConfig,
} from '../../../hooks/useSidebarConfig'
import { useMobile } from '../../../hooks/useMobile'
import { useClusters } from '../../../hooks/mcp/clusters'
import { useDashboardContextOptional } from '../../../hooks/useDashboardContext'
import type { SnoozedMission } from '../../../hooks/useSnoozedMissions'
import type { SnoozedRecommendation } from '../../../hooks/useSnoozedRecommendations'
import type { SnoozedSwap } from '../../../hooks/useSnoozedCards'
import { useActiveUsers } from '../../../hooks/useActiveUsers'
import { useMissions } from '../../../hooks/useMissions'
import { emitDashboardRenamed } from '../../../lib/analytics'
import { useVersionCheck } from '../../../hooks/useVersionCheck'
import { useUpgradeState } from '../../../hooks/useUpgradeState'
import { useEscapeLayer, useModalFocusTrap } from '../../../lib/modals'
import {
  SIDEBAR_AUTO_HIDE_MS,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_RESIZE_STEP_PX,
} from './constants'
import { SidebarControls } from './SidebarControls'
import { SidebarNav } from './SidebarNav'
import { SidebarPanels } from './SidebarPanels'
import type { SidebarNavItem, SidebarShellProps } from './types'

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
  const dragCounter = useRef(0)
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  const isMobileSidebarOpen = isMobile && config.isMobileOpen
  const isTopEscapeLayer = useEscapeLayer(isMobileSidebarOpen)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [isPinned, setIsPinned] = useState(() => {
    try {
      return localStorage.getItem('sidebar-left-pinned') !== 'false'
    } catch {
      return true
    }
  })
  const [isResizing, setIsResizing] = useState(false)
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragOverItem, setDragOverItem] = useState<string | null>(null)
  const [dragSection, setDragSection] = useState<string | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (isMobile) {
      closeMobileSidebar()
    }
  }, [closeMobileSidebar, isMobile, location.pathname])

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
      autoHideTimerRef.current = setTimeout(() => setCollapsed(true), SIDEBAR_AUTO_HIDE_MS)
    }
  }

  const toggleSidebarPin = () => {
    setIsPinned(previous => {
      const next = !previous
      try {
        localStorage.setItem('sidebar-left-pinned', String(next))
      } catch {
        // ignore
      }
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
  useEffect(() => () => resizeCleanupRef.current?.(), [])

  const isCollapsed = !isMobile && config.collapsed
  const sidebarWidth = isCollapsed ? SIDEBAR_COLLAPSED_WIDTH_PX : (widthOverride ?? config.width ?? SIDEBAR_DEFAULT_WIDTH_PX)

  const clampSidebarWidth = useCallback((nextWidth: number) => {
    return Math.min(SIDEBAR_MAX_WIDTH_PX, Math.max(SIDEBAR_MIN_WIDTH_PX, nextWidth))
  }, [])

  const handleResizeStart = (event: MouseEvent) => {
    event.preventDefault()
    setIsResizing(true)
    const startX = event.clientX
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

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let delta = 0
    if (event.key === 'ArrowLeft') delta = -SIDEBAR_RESIZE_STEP_PX
    if (event.key === 'ArrowRight') delta = SIDEBAR_RESIZE_STEP_PX
    if (delta === 0) return
    event.preventDefault()
    setWidth(clampSidebarWidth(sidebarWidth + delta))
  }

  const handleApplySwap = (_swap: SnoozedSwap) => { navigate(ROUTES.HOME) }
  const handleApplyRecommendation = (_recommendation: SnoozedRecommendation) => { navigate(ROUTES.HOME) }
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

  return (
    <>
      {isMobile && config.isMobileOpen && (
        <div
          className="fixed inset-x-0 bottom-0 bg-black/60 backdrop-blur-xs z-overlay md:hidden"
          style={{ top: NAVBAR_HEIGHT_PX }}
          onClick={() => editingItemId === null && closeMobileSidebar()}
          onPointerDown={() => editingItemId === null && closeMobileSidebar()}
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
        <SidebarNav
          navSections={navSections}
          features={features}
          isCollapsed={isCollapsed}
          isMobile={isMobile}
          editingItemId={editingItemId}
          editingName={editingName}
          collapsedSections={collapsedSections}
          draggedItem={draggedItem}
          dragOverItem={dragOverItem}
          dragSection={dragSection}
          onEditingNameChange={setEditingName}
          onEditingCancel={() => { setEditingItemId(null); setEditingName('') }}
          onDoubleClick={handleDoubleClick}
          onSaveRename={handleSaveRename}
          onToggleSection={(sectionId) => setCollapsedSections(previous => ({ ...previous, [sectionId]: !previous[sectionId] }))}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onRemoveItem={removeItem}
          onAddMore={onAddMore}
          openDashboardCatalog={() => dashboardContext?.openAddCardModal('dashboards')}
        />

        <SidebarPanels
          branding={branding}
          features={features}
          isCollapsed={isCollapsed}
          children={children}
          footer={footer}
          deduplicatedClusters={deduplicatedClusters as Array<{ name?: string } & Record<string, unknown>>}
          viewerCount={viewerCount}
          viewersError={viewersError}
          viewersLoading={viewersLoading}
          hasUpdate={hasUpdate}
          channel={channel}
          latestMainSHA={latestMainSHA}
          isUpgrading={isUpgrading}
          onAddCard={onAddCard}
          onApplySwap={handleApplySwap}
          onApplyRecommendation={handleApplyRecommendation}
          onApplyMission={handleApplyMission}
          onClusterStatusClick={handleClusterStatusClick}
        />
      </aside>

      <SidebarControls
        features={features}
        isMobile={isMobile}
        isMissionFullScreen={isMissionFullScreen}
        isCollapsed={isCollapsed}
        isPinned={isPinned}
        isResizing={isResizing}
        sidebarWidth={sidebarWidth}
        configCollapsed={config.collapsed}
        onExpandOrToggle={() => {
          if (config.collapsed) {
            setCollapsed(false)
            if (!isPinned) {
              setIsPinned(true)
              try {
                localStorage.setItem('sidebar-left-pinned', 'true')
              } catch {
                // ignore
              }
              clearAutoHideTimer()
            }
          } else {
            toggleCollapsed()
          }
        }}
        onTogglePin={toggleSidebarPin}
        onResizeStart={handleResizeStart}
        onResizeKeyDown={handleResizeKeyDown}
      />
    </>
  )
}
