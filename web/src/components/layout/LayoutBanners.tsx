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
            onClick={onOpenSetup}
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
            onClick={onToggleDemoOrDismiss}
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
            onClick={onOpenInClusterSetup}
            className="hidden sm:flex ml-2 rounded-full"
          >
            <Plug className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden lg:inline">{t('layout.setupGuide')}</span>
            <span className="lg:hidden">{t('layout.setup')}</span>
          </Button>
          <button
            onClick={onOpenInClusterSetup}
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
              onClick={onToggleDemoMode}
              className="text-xs px-2 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded transition-colors whitespace-nowrap min-h-11 min-w-11"
            >
              <span className="hidden sm:inline">{t('layout.switchTo')} </span>
              {t('layout.demo')}
            </button>
            <button
              onClick={onDismissOffline}
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
