import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { NAVBAR_HEIGHT_PX } from '../../lib/constants/ui'
import { SIDEBAR_DEFAULT_WIDTH_PX } from '../../hooks/useSidebarConfig'
import { SidebarCollapseControls } from './SidebarCollapseLogic'
import { SidebarFooter } from './SidebarFooter'
import { SidebarNav } from './SidebarNav'
import type { SidebarShellProps } from './SidebarShell.types'
import { useSidebarShellState } from './useSidebarShellState'

export type {
  NavSection,
  SidebarNavItem,
  SidebarFeatures,
  SidebarBranding,
  SidebarShellProps,
} from './SidebarShell.types'

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
  const { t } = useTranslation()
  const state = useSidebarShellState(widthOverride)

  return (
    <>
      {state.isMobile && state.config.isMobileOpen && (
        <div
          className="fixed inset-x-0 bottom-0 bg-black/60 backdrop-blur-xs z-overlay md:hidden"
          style={{ top: NAVBAR_HEIGHT_PX }}
          onClick={state.handleMobileBackdropClose}
          onPointerDown={state.handleMobileBackdropClose}
          tabIndex={-1}
          aria-hidden="true"
        />
      )}

      <aside
        ref={state.sidebarRef}
        data-testid="sidebar"
        data-tour="sidebar"
        role={state.isMobileSidebarOpen ? 'dialog' : undefined}
        aria-modal={state.isMobileSidebarOpen ? 'true' : undefined}
        aria-label={state.isMobileSidebarOpen ? t('sidebar.navigation', 'Navigation') : undefined}
        tabIndex={-1}
        onMouseEnter={state.handleSidebarMouseEnter}
        onMouseLeave={state.handleSidebarMouseLeave}
        className={cn(
          'fixed left-0 top-16 bottom-0 glass border-r border-border/50 overflow-y-auto scroll-enhanced',
          state.isMobile ? 'z-modal touch-manipulation' : 'z-sidebar',
          !state.isResizing && 'transition-[width,transform,padding] duration-300',
          !state.isMobile && (state.config.collapsed ? 'p-3' : 'p-4'),
          state.isMobile && 'p-4',
          state.isMobile && !state.config.isMobileOpen && '-translate-x-full hidden md:flex',
          state.isMobile && state.config.isMobileOpen && 'translate-x-0',
        )}
        style={{ width: state.isMobile ? SIDEBAR_DEFAULT_WIDTH_PX : state.sidebarWidth }}
      >
        {branding && !state.isCollapsed && (
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
          features={features}
          isCollapsed={state.isCollapsed}
          isMobile={state.isMobile}
          onAddMore={onAddMore}
          onAddCard={onAddCard}
          editingItemId={state.editingItemId}
          setEditingItemId={state.setEditingItemId}
          editingName={state.editingName}
          setEditingName={state.setEditingName}
          primaryNav={state.config.primaryNav}
          secondaryNav={state.config.secondaryNav}
          reorderItems={state.reorderItems}
          updateItem={state.updateItem}
          removeItem={state.removeItem}
        >
          {children}
        </SidebarNav>

        <SidebarFooter
          showClusterStatus={features.clusterStatus === true}
          isCollapsed={state.isCollapsed}
          clusterCount={state.clusterCount}
          healthyClusters={state.healthyClusters}
          unhealthyClusters={state.unhealthyClusters}
          unreachableClusters={state.unreachableClusters}
          onClusterStatusClick={state.handleClusterStatusClick}
          showActiveUsers={features.activeUsers === true}
          viewerCount={state.viewerCount}
          viewersError={state.viewersError}
          viewersLoading={state.viewersLoading}
          showVersionCheck={features.versionCheck === true}
          channel={state.channel}
          hasUpdate={state.hasUpdate}
          isUpgrading={state.isUpgrading}
          latestMainSHA={state.latestMainSHA}
          footer={footer}
        />
      </aside>

      {features.collapsePin !== false && !state.isMobile && !state.isMissionFullScreen && (
        <SidebarCollapseControls
          collapsed={state.config.collapsed}
          sidebarWidth={state.sidebarWidth}
          isPinned={state.isPinned}
          onToggleCollapsed={state.handleCollapseToggle}
          onTogglePin={state.toggleSidebarPin}
          expandLabel={t('layout.sidebar.expandSidebar')}
          collapseLabel={t('layout.sidebar.collapseSidebar')}
          pinLabel={t('layout.sidebar.pinSidebar')}
          unpinLabel={t('layout.sidebar.unpinSidebar')}
        />
      )}

      {features.resize !== false && !state.isCollapsed && !state.isMobile && (
        <div
          onMouseDown={state.handleResizeStart}
          onKeyDown={state.handleResizeKeyDown}
          tabIndex={0}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('layout.sidebar.resizeSidebar')}
          aria-valuemin={state.sidebarMinWidth}
          aria-valuemax={state.sidebarMaxWidth}
          aria-valuenow={state.sidebarWidth}
          className={cn(
            'fixed bottom-0 hidden cursor-col-resize z-sidebar transition-colors md:block',
            'hover:bg-purple-500/30 focus-visible:bg-purple-500/30 focus-visible:outline-none',
            'focus-visible:ring-2 focus-visible:ring-purple-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            state.isResizing && 'bg-purple-500/50',
          )}
          style={{
            top: SIDEBAR_RESIZE_HANDLE_TOP_PX,
            left: state.sidebarWidth - SIDEBAR_RESIZE_HANDLE_OFFSET_PX,
            width: SIDEBAR_RESIZE_HANDLE_WIDTH_PX,
          }}
        />
      )}
    </>
  )
}
