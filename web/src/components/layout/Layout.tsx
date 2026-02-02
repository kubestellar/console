import { ReactNode, useState } from 'react'
import { Link } from 'react-router-dom'
import { Box, Wifi, WifiOff, X, Settings, Rocket } from 'lucide-react'
import { Navbar } from './navbar/index'
import { Sidebar } from './Sidebar'
import { MissionSidebar, MissionSidebarToggle } from './mission-sidebar'
import { useSidebarConfig } from '../../hooks/useSidebarConfig'
import { useMobile } from '../../hooks/useMobile'
import { useNavigationHistory } from '../../hooks/useNavigationHistory'
import { useLastRoute } from '../../hooks/useLastRoute'
import { useMissions } from '../../hooks/useMissions'
import { useDemoMode } from '../../hooks/useDemoMode'
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
  const { isMobile } = useMobile()
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
            // Mobile: full width
            isMobile ? "left-0" : (config.collapsed ? "left-20" : "left-64"),
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
            // Mobile: full width
            isMobile ? "left-0" : (config.collapsed ? "left-20" : "left-64"),
          )}>
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 py-1.5 px-3 md:px-4">
            <Box className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-yellow-400 font-medium">
              Demo Mode
            </span>
            <span className="hidden md:inline text-xs text-yellow-400/70">
              Showing sample data from all cloud providers
            </span>
            <button
              onClick={() => setShowSetupDialog(true)}
              className="hidden sm:flex ml-2 items-center gap-1.5 px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-full text-xs font-medium transition-colors"
            >
              <Rocket className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Want your own local KubeStellar Console?</span>
              <span className="lg:hidden">Get Console</span>
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
            // Mobile: full width
            isMobile ? "left-0" : (config.collapsed ? "left-20" : "left-64"),
          // Adjust right edge when mission sidebar is open (desktop only)
          !isMobile && isMissionSidebarOpen && !isMissionSidebarMinimized && !isMissionFullScreen ? "right-[500px]" : "right-0",
          !isMobile && isMissionSidebarOpen && isMissionSidebarMinimized && !isMissionFullScreen && "right-12"
        )}>
          <div className="flex flex-wrap items-center justify-between gap-2 py-1.5 px-3 md:px-4">
            <div className="flex items-center gap-2 min-w-0">
              <WifiOff className="w-4 h-4 text-orange-400 shrink-0" />
              <span className="text-sm text-orange-400 font-medium shrink-0">Offline</span>
              <span className="hidden lg:inline text-xs text-orange-400/70 truncate">
                — Install: <code className="bg-orange-500/20 px-1 rounded">brew install kubestellar/tap/kc-agent</code> → run <code className="bg-orange-500/20 px-1 rounded">kc-agent</code>
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to="/settings"
                className="flex items-center gap-1 text-xs px-2 py-0.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded transition-colors whitespace-nowrap"
              >
                <Settings className="w-3 h-3" />
                <span className="hidden sm:inline">Settings</span>
              </Link>
              <button
                onClick={toggleDemoMode}
                className="text-xs px-2 py-0.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded transition-colors whitespace-nowrap"
              >
                <span className="hidden sm:inline">Switch to </span>Demo
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
          'flex-1 px-4 pt-5 pb-4 md:px-6 md:pt-6 md:pb-6 transition-[margin] duration-300 overflow-y-auto',
          // Mobile: no left margin (sidebar overlays)
          // Desktop: respect collapsed state
          isMobile ? 'ml-0' : (config.collapsed ? 'ml-20' : 'ml-64'),
          // Don't apply right margin when fullscreen is active or on mobile
          !isMobile && isMissionSidebarOpen && !isMissionSidebarMinimized && !isMissionFullScreen && 'mr-[500px]',
          !isMobile && isMissionSidebarOpen && isMissionSidebarMinimized && !isMissionFullScreen && 'mr-12'
        )}>
          {children}
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
