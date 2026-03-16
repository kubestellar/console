import { ReactNode, Suspense, lazy, useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { Box, Wifi, WifiOff, X, Settings, Rocket, RotateCcw, Check, Loader2, RefreshCw, Plug } from 'lucide-react'
import { Button } from '../ui/Button'
import { Navbar } from './navbar/index'
import { Sidebar } from './Sidebar'
import { useSidebarConfig, SIDEBAR_COLLAPSED_WIDTH_PX, SIDEBAR_DEFAULT_WIDTH_PX } from '../../hooks/useSidebarConfig'
import { useMobile } from '../../hooks/useMobile'
import { useNavigationHistory } from '../../hooks/useNavigationHistory'
import { useLastRoute } from '../../hooks/useLastRoute'
import { useMissions } from '../../hooks/useMissions'
import { useDemoMode, isDemoModeForced, hasRealToken } from '../../hooks/useDemoMode'
import { setDemoMode } from '../../lib/demoMode'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { useClusters } from '../../hooks/mcp/clusters'
import { emitClusterInventory } from '../../lib/analytics'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { useBackendHealth } from '../../hooks/useBackendHealth'
import { useDeepLink } from '../../hooks/useDeepLink'
import { cn } from '../../lib/cn'
import { LOCAL_AGENT_HTTP_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { CLOSE_ANIMATION_MS, UI_FEEDBACK_TIMEOUT_MS, TOAST_DISMISS_MS } from '../../lib/constants/network'
import { TourOverlay, TourPrompt } from '../onboarding/Tour'
import { TourProvider } from '../../hooks/useTour'
import { SetupInstructionsDialog } from '../setup/SetupInstructionsDialog'
import { InClusterAgentDialog } from '../setup/InClusterAgentDialog'
import { KeepAliveOutlet } from './KeepAliveOutlet'
import { UpdateProgressBanner } from '../updates/UpdateProgressBanner'
import { useUpdateProgress } from '../../hooks/useUpdateProgress'
import { VersionCheckProvider } from '../../hooks/useVersionCheck'
import { copyToClipboard } from '../../lib/clipboard'

// Lazy-load the AI mission sidebar so react-markdown and remark plugins are
// not part of the initial bundle — they only load when the sidebar is first rendered.
const MissionSidebar = lazy(() =>
  import('./mission-sidebar').then(m => ({ default: m.MissionSidebar }))
)
const MissionSidebarToggle = lazy(() =>
  import('./mission-sidebar').then(m => ({ default: m.MissionSidebarToggle }))
)


// Module-level constant — computed once, never changes on re-render.
// Prevents star field from flickering when Layout re-renders due to hooks.
const STAR_POSITIONS = Array.from({ length: 30 }, () => ({
  width: Math.random() * 2 + 1 + 'px',
  height: Math.random() * 2 + 1 + 'px',
  left: Math.random() * 100 + '%',
  top: Math.random() * 100 + '%',
  animationDelay: Math.random() * 3 + 's',
}))

// Thin progress bar shown during route transitions so the user
// gets immediate visual feedback that navigation is happening.
function NavigationProgress() {
  const location = useLocation()
  const [isNavigating, setIsNavigating] = useState(false)
  const prevPath = useRef(location.pathname)

  useEffect(() => {
    if (location.pathname !== prevPath.current) {
      setIsNavigating(true)
      prevPath.current = location.pathname
      const timer = setTimeout(() => setIsNavigating(false), CLOSE_ANIMATION_MS)
      return () => clearTimeout(timer)
    }
  }, [location.pathname])

  if (!isNavigating) return null
  return <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-50" />
}

// Lightweight fallback shown while a lazy route chunk loads.
export function ContentLoadingSkeleton() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 border-2 border-muted border-t-foreground rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    </div>
  )
}

