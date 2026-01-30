import { ReactNode, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { Box, Wifi, WifiOff, X, Settings, Rocket } from 'lucide-react'
import { Navbar } from './navbar/index'
import { Sidebar } from './Sidebar'
import { MissionSidebar, MissionSidebarToggle } from './mission-sidebar'
import { useSidebarConfig } from '../../hooks/useSidebarConfig'
import { useNavigationHistory } from '../../hooks/useNavigationHistory'
import { useLastRoute } from '../../hooks/useLastRoute'
import { useMissions } from '../../hooks/useMissions'
import { useDemoMode, isDemoModeForced } from '../../hooks/useDemoMode'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { cn } from '../../lib/cn'
import { TourOverlay, TourPrompt } from '../onboarding/Tour'
import { TourProvider } from '../../hooks/useTour'
import { SetupInstructionsDialog } from '../setup/SetupInstructionsDialog'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const { config } = useSidebarConfig()
  const { isSidebarOpen: isMissionSidebarOpen, isSidebarMinimized: isMissionSidebarMinimized, isFullScreen: isMissionFullScreen } = useMissions()
  const { isDemoMode, toggleDemoMode } = useDemoMode()
  const { status: agentStatus } = useLocalAgent()
  const { isOnline, wasOffline } = useNetworkStatus()
  const [offlineBannerDismissed, setOfflineBannerDismissed] = useState(false)
  const [showSetupDialog, setShowSetupDialog] = useState(false)

  // Show network banner when browser detects no network, or briefly after reconnecting
  const showNetworkBanner = !isOnline || wasOffline
  // Show offline banner when agent is disconnected (not demo mode, not connecting)
  const showOfflineBanner = !isDemoMode && agentStatus === 'disconnected' && !offlineBannerDismissed

  // Banner stacking: each banner's top offset depends on how many banners above it are visible.
  // Navbar is 64px (top-16). Each banner is ~36px tall.
  // Z-index hierarchy: Navbar + dropdowns (z-50) > Network banner (z-40) > Demo banner (z-30) > Offline banner (z-20)
  const NAVBAR_HEIGHT = 64
  const BANNER_HEIGHT = 36
  // Stack order: Network (top) → Demo → Agent Offline (bottom)
  const networkBannerTop = NAVBAR_HEIGHT
  const demoBannerTop = NAVBAR_HEIGHT + (showNetworkBanner ? BANNER_HEIGHT : 0)
  const offlineBannerTop = NAVBAR_HEIGHT + (showNetworkBanner ? BANNER_HEIGHT : 0) + (isDemoMode ? BANNER_HEIGHT : 0)
  const activeBannerCount = (showNetworkBanner ? 1 : 0) + (isDemoMode ? 1 : 0) + (showOfflineBanner ? 1 : 0)
  const totalBannerHeight = activeBannerCount * BANNER_HEIGHT

  // Track navigation for behavior analysis
  useNavigationHistory()

  // Persist and restore last route and scroll position
  useLastRoute()

  return (
    <TourProvider>
    <div className="h-screen bg-background overflow-hidden flex flex-col">
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

      {/* Network Disconnected Banner */}
      {showNetworkBanner && (
        <div
          style={{ top: networkBannerTop }}
          className={cn(
            "fixed right-0 z-40 border-b transition-[left] duration-300",
            config.collapsed ? "left-20" : "left-64",
            isOnline
              ? "bg-green-500/10 border-green-500/20"
              : "bg-red-500/10 border-red-500/20",
          )}>
          <div className="flex items-center justify-center gap-3 py-1.5 px-4">
            {isOnline ? (
              <>
                <Wifi className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-400 font-medium">
                  Network Reconnected
                </span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-red-400" />
                <span className="text-sm text-red-400 font-medium">
                  Network Disconnected
                </span>
                <span className="text-xs text-red-400/70">
                  Check your internet connection
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Demo Mode Banner */}
      {isDemoMode && (
        <div
          style={{ top: demoBannerTop }}
          className={cn(
            "fixed right-0 z-30 bg-yellow-500/10 border-b border-yellow-500/20 transition-[left] duration-300",
            config.collapsed ? "left-20" : "left-64",
          )}>
          <div className="flex items-center justify-center gap-3 py-1.5 px-4">
            <Box className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-yellow-400 font-medium">
              Demo Mode Active
            </span>
            <span className="text-xs text-yellow-400/70">
              Showing sample data from all cloud providers
            </span>
            <button
              onClick={() => setShowSetupDialog(true)}
              className="ml-2 flex items-center gap-1.5 px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-full text-xs font-medium transition-colors"
            >
              <Rocket className="w-3.5 h-3.5" />
              Want your own local KubeStellar Console?
            </button>
            <button
              onClick={() => isDemoModeForced ? setShowSetupDialog(true) : toggleDemoMode()}
              className="ml-2 p-1 hover:bg-yellow-500/20 rounded transition-colors"
              title={isDemoModeForced ? "Install your own console" : "Exit demo mode"}
            >
              <X className="w-3.5 h-3.5 text-yellow-400" />
            </button>
          </div>
        </div>
      )}

      {/* Offline Mode Banner - positioned in main content area only */}
      {showOfflineBanner && (
        <div
          style={{ top: offlineBannerTop }}
          className={cn(
            "fixed z-20 bg-orange-500/10 border-b border-orange-500/20 transition-[right] duration-300",
            config.collapsed ? "left-20" : "left-64",
          // Adjust right edge when mission sidebar is open
          isMissionSidebarOpen && !isMissionSidebarMinimized && !isMissionFullScreen ? "right-[500px]" : "right-0",
          isMissionSidebarOpen && isMissionSidebarMinimized && !isMissionFullScreen && "right-12"
        )}>
          <div className="flex items-center justify-between py-1.5 px-4">
            <div className="flex items-center gap-2 min-w-0">
              <WifiOff className="w-4 h-4 text-orange-400 shrink-0" />
              <span className="text-sm text-orange-400 font-medium shrink-0">Offline</span>
              <span className="text-xs text-orange-400/70 truncate">
                — Install: <code className="bg-orange-500/20 px-1 rounded">brew install kubestellar/tap/kc-agent</code> → run <code className="bg-orange-500/20 px-1 rounded">kc-agent</code> → configure your AI agent API keys in Settings
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <Link
                to="/settings"
                className="flex items-center gap-1 text-xs px-2 py-0.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded transition-colors whitespace-nowrap"
              >
                <Settings className="w-3 h-3" />
                Settings
              </Link>
              <button
                onClick={toggleDemoMode}
                className="text-xs px-2 py-0.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded transition-colors whitespace-nowrap"
              >
                Switch to Demo Mode
              </button>
              <button
                onClick={() => setOfflineBannerDismissed(true)}
                className="p-1 hover:bg-orange-500/20 rounded transition-colors"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5 text-orange-400" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden" style={{ paddingTop: NAVBAR_HEIGHT + totalBannerHeight }}>
        <Sidebar />
        <main className={cn(
          'flex-1 p-6 transition-[margin] duration-300 overflow-y-auto',
          config.collapsed ? 'ml-20' : 'ml-64',
          // Don't apply margin when fullscreen is active - sidebar covers everything
          isMissionSidebarOpen && !isMissionSidebarMinimized && !isMissionFullScreen && 'mr-[500px]',
          isMissionSidebarOpen && isMissionSidebarMinimized && !isMissionFullScreen && 'mr-12'
        )}>
          <Suspense fallback={
            <div className="pt-16 animate-in fade-in duration-300">
              {/* Header skeleton */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="h-8 w-48 bg-secondary rounded animate-pulse mb-2" />
                  <div className="h-4 w-64 bg-secondary/50 rounded animate-pulse" />
                </div>
              </div>
              {/* Card grid skeleton */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="glass rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="h-5 w-32 bg-secondary rounded animate-pulse" />
                      <div className="h-5 w-8 bg-secondary rounded animate-pulse" />
                    </div>
                    <div className="space-y-3">
                      <div className="h-4 w-full bg-secondary/50 rounded animate-pulse" />
                      <div className="h-4 w-3/4 bg-secondary/50 rounded animate-pulse" />
                      <div className="h-20 w-full bg-secondary/30 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          }>
            {children}
          </Suspense>
        </main>
      </div>

      {/* AI Mission sidebar */}
      <MissionSidebar />
      <MissionSidebarToggle />

      {/* Setup Instructions Dialog — also shown when user tries to exit forced demo mode */}
      <SetupInstructionsDialog
        isOpen={showSetupDialog}
        onClose={() => setShowSetupDialog(false)}
      />
    </div>
    </TourProvider>
  )
}
