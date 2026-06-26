import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { matchPath, useLocation } from 'react-router-dom'
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
  isDemoModeForced,
} from '../../hooks/useDemoMode'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { useClusters } from '../../hooks/mcp/clusters'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { useBackendHealth } from '../../hooks/useBackendHealth'
import { useKagentBackend } from '../../hooks/useKagentBackend'
import { useDeepLink } from '../../hooks/useDeepLink'
import { LOCAL_AGENT_HTTP_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { agentFetch } from '../../hooks/mcp/shared'
import { safeGetItem } from '../../lib/utils/localStorage'
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
import { NavigationShell } from './NavigationShell'
import { ProgressToast, type RestartState } from './ProgressToast'
import { useStaleCacheCleanup } from './useStaleCacheCleanup'
import { useAutoDemoMode } from './useAutoDemoMode'
import { useClusterInventoryAnalytics } from './useClusterInventoryAnalytics'
import { useLayoutBanners } from './LayoutBanners'
import { CompactErrorBoundary } from '../CompactErrorBoundary'

export { ContentLoadingSkeleton } from './LoadingSkeleton'
export { getStaleCacheMetaKeys } from './useStaleCacheCleanup'

const UPDATE_TOAST_DONE_DISMISS_MS = 5000
const UPDATE_TOAST_TERMINAL_DISMISS_MS = 8000

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

  useAutoDemoMode({
    agentStatus,
    isInClusterMode,
    isDemoMode,
    isDemoModeForced,
  })

  useClusterInventoryAnalytics(deduplicatedClusters)

  const [isAuthenticatedNoAgent, setIsAuthenticatedNoAgent] = useState(false)

  useEffect(() => {
    async function checkAuthNoAgent() {
      const { hasRealToken } = await import('@/lib/demoMode')
      const hasReal = await hasRealToken()
      setIsAuthenticatedNoAgent(hasReal && agentStatus !== 'connected')
    }
    checkAuthNoAgent()
  }, [agentStatus])

  const showStartupSnackbar = !isDemoModeForced && backendStatus === 'connecting'
  const { totalBannerHeight, visibleBanners } = useLayoutBanners({
    autonomousBannerDismissed,
    hasInClusterAIBackend: kagentAvailable || kagentiAvailable,
    isAuthenticatedNoAgent,
    isDemoMode,
    isDemoModeForced,
    isInClusterMode,
    isMobile,
    isOnline,
    demoBannerDismissed,
    offlineBannerDismissed,
    wasOffline,
    backendStatus,
    agentStatus,
    onDismissAutonomous: () => setAutonomousBannerDismissed(true),
    onDismissOffline: () => setOfflineBannerDismissed(true),
    onOpenInClusterSetup: () => setShowInClusterAgentDialog(true),
    onOpenSetup: () => setShowSetupDialog(true),
    onToggleDemoMode: toggleDemoMode,
    onToggleDemoOrDismiss: () => {
      if (isDemoModeForced) {
        setDemoBannerDismissed(true)
        return
      }
      toggleDemoMode()
    },
  })

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
          <CompactErrorBoundary context="layout-progress-toast">
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
          </CompactErrorBoundary>
        </NavigationShell>
      </TourProvider>
    </VersionCheckProvider>
  )
}