interface LayoutProps {
  children?: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const { t } = useTranslation()
  const { config } = useSidebarConfig()
  const { isMobile } = useMobile()
  const sidebarWidthPx = isMobile ? 0 : (config.collapsed ? SIDEBAR_COLLAPSED_WIDTH_PX : (config.width ?? SIDEBAR_DEFAULT_WIDTH_PX))
  const { isSidebarOpen: isMissionSidebarOpen, isSidebarMinimized: isMissionSidebarMinimized, isFullScreen: isMissionFullScreen } = useMissions()
  const { isDemoMode, toggleDemoMode } = useDemoMode()
  const { status: agentStatus } = useLocalAgent()
  const { deduplicatedClusters } = useClusters()
  const { progress: updateProgress, dismiss: dismissUpdateProgress } = useUpdateProgress()
  const { isOnline, wasOffline } = useNetworkStatus()
  const { status: backendStatus, versionChanged, isInClusterMode } = useBackendHealth()
  const [offlineBannerDismissed, setOfflineBannerDismissed] = useState(false)
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const [showInClusterAgentDialog, setShowInClusterAgentDialog] = useState(false)
  const [wasBackendDown, setWasBackendDown] = useState(false)
  const [restartState, setRestartState] = useState<'idle' | 'restarting' | 'waiting' | 'copied'>('idle')
  const [restartError, setRestartError] = useState<string | null>(null)

  const handleCopyFallback = useCallback(async () => {
    try {
      await copyToClipboard('./startup-oauth.sh')
      setRestartState('copied')
      setTimeout(() => setRestartState('idle'), UI_FEEDBACK_TIMEOUT_MS)
    } catch {
      setRestartState('idle')
    }
  }, [])

