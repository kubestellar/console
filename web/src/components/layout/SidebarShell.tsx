import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { ROUTES } from '../../config/routes'
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
import { useVersionCheck } from '../../hooks/useVersionCheck'
import { useUpgradeState } from '../../hooks/useUpgradeState'
import { NAVBAR_HEIGHT_PX } from '../../lib/constants/ui'
import { useEscapeLayer, useModalFocusTrap } from '../../lib/modals'
import { useSidebarPin } from './sidebar/useSidebarPin'
import { useSidebarResize } from './sidebar/useSidebarResize'
import { useSidebarDragDrop } from './sidebar/useSidebarDragDrop'
import { emitDashboardRenamed } from '../../lib/analytics'
import { SidebarNav } from './SidebarNav'
import { SidebarFooter } from './SidebarFooter'
import { CollapseToggle } from './CollapseToggle'
import { SidebarResizeHandle } from './SidebarResizeHandle'
import type { SidebarNavItem, SidebarShellProps } from './SidebarShell.types'
export type { NavSection, SidebarNavItem, SidebarFeatures, SidebarBranding, SidebarShellProps } from './SidebarShell.types'

const SIDEBAR_MIN_WIDTH_PX = 180
const SIDEBAR_MAX_WIDTH_PX = 480
const SIDEBAR_RESIZE_STEP_PX = 16
const SIDEBAR_RESIZE_HANDLE_TOP_PX = 160
const SIDEBAR_RESIZE_HANDLE_OFFSET_PX = 3
const SIDEBAR_RESIZE_HANDLE_WIDTH_PX = 6

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

  useEffect(() => {
    if (isMobile) closeMobileSidebar()
  }, [isMobile, closeMobileSidebar, location.pathname])

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

  const handleApplySwap = (_s: SnoozedSwap) => navigate(ROUTES.HOME)
  const handleApplyRecommendation = (_r: SnoozedRecommendation) => navigate(ROUTES.HOME)
  const handleApplyMission = (_m: SnoozedMission) => navigate(ROUTES.HOME)

  const handleMobileBackdropClose = () => {
    if (editingItemId !== null) return
    closeMobileSidebar()
  }

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
  const handleAddMore = () => onAddMore?.() ?? dashboardContext?.openAddCardModal('dashboards')
  const canDrag = features.dragReorder !== false && !isMobile

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

        <SidebarNav
          navSections={navSections}
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
          showAddMore={!!features.addMore}
          onAddMore={handleAddMore}
        />

        <SidebarFooter
          features={features}
          isCollapsed={isCollapsed}
          children={children}
          onAddCard={onAddCard}
          healthyClusters={healthyClusters}
          unhealthyClusters={unhealthyClusters}
          unreachableClusters={unreachableClusters}
          onStatusClick={handleClusterStatusClick}
          viewerCount={viewerCount}
          viewersError={!!viewersError}
          viewersLoading={viewersLoading}
          hasUpdate={hasUpdate}
          channel={channel}
          isUpgrading={isUpgrading}
          latestMainSHA={latestMainSHA}
          footer={footer}
          handleApplySwap={handleApplySwap}
          handleApplyRecommendation={handleApplyRecommendation}
          handleApplyMission={handleApplyMission}
        />
      </aside>

      <CollapseToggle
        showCollapsePin={features.collapsePin !== false}
        isMobile={isMobile}
        isCollapsed={isCollapsed}
        isPinned={isPinned}
        sidebarWidth={sidebarWidth}
        isMissionFullScreen={isMissionFullScreen}
        configCollapsed={config.collapsed}
        setCollapsed={setCollapsed}
        toggleCollapsed={toggleCollapsed}
        toggleSidebarPin={toggleSidebarPin}
      />

      <SidebarResizeHandle
        showResize={features.resize !== false && !isCollapsed && !isMobile}
        onMouseDown={handleResizeStart}
        onKeyDown={handleResizeKeyDown}
        ariaLabel={t('layout.sidebar.resizeSidebar')}
        ariaValueMin={SIDEBAR_MIN_WIDTH_PX}
        ariaValueMax={SIDEBAR_MAX_WIDTH_PX}
        ariaValueNow={sidebarWidth}
        isResizing={isResizing}
        top={SIDEBAR_RESIZE_HANDLE_TOP_PX}
        left={sidebarWidth - SIDEBAR_RESIZE_HANDLE_OFFSET_PX}
        width={SIDEBAR_RESIZE_HANDLE_WIDTH_PX}
      />
    </>
  )
}
