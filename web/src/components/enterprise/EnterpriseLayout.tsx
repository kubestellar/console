/**
 * Enterprise Layout — Wraps enterprise routes with the dedicated sidebar.
 *
 * Replaces the main Layout when navigating to /enterprise/*.
 * Mirrors the main Layout's structure: Navbar, fixed sidebar with margin
 * offset, mission sidebar, and proper responsive handling.
 *
 * The enterprise sidebar (SidebarShell) is position:fixed, so the main
 * content area needs an explicit left margin to clear it — mirroring the
 * approach used by the primary Layout component.
 */
import { lazy, Suspense, useCallback } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import EnterpriseSidebar from './EnterpriseSidebar'
import { VersionCheckProvider } from '../../hooks/useVersionCheck'
import { useSidebarConfig, SIDEBAR_COLLAPSED_WIDTH_PX, SIDEBAR_DEFAULT_WIDTH_PX } from '../../hooks/useSidebarConfig'
import { useMobile } from '../../hooks/useMobile'
import { useDashboardContextOptional } from '../../hooks/useDashboardContext'
import { Navbar } from '../layout/navbar/index'
import { NAVBAR_HEIGHT_PX, SIDEBAR_CONTROLS_OFFSET_PX } from '../../lib/constants/ui'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'

const MissionSidebar = lazy(() =>
  import('../layout/mission-sidebar').then((m) => ({ default: m.MissionSidebar })),
)
const MissionSidebarToggle = lazy(() =>
  import('../layout/mission-sidebar').then((m) => ({
    default: m.MissionSidebarToggle,
  })),
)

export default function EnterpriseLayout() {
  const { config } = useSidebarConfig()
  const { isMobile } = useMobile()
  const location = useLocation()
  const dashboardContext = useDashboardContextOptional()

  const sidebarWidthPx = isMobile
    ? 0
    : config.collapsed
      ? SIDEBAR_COLLAPSED_WIDTH_PX
      : (config.width ?? SIDEBAR_DEFAULT_WIDTH_PX)

  const handleOpenStudio = useCallback(() => {
    dashboardContext?.openAddCardModal()
  }, [dashboardContext])

  return (
    <VersionCheckProvider>
      {/* flex flex-col is required so the flex container below stretches
          to fill remaining height, giving <main> a constrained height
          for overflow-y-auto to work (scroll fix). */}
      <div className="h-screen bg-gray-950 text-white overflow-hidden flex flex-col">
        <Navbar />

        <div
          className="flex flex-1 overflow-hidden"
          style={{ paddingTop: NAVBAR_HEIGHT_PX }}
        >
          <EnterpriseSidebar />

          <main
            id="main-content"
            style={{
              marginLeft: isMobile ? 0 : sidebarWidthPx + SIDEBAR_CONTROLS_OFFSET_PX,
              marginRight: isMobile ? 0 : `calc(var(--mission-sidebar-width, 0px) + ${SIDEBAR_CONTROLS_OFFSET_PX}px)`,
            }}
            className="relative flex-1 p-4 pb-24 pb-[calc(6rem+env(safe-area-inset-bottom))] md:p-6 md:pb-28 md:pb-[calc(7rem+env(safe-area-inset-bottom))] transition-[margin] duration-300 overflow-y-auto overflow-x-hidden scroll-enhanced min-w-0"
          >
            <div key={location.pathname} className="contents">
              <Outlet />
            </div>
          </main>
        </div>

        {/* Console Studio floating action button */}
        <FloatingDashboardActions onOpenCustomizer={handleOpenStudio} />

        {/* AI Mission sidebar — same as main Layout */}
        <Suspense fallback={null}>
          <MissionSidebar />
          <MissionSidebarToggle />
        </Suspense>
      </div>
    </VersionCheckProvider>
  )
}