  const handleRestartBackend = useCallback(async () => {
    setRestartState('restarting')
    try {
      const resp = await fetch(`${LOCAL_AGENT_HTTP_URL}/restart-backend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (resp.ok) {
        const data = await resp.json()
        if (data.success) {
          // Agent confirmed restart — show "waiting for connection"
          // until backendDown becomes false (health check succeeds)
          setRestartState('waiting')
          return
        }
      }
      handleCopyFallback()
    } catch {
      setRestartError('Could not reach agent — please restart manually')
      handleCopyFallback()
    }
  }, [handleCopyFallback])

  // Clear stale cache failure metadata on fresh page load so previous-session
  // "Refresh failed" badges don't persist across restarts.
  useEffect(() => {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('kc_meta:')) keysToRemove.push(key)
    }
    keysToRemove.forEach(k => localStorage.removeItem(k))
  }, [])

  // Auto-enable demo mode when agent is confirmed disconnected and not in cluster mode.
  // This prevents the "Offline" state on localhost — users get demo data instead of empty screens.
  // When agent comes back online, auto-disable demo (but only if it was auto-enabled, not manual).
  // Grace period: when user manually toggles demo off, wait 8s for agent to connect before
  // re-enabling demo. The pill shows "connecting" → "disconnected" during this window.
  const demoAutoEnabledRef = useRef(false)
  const demoReEnableTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const prevDemoModeRef = useRef(isDemoMode)
  const userToggledOffRef = useRef(false)
  const AGENT_CONNECT_GRACE_MS = 8000

  // Detect manual toggle-off: isDemoMode went from true → false while agent is still disconnected
  useEffect(() => {
    if (prevDemoModeRef.current && !isDemoMode && agentStatus !== 'connected') {
      userToggledOffRef.current = true
    }
    prevDemoModeRef.current = isDemoMode
  }, [isDemoMode, agentStatus])

  useEffect(() => {
    if (agentStatus === 'disconnected' && !isInClusterMode && !isDemoMode && !isDemoModeForced) {
      if (userToggledOffRef.current) {
        // User manually toggled off — give agent time to connect before re-enabling
        demoReEnableTimerRef.current = setTimeout(() => {
          userToggledOffRef.current = false
          demoAutoEnabledRef.current = true
          setDemoMode(true)
        }, AGENT_CONNECT_GRACE_MS)
      } else {
        // Initial load or agent went offline — enable demo immediately
        demoAutoEnabledRef.current = true
        setDemoMode(true)
      }
    } else if (agentStatus === 'connected' && isDemoMode && demoAutoEnabledRef.current) {
      demoAutoEnabledRef.current = false
      userToggledOffRef.current = false
      if (demoReEnableTimerRef.current) clearTimeout(demoReEnableTimerRef.current)
      setDemoMode(false, true)
    } else {
      // Agent connected or demo manually re-enabled — cancel pending timer
      if (demoReEnableTimerRef.current) clearTimeout(demoReEnableTimerRef.current)
    }
    return () => { if (demoReEnableTimerRef.current) clearTimeout(demoReEnableTimerRef.current) }
  }, [agentStatus, isInClusterMode, isDemoMode])

  // Emit cluster inventory when cluster count changes (counts only, never names).
  // Sets GA4 user property "cluster_count" so you can compute averages across users.
  const prevClusterCountRef = useRef<number>(-1)
  useEffect(() => {
    const total = deduplicatedClusters.length
    if (total === 0 || total === prevClusterCountRef.current) return
    prevClusterCountRef.current = total

    let healthy = 0
    let unhealthy = 0
    let unreachable = 0
    const distributions: Record<string, number> = {}

    for (const c of deduplicatedClusters) {
      if (c.reachable === false) {
        unreachable++
      } else if (c.healthy === false) {
        unhealthy++
      } else {
        healthy++
      }
      const dist = c.distribution || 'unknown'
      distributions[dist] = (distributions[dist] || 0) + 1
    }

    emitClusterInventory({ total, healthy, unhealthy, unreachable, distributions })
  }, [deduplicatedClusters])

  // Startup snackbar — shows while backend health is in initial 'connecting' state
  const showStartupSnackbar = !isDemoModeForced && backendStatus === 'connecting'

  // Show network banner when browser detects no network, or briefly after reconnecting
  const showNetworkBanner = !isOnline || wasOffline
  // Show offline banner only when agent is confirmed disconnected (not during 'connecting' state)
  // This prevents flickering during initial connection attempts
  const showOfflineBanner = !isDemoMode && agentStatus === 'disconnected' && backendStatus !== 'connected' && !offlineBannerDismissed
  // Show in-cluster agent banner when running in a cluster (Helm) and no agent connection detected.
  // This is distinct from the offline banner (which requires backend to be down too).
  const showInClusterBanner = isInClusterMode && agentStatus === 'disconnected' && !isDemoMode

  // Banner stacking: each banner's top offset depends on how many banners above it are visible.
  // Navbar is 64px (top-16). Each banner is ~36px tall.
  // Z-index hierarchy: Navbar + dropdowns (z-50) > Network banner (z-40) > Demo banner (z-30) > In-cluster / Offline banner (z-20)
  const NAVBAR_HEIGHT = 64
  const BANNER_HEIGHT = 36
  // Stack order: Network (top) → Demo → In-cluster agent / Agent Offline (bottom)
  const networkBannerTop = NAVBAR_HEIGHT
  const demoBannerTop = NAVBAR_HEIGHT + (showNetworkBanner ? BANNER_HEIGHT : 0)
  const inClusterBannerTop = NAVBAR_HEIGHT + (showNetworkBanner ? BANNER_HEIGHT : 0) + (isDemoMode ? BANNER_HEIGHT : 0)
  const offlineBannerTop = NAVBAR_HEIGHT + (showNetworkBanner ? BANNER_HEIGHT : 0) + (isDemoMode ? BANNER_HEIGHT : 0) + (showInClusterBanner ? BANNER_HEIGHT : 0)
  const activeBannerCount = (showNetworkBanner ? 1 : 0) + (isDemoMode ? 1 : 0) + (showInClusterBanner ? 1 : 0) + (showOfflineBanner ? 1 : 0)
  const totalBannerHeight = activeBannerCount * BANNER_HEIGHT

  // Show bottom snackbar when backend is down, or briefly after reconnecting.
  // Suppress during active updates — the backend is expected to be down while restarting.
  const backendDown = backendStatus === 'disconnected'
  const isUpdateInProgress = updateProgress != null && !['idle', 'done', 'failed'].includes(updateProgress.status)
  const showBackendBanner = (backendDown || wasBackendDown) && !isUpdateInProgress
  const prevBackendDown = useRef(backendDown)
  useEffect(() => {
    const wasDown = prevBackendDown.current
    prevBackendDown.current = backendDown
    // Detect transition: was disconnected → now connected
    if (wasDown && !backendDown) {
      setRestartState('idle')
      setWasBackendDown(true)
      const timer = setTimeout(() => setWasBackendDown(false), TOAST_DISMISS_MS)
      return () => clearTimeout(timer)
    }
  }, [backendDown])

  // Track navigation for behavior analysis
  useNavigationHistory()

  // Persist and restore last route and scroll position
  useLastRoute()

  // Handle deep links from notifications (opens drilldowns based on URL params)
  useDeepLink()

  return (
    <VersionCheckProvider>
    <TourProvider>
    <div className="h-screen bg-background overflow-hidden flex flex-col">
      {/* Dev mode accent line — 2px green bar at top of viewport (like VS Code debug mode) */}
      {__DEV_MODE__ && (
        <div className="h-0.5 bg-green-500 flex-shrink-0 z-[60]" title="Development build" />
      )}

      {/* Skip to content link for keyboard users and screen readers */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-purple-500 focus:text-white focus:rounded-lg"
      >
        {t('actions.skipToContent')}
      </a>

      {/* Tour overlay and prompt */}
      <TourOverlay />
      <TourPrompt />

      {/* Star field background — positions are stable (module-level constant) */}
      <div className="star-field">
        {STAR_POSITIONS.map((style, i) => (
          <div key={i} className="star" style={style} />
        ))}
      </div>

      <Navbar />

      {/* Auto-Update Progress Banner */}
      <UpdateProgressBanner progress={updateProgress} onDismiss={dismissUpdateProgress} />

      {/* Network Disconnected Banner */}
      {showNetworkBanner && (
        <div
          style={{ top: networkBannerTop, left: sidebarWidthPx }}
          className={cn(
            "fixed right-0 z-40 border-b transition-[left] duration-300",
            isOnline
              ? "bg-green-500/10 border-green-500/20"
              : "bg-red-500/10 border-red-500/20",
          )}>
          <div className="flex items-center justify-center gap-3 py-1.5 px-4">
            {isOnline ? (
              <>
                <Wifi className="w-4 h-4 text-green-400" aria-hidden="true" />
                <span className="text-sm text-green-400 font-medium">
                  Network Reconnected
                </span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-red-400" aria-hidden="true" />
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

      {/* Demo Mode Banner — context-aware messaging:
          - Authenticated (real JWT) but no agent: "Connect your agent"
          - No auth / Netlify preview: "Install locally" */}
      {isDemoMode && (() => {
        const isAuthenticatedNoAgent = hasRealToken() && agentStatus !== 'connected'
        return (
          <div
            style={{ top: demoBannerTop, left: sidebarWidthPx }}
            className={cn(
              "fixed right-0 z-30 bg-background border-b border-yellow-500/20 transition-[left] duration-300",
            )}>
            <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 py-1.5 px-3 md:px-4">
              {isAuthenticatedNoAgent
                ? <Plug className="w-4 h-4 text-yellow-400" aria-hidden="true" />
                : <Box className="w-4 h-4 text-yellow-400" aria-hidden="true" />
              }
              <span className="text-sm text-yellow-400 font-medium">
                {isAuthenticatedNoAgent ? 'Agent Not Connected' : 'Demo Mode'}
              </span>
              <span className="hidden md:inline text-xs text-yellow-400/70">
                {isAuthenticatedNoAgent
                  ? 'Showing sample data — connect the kc-agent to monitor your real clusters'
                  : 'Showing sample data only — install locally to monitor your real clusters'
                }
              </span>
              <Button
                variant="accent"
                size="sm"
                onClick={() => setShowSetupDialog(true)}
                className="hidden sm:flex ml-2 rounded-full"
              >
                {isAuthenticatedNoAgent ? (
                  <>
                    <Plug className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="hidden lg:inline">How to connect the agent</span>
                    <span className="lg:hidden">Connect</span>
                  </>
                ) : (
                  <>
                    <Rocket className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="hidden lg:inline">Want your own local KubeStellar Console?</span>
                    <span className="lg:hidden">Get Console</span>
                  </>
                )}
              </Button>
              <button
                onClick={() => isDemoModeForced ? setShowSetupDialog(true) : toggleDemoMode()}
                className="ml-1 md:ml-2 p-2 min-h-11 min-w-11 hover:bg-yellow-500/20 rounded transition-colors"
                aria-label={isDemoModeForced ? t('buttons.installConsole') : t('buttons.exitDemoMode')}
                title={isDemoModeForced ? t('buttons.installConsole') : t('buttons.exitDemoMode')}
              >
                <X className="w-3.5 h-3.5 text-yellow-400" aria-hidden="true" />
              </button>
            </div>
          </div>
        )
      })()}

      {/* In-Cluster Agent Banner — shown when running in a Kubernetes cluster (Helm) with no agent connection */}
      {showInClusterBanner && (
        <div
          style={{ top: inClusterBannerTop, left: sidebarWidthPx }}
          className={cn(
            "fixed right-0 z-20 bg-background border-b border-blue-500/20 transition-[left] duration-300",
          )}>
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 py-1.5 px-3 md:px-4">
            <Plug className="w-4 h-4 text-blue-400" aria-hidden="true" />
            <span className="text-sm text-blue-400 font-medium">
              Agent Not Detected
            </span>
            <span className="hidden md:inline text-xs text-blue-400/70">
              Install the kc-agent or configure CORS to connect your clusters
            </span>
            <Button
              variant="accent"
              size="sm"
              onClick={() => setShowInClusterAgentDialog(true)}
              className="hidden sm:flex ml-2 rounded-full"
            >
              <Plug className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden lg:inline">Setup Guide</span>
              <span className="lg:hidden">Setup</span>
            </Button>
            <button
              onClick={() => setShowInClusterAgentDialog(true)}
              className="sm:hidden ml-1 p-2 min-h-11 min-w-11 hover:bg-blue-500/20 rounded transition-colors"
              aria-label="Open agent setup guide"
              title="Open agent setup guide"
            >
              <Plug className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Offline Mode Banner - positioned in main content area only */}
      {showOfflineBanner && (
        <div
          style={{ top: offlineBannerTop, left: sidebarWidthPx }}
          className={cn(
            "fixed z-20 bg-background border-b border-orange-500/20 transition-[right] duration-300",
          // Adjust right edge when mission sidebar is open (desktop only)
          !isMobile && isMissionSidebarOpen && !isMissionSidebarMinimized && !isMissionFullScreen ? "right-[580px]" : "right-0",
          !isMobile && isMissionSidebarOpen && isMissionSidebarMinimized && !isMissionFullScreen && "right-12"
        )}>
          <div className="flex flex-wrap items-center justify-between gap-2 py-1.5 px-3 md:px-4">
            <div className="flex items-center gap-2 min-w-0">
              <WifiOff className="w-4 h-4 text-orange-400 shrink-0" />
              <span className="text-sm text-orange-400 font-medium shrink-0">{t('common.offline')}</span>
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
                className="p-2 min-h-11 min-w-11 hover:bg-orange-500/20 rounded transition-colors"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5 text-orange-400" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden transition-[padding-top] duration-300" style={{ paddingTop: NAVBAR_HEIGHT + totalBannerHeight }}>
        <Sidebar />
        <main
          id="main-content"
          style={{ marginLeft: sidebarWidthPx }}
          className={cn(
            'relative flex-1 p-4 pb-24 md:p-6 md:pb-28 transition-[margin] duration-300 overflow-y-auto scroll-enhanced min-w-0',
            // Don't apply right margin when fullscreen is active or on mobile
            !isMobile && isMissionSidebarOpen && !isMissionSidebarMinimized && !isMissionFullScreen && 'mr-[580px]',
            !isMobile && isMissionSidebarOpen && isMissionSidebarMinimized && !isMissionFullScreen && 'mr-12'
          )}>
          <NavigationProgress />
          {children ? (
            <Suspense fallback={<ContentLoadingSkeleton />}>
              {children}
            </Suspense>
          ) : (
            <KeepAliveOutlet />
          )}
        </main>
      </div>

      {/* AI Mission sidebar — lazy loaded to keep react-markdown out of initial bundle */}
      <Suspense fallback={null}>
        <MissionSidebar />
        <MissionSidebarToggle />
      </Suspense>

      {/* Setup Instructions Dialog — also shown when user tries to exit forced demo mode */}
      <SetupInstructionsDialog
        isOpen={showSetupDialog}
        onClose={() => setShowSetupDialog(false)}
      />

      {/* In-Cluster Agent Dialog — install agent or configure CORS */}
      <InClusterAgentDialog
        isOpen={showInClusterAgentDialog}
        onClose={() => setShowInClusterAgentDialog(false)}
      />

      {/* Backend connection lost snackbar — fixed bottom center */}
      {showBackendBanner && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className={cn(
            "flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg text-sm",
            backendDown
              ? "bg-secondary border-border text-foreground"
              : "bg-green-900/80 border-green-700/50 text-green-200"
          )}>
            {backendDown ? (
              <>
                <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                <span>Connection lost</span>
                {restartState === 'restarting' ? (
                  <button disabled className="ml-1 flex items-center gap-1.5 px-2.5 py-1 bg-muted text-muted-foreground rounded text-xs cursor-wait">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Restarting&hellip;
                  </button>
                ) : restartState === 'waiting' ? (
                  <span className="ml-1 flex items-center gap-1.5 px-2.5 py-1 bg-muted text-muted-foreground rounded text-xs">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Restarted, waiting for connection&hellip;
                  </span>
                ) : restartState === 'copied' ? (
                  <span className="ml-1 flex items-center gap-1.5 px-2.5 py-1 bg-green-800/50 text-green-300 rounded text-xs">
                    <Check className="w-3 h-3" />
                    Copied!
                  </span>
                ) : (
                  <button
                    onClick={handleRestartBackend}
                    className="ml-1 flex items-center gap-1.5 px-2.5 py-1 bg-muted hover:bg-muted/80 text-foreground rounded text-xs transition-colors"
                    title={restartError ?? 'Restart the backend server'}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restart
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-green-400" />
                Reconnected
              </>
            )}
          </div>
        </div>
      )}
      {/* Startup snackbar — non-blocking info while backend initializes */}
      {showStartupSnackbar && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-sm bg-blue-950/90 border-blue-800/50 text-blue-200">
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            <span>Starting up&hellip;</span>
          </div>
        </div>
      )}

      {/* Version changed snackbar — persistent until user reloads */}
      {versionChanged && !showStartupSnackbar && !showBackendBanner && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-sm bg-blue-950/90 border-blue-800/50 text-blue-200">
            <RefreshCw className="w-4 h-4 text-blue-400" />
            <span>A new version is available</span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.location.reload()}
              className="ml-1 rounded"
            >
              Reload
            </Button>
          </div>
        </div>
      )}
    </div>
    </TourProvider>
    </VersionCheckProvider>
  )
}
