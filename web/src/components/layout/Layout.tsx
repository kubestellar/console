import { ReactNode } from 'react'
import { Box, X } from 'lucide-react'
import { Navbar } from './Navbar'
import { Sidebar } from './Sidebar'
import { MissionSidebar, MissionSidebarToggle } from './MissionSidebar'
import { useSidebarConfig } from '../../hooks/useSidebarConfig'
import { useNavigationHistory } from '../../hooks/useNavigationHistory'
import { useMissions } from '../../hooks/useMissions'
import { useDemoMode } from '../../hooks/useDemoMode'
import { cn } from '../../lib/cn'
import { TourOverlay, TourPrompt } from '../onboarding/Tour'
import { TourProvider } from '../../hooks/useTour'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const { config } = useSidebarConfig()
  const { isSidebarOpen: isMissionSidebarOpen, isSidebarMinimized: isMissionSidebarMinimized, isFullScreen: isMissionFullScreen } = useMissions()
  const { isDemoMode, toggleDemoMode } = useDemoMode()

  // Track navigation for behavior analysis
  useNavigationHistory()

  return (
    <TourProvider>
    <div className="min-h-screen bg-background">
      {/* Tour overlay and prompt */}
      <TourOverlay />
      <TourPrompt />

      {/* Star field background */}
      <div className="star-field">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="star"
            style={{
              width: Math.random() * 2 + 1 + 'px',
              height: Math.random() * 2 + 1 + 'px',
              left: Math.random() * 100 + '%',
              top: Math.random() * 100 + '%',
              animationDelay: Math.random() * 3 + 's',
            }}
          />
        ))}
      </div>

      <Navbar />

      {/* Demo Mode Banner */}
      {isDemoMode && (
        <div className="fixed top-16 left-0 right-0 z-40 bg-yellow-500/10 border-b border-yellow-500/20">
          <div className="flex items-center justify-center gap-3 py-1.5 px-4">
            <Box className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-yellow-400 font-medium">
              Demo Mode Active
            </span>
            <span className="text-xs text-yellow-400/70">
              Showing sample data from all cloud providers
            </span>
            <button
              onClick={toggleDemoMode}
              className="ml-2 p-1 hover:bg-yellow-500/20 rounded transition-colors"
              title="Exit demo mode"
            >
              <X className="w-3.5 h-3.5 text-yellow-400" />
            </button>
          </div>
        </div>
      )}

      <div className={cn("flex", isDemoMode ? "pt-[88px]" : "pt-16")}>
        <Sidebar />
        <main className={cn(
          'flex-1 p-6 transition-all duration-300',
          config.collapsed ? 'ml-20' : 'ml-64',
          // Don't apply margin when fullscreen is active - sidebar covers everything
          isMissionSidebarOpen && !isMissionSidebarMinimized && !isMissionFullScreen && 'mr-96',
          isMissionSidebarOpen && isMissionSidebarMinimized && !isMissionFullScreen && 'mr-12'
        )}>
          {children}
        </main>
      </div>

      {/* AI Mission sidebar */}
      <MissionSidebar />
      <MissionSidebarToggle />
    </div>
    </TourProvider>
  )
}
