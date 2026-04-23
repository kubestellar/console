/**
 * Enterprise Layout — Wraps enterprise routes with the dedicated sidebar.
 *
 * Replaces the main Layout when navigating to /enterprise/*.
 * Uses React Router's <Outlet> for nested route rendering.
 * Includes the shared Navbar for consistent top navigation (search, user
 * profile, theme toggle, AI missions, etc.).
 *
 * The enterprise sidebar (SidebarShell) is position:fixed, so the main
 * content area needs an explicit left margin to clear it — mirroring the
 * approach used by the primary Layout component.
 */
import { Outlet } from 'react-router-dom'
import EnterpriseSidebar from './EnterpriseSidebar'
import { VersionCheckProvider } from '../../hooks/useVersionCheck'
import { useSidebarConfig, SIDEBAR_COLLAPSED_WIDTH_PX, SIDEBAR_DEFAULT_WIDTH_PX } from '../../hooks/useSidebarConfig'
import { useMobile } from '../../hooks/useMobile'
import { Navbar } from '../layout/navbar/index'
import { NAVBAR_HEIGHT_PX, SIDEBAR_CONTROLS_OFFSET_PX } from '../../lib/constants/ui'

export default function EnterpriseLayout() {
  const { config } = useSidebarConfig()
  const { isMobile } = useMobile()

  /** Effective sidebar width mirrors the calculation in Layout.tsx */
  const sidebarWidthPx = isMobile
    ? 0
    : config.collapsed
      ? SIDEBAR_COLLAPSED_WIDTH_PX
      : (config.width ?? SIDEBAR_DEFAULT_WIDTH_PX)

  return (
    <VersionCheckProvider>
      <div className="h-screen bg-gray-950 text-white overflow-hidden">
        <Navbar />
        <div className="flex" style={{ height: `calc(100vh - ${NAVBAR_HEIGHT_PX}px)`, marginTop: NAVBAR_HEIGHT_PX }}>
          <EnterpriseSidebar />
          <main
            className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 pb-24 transition-[margin] duration-300 min-w-0"
            style={{ marginLeft: isMobile ? 0 : sidebarWidthPx + SIDEBAR_CONTROLS_OFFSET_PX }}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </VersionCheckProvider>
  )
}
