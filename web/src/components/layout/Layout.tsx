import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, matchPath, useLocation } from 'react-router-dom'
import {
  AlertTriangle,
  Box,
  ExternalLink,
  Plug,
  Rocket,
  Settings,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { useToast } from '../ui/Toast'
import {
  useSidebarConfig,
  SIDEBAR_COLLAPSED_WIDTH_PX,
  SIDEBAR_DEFAULT_WIDTH_PX,
} from '../../hooks/useSidebarConfig'
import { useMobile } from '../../hooks/useMobile'
import { useNavigationHistory } from '../../hooks/useNavigationHistory'
import { useLastRoute } from '../../hooks/useLastRoute'
import {
  useDemoMode,
  hasRealToken,
  isDemoModeForced,
} from '../../hooks/useDemoMode'
import { setDemoMode } from '../../lib/demoMode'
import { hasApprovedAgents } from '../agent/AgentApprovalDialog'
import { useLocalAgent, wasAgentEverConnected } from '../../hooks/useLocalAgent'
import { useClusters } from '../../hooks/mcp/clusters'
import { emitClusterInventory } from '../../lib/analytics'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { useBackendHealth } from '../../hooks/useBackendHealth'
import { useKagentBackend } from '../../hooks/useKagentBackend'
import { useDeepLink } from '../../hooks/useDeepLink'
import { cn } from '../../lib/cn'
import { LOCAL_AGENT_HTTP_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { agentFetch } from '../../hooks/mcp/shared'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'
import {
  BANNER_HEIGHT_PX,
  MOBILE_BANNER_COLLAPSE_THRESHOLD,
} from '../../lib/constants/ui'
import { UI_FEEDBACK_TIMEOUT_MS, TOAST_DISMISS_MS } from '../../lib/constants/network'
import { STORAGE_KEY_AUTONOMOUS_BANNER_DISMISSED } from '../../lib/constants/storage'
import { TourProvider } from '../../hooks/useTour'
import { SetupInstructionsDialog } from '../setup/SetupInstructionsDialog'
import { InClusterAgentDialog } from '../setup/InClusterAgentDialog'
import { AgentSetupDialog } from '../agent/AgentSetupDialog'
import { useUpdateProgress } from '../../hooks/useUpdateProgress'
import { VersionCheckProvider } from '../../hooks/useVersionCheck'
import { copyToClipboard } from '../../lib/clipboard'
import { ROUTES } from '../../config/routes'
import { NavigationShell, type LayoutBanner } from './NavigationShell'
import { ProgressToast, type RestartState } from './ProgressToast'
import { useStaleCacheCleanup } from './useStaleCacheCleanup'

export { ContentLoadingSkeleton } from './LoadingSkeleton'
export { getStaleCacheMetaKeys } from './useStaleCacheCleanup'

const AGENT_CONNECT_GRACE_MS = 8000
const UPDATE_TOAST_DONE_DISMISS_MS = 5000
const UPDATE_TOAST_TERMINAL_DISMISS_MS = 8000
const HIVE_DASHBOARD_URL = 'https://kubestellar.io/live/hive'

type LayoutProps = {
  children?: ReactNode
}

export function Layout({ children: _children }: LayoutProps) {
  const { t } = useTranslation()
  const { config } = useSidebarConfig()
  const { isMobile } = useMobile()
  const location = useLocation()
  const sidebarWidthPx = isMobile
    ? 0
    : config.collapsed
      ? SIDEBAR_COLLAPSED_WIDTH_PX
      : (config.width ?? SIDEBAR_DEFAULT_WIDTH_PX)
  const { isDemoMode, toggleDemoMode } = useDemoMode()
  const { showToast } = useToast()
  const { status: agentStatus } = useLocalAgent()
  const { deduplicatedClusters } = useClusters()
  const { progress: updateProgress, dismiss: dismissUpdateProgress } = useUpdateProgress()
  const { isOnline, wasOffline } = useNetworkStatus()
  const {
    status: backendStatus,
    versionChanged,
    isInClusterMode,
    watchdogStage,
  } = useBackendHealth()
  const { kagentAvailable, kagentiAvailable } = useKagentBackend()
  const [offlineBannerDismissed, setOfflineBannerDismissed] = useState(false)
  const [demoBannerDismissed, setDemoBannerDismissed] = useState(false)
  const [autonomousBannerDismissed, setAutonomousBannerDismissed] = useState(
    () => safeGetItem(STORAGE_KEY_AUTONOMOUS_BANNER_DISMISSED) === 'true',
  )
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const [showInClusterAgentDialog, setShowInClusterAgentDialog] = useState(false)
  const [mobileBannerStackExpanded, setMobileBannerStackExpanded] = useState(false)
  const [wasBackendDown, setWasBackendDown] = useState(false)
  const [updateToastDismissed, setUpdateToastDismissed] = useState(false)
  const isDashboardRoute =
    location.pathname === ROUTES.HOME
    || location.pathname === ROUTES.DASHBOARD_ALIAS
    || location.pathname === ROUTES.MISSIONS
    || matchPath(ROUTES.CUSTOM_DASHBOARD, location.pathname) !== null
  const shouldReserveNavbarFilterPanelOffset = !isDashboardRoute

  useEffect(() => {
    const handler = () => setShowSetupDialog(true)
    window.addEventListener('open-install', handler)
    return () => window.removeEventListener('open-install', handler)
  }, [])

  useEffect(() => {
    const handler = () => showToast(t('errors.cacheResetFailed'), 'warning')
    window.addEventListener('cache-reset-error', handler)
    return () => window.removeEventListener('cache-reset-error', handler)
  }, [showToast, t])

  const [restartState, setRestartState] = useState<RestartState>('idle')
  const [restartError, setRestartError] = useState<string | null>(null)

  const handleCopyFallback = async () => {
    try {
      await copyToClipboard('./startup-oauth.sh')
      setRestartState('copied')
      setTimeout(() => setRestartState('idle'), UI_FEEDBACK_TIMEOUT_MS)
    } catch {
      setRestartError('Could not copy command — please run ./startup-oauth.sh manually')
      setRestartState('idle')
    }
  }

  const handleRestartBackend = async () => {
    setRestartState('restarting')
    try {
      const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/restart-backend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (resp.ok) {
        const data = await resp.json()
        if (data.success) {
          setRestartState('waiting')
          return
        }
      }
      handleCopyFallback()
    } catch {
      setRestartError('Could not reach agent — please restart manually')
      handleCopyFallback()
    }
  }

  useStaleCacheCleanup()

  const demoAutoEnabledRef = useRef(false)
  const demoReEnableTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const prevDemoModeRef = useRef(isDemoMode)
  const userToggledOffRef = useRef(false)

  useEffect(() => {
    if (prevDemoModeRef.current && !isDemoMode && agentStatus !== 'connected') {
      userToggledOffRef.current = true
    }
    prevDemoModeRef.current = isDemoMode
  }, [agentStatus, isDemoMode])

  useEffect(() => {
    if (
      agentStatus === 'disconnected'
      && !isInClusterMode
      && !isDemoMode
      && !isDemoModeForced
    ) {
      if (userToggledOffRef.current) {
        demoReEnableTimerRef.current = setTimeout(() => {
          userToggledOffRef.current = false
          demoAutoEnabledRef.current = true
          setDemoMode(true)
        }, AGENT_CONNECT_GRACE_MS)
      } else if (!wasAgentEverConnected()) {
        demoAutoEnabledRef.current = true
        setDemoMode(true)
      }
    } else if (
      agentStatus === 'connected'
      && isDemoMode
      && demoAutoEnabledRef.current
      && hasApprovedAgents()
    ) {
      demoAutoEnabledRef.current = false
      userToggledOffRef.current = false
      if (demoReEnableTimerRef.current) {
        clearTimeout(demoReEnableTimerRef.current)
      }
      setDemoMode(false, true)
    } else if (demoReEnableTimerRef.current) {
      clearTimeout(demoReEnableTimerRef.current)
    }

    return () => {
      if (demoReEnableTimerRef.current) {
        clearTimeout(demoReEnableTimerRef.current)
      }
    }
  }, [agentStatus, isDemoMode, isInClusterMode])

  const prevClusterCountRef = useRef<number>(-1)
  useEffect(() => {
    const total = deduplicatedClusters.length
    if (total === 0 || total === prevClusterCountRef.current) return
    prevClusterCountRef.current = total

    let healthy = 0
    let unhealthy = 0
    let unreachable = 0
    const distributions: Record<string, number> = {}

    for (const cluster of deduplicatedClusters) {
      if (cluster.reachable === false) {
        unreachable++
      } else if (cluster.healthy === false) {
        unhealthy++
      } else {
        healthy++
      }
      const distribution = cluster.distribution || 'unknown'
      distributions[distribution] = (distributions[distribution] || 0) + 1
    }

    emitClusterInventory({
      total,
      healthy,
      unhealthy,
      unreachable,
      distributions,
    })
  }, [deduplicatedClusters])

  const showStartupSnackbar = !isDemoModeForced && backendStatus === 'connecting'
  const showNetworkBanner = !isOnline || wasOffline
  const showDemoBanner = isDemoMode && !demoBannerDismissed
  const showOfflineBanner =
    !isDemoMode
    && agentStatus === 'disconnected'
    && backendStatus !== 'connected'
    && !offlineBannerDismissed
  const hasInClusterAIBackend = kagentAvailable || kagentiAvailable
  const showInClusterBanner =
    isInClusterMode
    && agentStatus === 'disconnected'
    && !isDemoMode
    && !hasInClusterAIBackend
  const isAuthenticatedNoAgent = hasRealToken() && agentStatus !== 'connected'

  const activeBanners: LayoutBanner[] = []

  if (showNetworkBanner) {
    activeBanners.push({
      id: 'network',
      className: cn(
        'right-0 z-40 border-b',
        isOnline
          ? 'bg-green-500/10 border-green-500/20'
          : 'bg-red-500/10 border-red-500/20',
      ),
      content: (
        <div className="flex items-center justify-center gap-3 py-1.5 px-4">
          {isOnline ? (
            <>
              <Wifi className="w-4 h-4 text-green-400" aria-hidden="true" />
              <span className="text-sm text-green-400 font-medium">
                {t('layout.networkReconnected')}
              </span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-red-400" aria-hidden="true" />
              <span className="text-sm text-red-400 font-medium">
                {t('layout.networkDisconnected')}
              </span>
              <span className="text-xs text-red-400/70">
                {t('layout.checkInternetConnection')}
              </span>
            </>
          )}
        </div>
      ),
    })
  }

  if (showDemoBanner) {
    activeBanners.push({
      id: 'demo',
      className: 'right-0 z-30 bg-background border-b border-border/30',
      content: (
        <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 py-1.5 px-3 md:px-4">
          {isAuthenticatedNoAgent
            ? <Plug className="w-4 h-4 text-yellow-400" aria-hidden="true" />
            : <Box className="w-4 h-4 text-yellow-400" aria-hidden="true" />}
          <span className="text-sm text-yellow-400 font-medium">
            {isAuthenticatedNoAgent ? t('layout.agentNotConnected') : t('layout.demoMode')}
          </span>
          <span className="hidden md:inline text-xs text-yellow-400/70">
            {isAuthenticatedNoAgent
              ? t('layout.sampleDataConnectAgent')
              : t('layout.sampleDataInstallLocally')}
          </span>
          <Button
            variant="accent"
            size="sm"
            onClick={() => setShowSetupDialog(true)}
            className="hidden sm:flex ml-2 rounded-full whitespace-nowrap"
          >
            {isAuthenticatedNoAgent ? (
              <>
                <Plug className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden xl:inline">{t('layout.howToConnectAgent')}</span>
                <span className="xl:hidden">{t('layout.connect')}</span>
              </>
            ) : (
              <>
                <Rocket className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden xl:inline">{t('layout.wantYourOwnConsole')}</span>
                <span className="xl:hidden">{t('layout.getConsole')}</span>
              </>
            )}
          </Button>
          <button
            onClick={() => isDemoModeForced ? setDemoBannerDismissed(true) : toggleDemoMode()}
            className="ml-1 md:ml-2 p-2 min-h-11 min-w-11 flex items-center justify-center hover:bg-yellow-500/20 rounded-full transition-colors"
            aria-label={isDemoModeForced ? t('buttons.dismissBanner') : t('buttons.exitDemoMode')}
            title={isDemoModeForced ? t('buttons.dismissBanner') : t('buttons.exitDemoMode')}
          >
            <X className="w-3.5 h-3.5 text-yellow-400" aria-hidden="true" />
          </button>
        </div>
      ),
    })
  }

  if (showInClusterBanner) {
    activeBanners.push({
      id: 'in-cluster',
      className: 'right-0 z-20 bg-background border-b border-blue-500/20',
      content: (
        <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 py-1.5 px-3 md:px-4">
          <Plug className="w-4 h-4 text-blue-400" aria-hidden="true" />
          <span className="text-sm text-blue-400 font-medium">
            {t('layout.agentNotDetected')}
          </span>
          <span className="hidden md:inline text-xs text-blue-400/70">
            {t('layout.installAgentOrCORS')}
          </span>
          <Button
            variant="accent"
            size="sm"
            onClick={() => setShowInClusterAgentDialog(true)}
            className="hidden sm:flex ml-2 rounded-full"
          >
            <Plug className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden lg:inline">{t('layout.setupGuide')}</span>
            <span className="lg:hidden">{t('layout.setup')}</span>
          </Button>
          <button
            onClick={() => setShowInClusterAgentDialog(true)}
            className="sm:hidden ml-1 p-2 min-h-11 min-w-11 flex items-center justify-center hover:bg-blue-500/20 rounded-full transition-colors"
            aria-label={t('layout.openAgentSetupGuide')}
            title={t('layout.openAgentSetupGuide')}
          >
            <Plug className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
          </button>
        </div>
      ),
    })
  }

  if (showOfflineBanner) {
    activeBanners.push({
      id: 'offline',
      className: 'z-20 bg-background border-b border-orange-500/20',
      style: { right: 'var(--mission-sidebar-width, 0px)' },
      content: (
        <div className="flex flex-wrap items-center justify-between gap-2 py-1.5 px-3 md:px-4">
          <div className="flex items-center gap-2 min-w-0">
            <WifiOff className="w-4 h-4 text-orange-400 shrink-0" />
            <span className="text-sm text-orange-400 font-medium shrink-0">
              {t('common.offline')}
            </span>
            <span className="hidden lg:inline text-xs text-orange-400/70 truncate">
              — Install: <code className="bg-orange-500/20 px-1 rounded">brew install kubestellar/tap/kc-agent</code> → run <code className="bg-orange-500/20 px-1 rounded">kc-agent</code>
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to={ROUTES.SETTINGS}
              className="flex items-center gap-1 text-xs px-2 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded transition-colors whitespace-nowrap"
            >
              <Settings className="w-3 h-3" />
              <span className="hidden sm:inline">{t('navigation.settings')}</span>
            </Link>
            <button
              onClick={toggleDemoMode}
              className="text-xs px-2 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded transition-colors whitespace-nowrap min-h-11 min-w-11"
            >
              <span className="hidden sm:inline">{t('layout.switchTo')} </span>
              {t('layout.demo')}
            </button>
            <button
              onClick={() => setOfflineBannerDismissed(true)}
              className="p-2 min-h-11 min-w-11 flex items-center justify-center hover:bg-orange-500/20 rounded-full transition-colors"
              title={t('actions.dismiss')}
            >
              <X className="w-3.5 h-3.5 text-orange-400" />
            </button>
          </div>
        </div>
      ),
    })
  }

  if (!autonomousBannerDismissed) {
    activeBanners.push({
      id: 'autonomous',
      className: 'right-0 z-10 bg-purple-500/10 border-b border-purple-500/20',
      content: (
        <div className="flex items-center justify-center gap-2 md:gap-3 py-1.5 px-3 md:px-4">
          <span className="text-sm" aria-hidden="true">🐝</span>
          <span className="text-sm text-purple-300 font-medium">
            {t('layout.autonomousBannerMessage')}
          </span>
          <a
            href={HIVE_DASHBOARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1 text-xs px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded transition-colors whitespace-nowrap"
          >
            {t('layout.watchLive')}
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </a>
          <a
            href={HIVE_DASHBOARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="sm:hidden text-xs text-purple-300 underline underline-offset-2 whitespace-nowrap"
          >
            {t('layout.watchLiveMobile')}
          </a>
          <button
            onClick={() => {
              setAutonomousBannerDismissed(true)
              safeSetItem(STORAGE_KEY_AUTONOMOUS_BANNER_DISMISSED, 'true')
            }}
            className="ml-1 md:ml-2 p-2 min-h-11 min-w-11 flex items-center justify-center hover:bg-purple-500/20 rounded-full transition-colors"
            aria-label={t('buttons.dismissBanner')}
            title={t('buttons.dismissBanner')}
          >
            <X className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" />
          </button>
        </div>
      ),
    })
  }

  const showMobileBannerSummary =
    isMobile && activeBanners.length > MOBILE_BANNER_COLLAPSE_THRESHOLD

  useEffect(() => {
    if (showMobileBannerSummary) {
      return undefined
    }

    const resetExpandedState = window.setTimeout(() => {
      setMobileBannerStackExpanded(false)
    }, 0)

    return () => window.clearTimeout(resetExpandedState)
  }, [showMobileBannerSummary])

  const visibleBanners: LayoutBanner[] = showMobileBannerSummary
    ? [{
        id: 'mobile-banner-summary',
        className: 'right-0 z-40 bg-background border-b border-yellow-500/20',
        content: (
          <div className="flex items-center justify-between gap-3 py-1.5 px-3">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" aria-hidden="true" />
              <span className="text-sm text-yellow-400 font-medium truncate">
                {t('layout.activeAlerts', { count: activeBanners.length })}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMobileBannerStackExpanded(expanded => !expanded)}
              className="text-xs px-2 py-2 min-h-11 whitespace-nowrap bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded transition-colors"
              aria-expanded={mobileBannerStackExpanded}
            >
              {mobileBannerStackExpanded ? t('layout.hideAlerts') : t('layout.reviewAlerts')}
            </button>
          </div>
        ),
      }, ...(mobileBannerStackExpanded ? activeBanners : [])]
    : activeBanners

  const totalBannerHeight = visibleBanners.length * BANNER_HEIGHT_PX
  const backendDown = backendStatus === 'disconnected'
  const isUpdateInProgress =
    updateProgress != null
    && !['idle', 'done', 'failed', 'cancelled'].includes(updateProgress.status)
  const showBackendBanner =
    (backendDown || wasBackendDown)
    && !isUpdateInProgress
    && !isDemoModeForced
    && !isInClusterMode
  const backendRecovering = backendDown && (
    Boolean(watchdogStage)
    || restartState === 'restarting'
    || restartState === 'waiting'
    || restartState === 'copied'
  )
  const backendUnavailable = backendDown && !backendRecovering
  const prevBackendDown = useRef(backendDown)

  useEffect(() => {
    const wasDown = prevBackendDown.current
    prevBackendDown.current = backendDown
    if (wasDown && !backendDown) {
      setRestartState('idle')
      setWasBackendDown(true)
      const timer = setTimeout(() => setWasBackendDown(false), TOAST_DISMISS_MS)
      return () => clearTimeout(timer)
    }
  }, [backendDown])

  const prevUpdateStatus = useRef(updateProgress?.status)
  useEffect(() => {
    const currentStatus = updateProgress?.status
    const previousStatus = prevUpdateStatus.current
    prevUpdateStatus.current = currentStatus
    if (
      currentStatus
      && ['pulling', 'building', 'checking'].includes(currentStatus)
      && previousStatus !== currentStatus
    ) {
      setUpdateToastDismissed(false)
    }
  }, [updateProgress?.status])

  useEffect(() => {
    if (!updateProgress) return
    const { status } = updateProgress
    if (status === 'done') {
      const timer = setTimeout(() => setUpdateToastDismissed(true), UPDATE_TOAST_DONE_DISMISS_MS)
      return () => clearTimeout(timer)
    }
    if (status === 'failed' || status === 'cancelled') {
      const timer = setTimeout(() => setUpdateToastDismissed(true), UPDATE_TOAST_TERMINAL_DISMISS_MS)
      return () => clearTimeout(timer)
    }
  }, [updateProgress?.status])

  const showUpdateToast = updateProgress != null
    && updateProgress.status !== 'idle'
    && !updateToastDismissed

  useNavigationHistory()
  useLastRoute()
  useDeepLink()

  return (
    <VersionCheckProvider>
      <TourProvider>
        <NavigationShell
          dismissUpdateProgress={dismissUpdateProgress}
          isMobile={isMobile}
          pathname={location.pathname}
          shouldReserveNavbarFilterPanelOffset={shouldReserveNavbarFilterPanelOffset}
          sidebarWidthPx={sidebarWidthPx}
          totalBannerHeight={totalBannerHeight}
          updateProgress={updateProgress}
          visibleBanners={visibleBanners}
        >
          <SetupInstructionsDialog
            isOpen={showSetupDialog}
            onClose={() => setShowSetupDialog(false)}
          />
          <InClusterAgentDialog
            isOpen={showInClusterAgentDialog}
            onClose={() => setShowInClusterAgentDialog(false)}
          />
          <AgentSetupDialog />
          <ProgressToast
            backendDown={backendDown}
            backendUnavailable={backendUnavailable}
            onDismissUpdateToast={() => setUpdateToastDismissed(true)}
            onRestartBackend={handleRestartBackend}
            restartError={restartError}
            restartState={restartState}
            showBackendBanner={showBackendBanner}
            showStartupSnackbar={showStartupSnackbar}
            showUpdateToast={showUpdateToast}
            updateProgress={updateProgress}
            versionChanged={versionChanged}
            watchdogStage={watchdogStage}
          />
        </NavigationShell>
      </TourProvider>
    </VersionCheckProvider>
  )
}
