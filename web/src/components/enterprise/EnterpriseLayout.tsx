/**
 * Enterprise Layout — Wraps enterprise routes with the dedicated sidebar.
 *
 * Replaces the main Layout when navigating to /enterprise/*.
 * Uses React Router's <Outlet> for nested route rendering.
 */
import { Outlet } from 'react-router-dom'
import EnterpriseSidebar from './EnterpriseSidebar'
import { VersionCheckProvider } from '../../hooks/useVersionCheck'

export default function EnterpriseLayout() {
  return (
    <VersionCheckProvider>
      <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
        <EnterpriseSidebar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 pb-24">
          <Outlet />
        </main>
      </div>
    </VersionCheckProvider>
  )
}
