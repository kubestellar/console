import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AlertTriangle, Box, Plug, Rocket, Settings, Wifi, WifiOff, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import {
  BANNER_HEIGHT_PX,
  MOBILE_BANNER_COLLAPSE_THRESHOLD,
} from '../../lib/constants/ui'
import { ROUTES } from '../../config/routes'
import type { LayoutBanner } from './NavigationShell'
import { AutonomousBanner } from './AutonomousBanner'

interface UseLayoutBannersOptions {
  autonomousBannerDismissed: boolean
  hasInClusterAIBackend: boolean
  isAuthenticatedNoAgent: boolean
  isDemoMode: boolean
  isDemoModeForced: boolean
  isInClusterMode: boolean
  isMobile: boolean
  isOnline: boolean
  demoBannerDismissed: boolean
  offlineBannerDismissed: boolean
  wasOffline: boolean
  backendStatus: string
  agentStatus: string
  onDismissAutonomous: () => void
  onDismissOffline: () => void
  onOpenInClusterSetup: () => void
  onOpenSetup: () => void
  onToggleDemoMode: () => void
  onToggleDemoOrDismiss: () => void
}

export function useLayoutBanners({
  autonomousBannerDismissed,
  hasInClusterAIBackend,
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
  onDismissAutonomous,
  onDismissOffline,
  onOpenInClusterSetup,
  onOpenSetup,
  onToggleDemoMode,
  onToggleDemoOrDismiss,
}: UseLayoutBannersOptions) {
  const { t } = useTranslation()
  const [mobileBannerStackExpanded, setMobileBannerStackExpanded] = useState(false)

  const showNetworkBanner = !isOnline || wasOffline
  const showDemoBanner = isDemoMode && !demoBannerDismissed
  const showOfflineBanner =
    !isDemoMode
    && agentStatus === 'disconnected'
    && backendStatus !== 'connected'
    && !offlineBannerDismissed
  const showInClusterBanner =
    isInClusterMode
    && agentStatus === 'disconnected'
    && !isDemoMode
    && !hasInClusterAIBackend

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
        <div className="flex w-full min-w-0 items-center justify-center gap-2 px-3 py-1.5 md:gap-3 md:px-4">
          {isOnline ? (
            <>
              <Wifi className="h-4 w-4 shrink-0 text-green-400" aria-hidden="true" />
              <span className="truncate text-sm font-medium text-green-400">
                {t('layout.networkReconnected')}
              </span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
              <span className="shrink-0 text-sm font-medium text-red-400">
                {t('layout.networkDisconnected')}
              </span>
              <span className="truncate text-xs text-red-400/70">
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
        <div className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-1.5 md:px-4">
          <div className="flex min-w-0 items-center gap-2 md:gap-3">
            {isAuthenticatedNoAgent
              ? <Plug className="h-4 w-4 shrink-0 text-yellow-400" aria-hidden="true" />
              : <Box className="h-4 w-4 shrink-0 text-yellow-400" aria-hidden="true" />}
            <div className="min-w-0">
              <span className="block truncate text-sm font-medium text-yellow-400">
                {isAuthenticatedNoAgent ? t('layout.agentNotConnected') : t('layout.demoMode')}
              </span>
              <span className="hidden text-xs text-yellow-400/70 md:inline">
                {isAuthenticatedNoAgent
                  ? t('layout.sampleDataConnectAgent')
                  : t('layout.sampleDataInstallLocally')}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 md:gap-2">
            <Button
              variant="accent"
              size="sm"
              onClick={onOpenSetup}
              className="hidden rounded-full whitespace-nowrap sm:flex"
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
              onClick={onToggleDemoOrDismiss}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-2 transition-colors hover:bg-yellow-500/20"
              aria-label={isDemoModeForced ? t('buttons.dismissBanner') : t('buttons.exitDemoMode')}
              title={isDemoModeForced ? t('buttons.dismissBanner') : t('buttons.exitDemoMode')}
            >
              <X className="w-3.5 h-3.5 text-yellow-400" aria-hidden="true" />
            </button>
          </div>
        </div>
      ),
    })
  }

  if (showInClusterBanner) {
    activeBanners.push({
      id: 'in-cluster',
      className: 'right-0 z-20 bg-background border-b border-blue-500/20',
      content: (
        <div className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-1.5 md:px-4">
          <div className="flex min-w-0 items-center gap-2 md:gap-3">
            <Plug className="h-4 w-4 shrink-0 text-blue-400" aria-hidden="true" />
            <div className="min-w-0">
              <span className="block truncate text-sm font-medium text-blue-400">
                {t('layout.agentNotDetected')}
              </span>
              <span className="hidden text-xs text-blue-400/70 md:inline">
                {t('layout.installAgentOrCORS')}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 md:gap-2">
            <Button
              variant="accent"
              size="sm"
              onClick={onOpenInClusterSetup}
              className="hidden rounded-full sm:flex"
            >
              <Plug className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden lg:inline">{t('layout.setupGuide')}</span>
              <span className="lg:hidden">{t('layout.setup')}</span>
            </Button>
            <button
              onClick={onOpenInClusterSetup}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-2 transition-colors hover:bg-blue-500/20 sm:hidden"
              aria-label={t('layout.openAgentSetupGuide')}
              title={t('layout.openAgentSetupGuide')}
            >
              <Plug className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
            </button>
          </div>
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
        <div className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-1.5 md:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <WifiOff className="h-4 w-4 shrink-0 text-orange-400" />
            <span className="shrink-0 text-sm font-medium text-orange-400">
              {t('common.offline')}
            </span>
            <span className="hidden truncate text-xs text-orange-400/70 lg:inline">
              — Install: <code className="rounded bg-orange-500/20 px-1">brew install kubestellar/tap/kc-agent</code> → run <code className="rounded bg-orange-500/20 px-1">kc-agent</code>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link
              to={ROUTES.SETTINGS}
              className="flex min-h-11 items-center gap-1 rounded bg-orange-500/20 px-2 py-2 text-xs text-orange-400 transition-colors whitespace-nowrap hover:bg-orange-500/30"
            >
              <Settings className="w-3 h-3" />
              <span className="hidden sm:inline">{t('navigation.settings')}</span>
            </Link>
            <button
              onClick={onToggleDemoMode}
              className="min-h-11 min-w-11 rounded bg-orange-500/20 px-2 py-2 text-xs text-orange-400 transition-colors whitespace-nowrap hover:bg-orange-500/30"
            >
              <span className="hidden sm:inline">{t('layout.switchTo')} </span>
              {t('layout.demo')}
            </button>
            <button
              onClick={onDismissOffline}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-2 transition-colors hover:bg-orange-500/20"
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
      content: <AutonomousBanner onDismiss={onDismissAutonomous} />,
    })
  }

  const showMobileBannerSummary = isMobile && activeBanners.length > MOBILE_BANNER_COLLAPSE_THRESHOLD

  useEffect(() => {
    if (showMobileBannerSummary) return undefined
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

  return {
    totalBannerHeight: visibleBanners.length * BANNER_HEIGHT_PX,
    visibleBanners,
  }
}
