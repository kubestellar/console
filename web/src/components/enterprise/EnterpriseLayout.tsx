/**
 * Enterprise Layout — Wraps enterprise routes with the dedicated sidebar.
 *
 * Replaces the main Layout when navigating to /enterprise/*.
 * Uses React Router's <Outlet> for nested route rendering.
 * Includes the shared Navbar for consistent top navigation (search, user
 * profile, theme toggle, AI missions, etc.).
 */
import { Outlet } from 'react-router-dom'
import EnterpriseSidebar from './EnterpriseSidebar'
import { VersionCheckProvider } from '../../hooks/useVersionCheck'
import { Navbar } from '../layout/navbar/index'
import { NAVBAR_HEIGHT_PX } from '../../lib/constants/ui'

export default function EnterpriseLayout() {
  return (
    <VersionCheckProvider>
      <div className="h-screen bg-gray-950 text-white overflow-hidden">
        <Navbar />
        <div className="flex" style={{ height: `calc(100vh - ${NAVBAR_HEIGHT_PX}px)`, marginTop: NAVBAR_HEIGHT_PX }}>
          <EnterpriseSidebar />
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 pb-24">
            <Outlet />
          </main>
        </div>
      </div>
    </VersionCheckProvider>
  )
}
