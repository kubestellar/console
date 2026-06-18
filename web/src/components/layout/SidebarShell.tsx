/**
 * SidebarShell — reusable sidebar infrastructure component.
 */
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useSidebarConfig, SIDEBAR_COLLAPSED_WIDTH_PX, SIDEBAR_DEFAULT_WIDTH_PX } from '../../hooks/useSidebarConfig'
import { useMobile } from '../../hooks/useMobile'
import { useClusters } from '../../hooks/mcp/clusters'
import { useDashboardContextOptional } from '../../hooks/useDashboardContext'
import { useMissions } from '../../hooks/useMissions'
import { NAVBAR_HEIGHT_PX } from '../../lib/constants/ui'
import { useEscapeLayer } from '../../lib/modals'
import { ROUTES } from '../../config/routes'
import { cn } from '../../lib/cn'
import { SidebarControls } from './sidebar/SidebarControls'
import { SidebarFeatures } from './sidebar/SidebarFeatures'
import { SidebarNav } from './sidebar/SidebarNav'
import { useSidebarEffects } from './sidebar/useSidebarEffects'
import { useSidebarPinning } from './sidebar/useSidebarPinning'
import { useSidebarResize } from './sidebar/useSidebarResize'
import type { SidebarShellProps } from './sidebar/types'

export type {
  NavSection,
  SidebarNavItem,
  SidebarFeatures,
  SidebarBranding,
  SidebarShellProps,
} from './sidebar/types'

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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const sidebarRef = useRef<HTMLElement | null>(null)
  const isMobileSidebarOpen = isMobile && config.isMobileOpen
  const isTopEscapeLayer = useEscapeLayer(isMobileSidebarOpen)
  const isCollapsed = !isMobile && config.collapsed
  const sidebarWidth = isCollapsed
    ? SIDEBAR_COLLAPSED_WIDTH_PX
    : (widthOverride ?? config.width ?? SIDEBAR_DEFAULT_WIDTH_PX)

  const {
    isPinned,
    handleSidebarMouseEnter,
    handleSidebarMouseLeave,
    toggleSidebarPin,
  } = useSidebarPinning({
    isCollapsed,
    isMobile,
    onSetCollapsed: setCollapsed,
  })

  const {
    isResizing,
    handleResizeStart,
    handleResizeKeyDown: handleResizeKeyDownBase,
  } = useSidebarResize({
    getWidth: () => widthOverride ?? config.width ?? SIDEBAR_DEFAULT_WIDTH_PX,
    onSetWidth: setWidth,
  })

  useSidebarEffects({
    isMobile,
    isMobileSidebarOpen,
    sidebarRef,
    editingItemId: null,
    isTopEscapeLayer,
    onCloseMobileSidebar: closeMobileSidebar,
  })

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    handleResizeKeyDownBase(event, sidebarWidth)
  }

  const handleMobileBackdropClose = () => {
    closeMobileSidebar()
  }

  const handleApplySwap = () => {
    navigate(ROUTES.HOME)
  }

  const handleApplyRecommendation = () => {
    navigate(ROUTES.HOME)
  }

  const handleApplyMission = () => {
    navigate(ROUTES.HOME)
  }

  const handleAddMore = () => {
    if (onAddMore) {
      onAddMore()
      return
    }
    dashboardContext?.openAddCardModal('dashboards')
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

        <SidebarNav
          navSections={navSections}
          isCollapsed={isCollapsed}
          canDrag={features.dragReorder !== false && !isMobile}
          showAddMore={features.addMore}
          onAddMore={handleAddMore}
          primaryNav={config.primaryNav}
          secondaryNav={config.secondaryNav}
          removeItem={removeItem}
          reorderItems={reorderItems}
          updateItem={updateItem}
        />

        <SidebarFeatures
          isCollapsed={isCollapsed}
          showSnoozedCards={features.snoozedCards}
          showAddCard={features.addCard}
          showClusterStatus={features.clusterStatus}
          showActiveUsers={features.activeUsers}
          showVersionCheck={features.versionCheck}
          deduplicatedClusters={deduplicatedClusters}
          children={children}
          footer={footer}
          onAddCard={onAddCard}
          onApplySwap={handleApplySwap}
          onApplyRecommendation={handleApplyRecommendation}
          onApplyMission={handleApplyMission}
        />
      </aside>

      <SidebarControls
        isCollapsed={isCollapsed}
        isPinned={isPinned}
        sidebarWidth={sidebarWidth}
        isResizing={isResizing}
        isMobile={isMobile}
        isMissionFullScreen={isMissionFullScreen}
        showCollapsePin={features.collapsePin}
        showResize={features.resize}
        onToggleCollapsed={toggleCollapsed}
        onSetCollapsed={setCollapsed}
        onTogglePin={toggleSidebarPin}
        onResizeStart={handleResizeStart}
        onResizeKeyDown={handleResizeKeyDown}
      />
    </>
  )
}
