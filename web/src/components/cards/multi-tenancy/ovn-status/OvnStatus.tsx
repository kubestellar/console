/**
 * OVN-Kubernetes Status Card
 *
 * Displays OVN infrastructure pod health, User Defined Network (UDN) inventory,
 * and network layer details. When OVN is not detected, offers an AI-assisted
 * installation mission.
 */

import { useState } from 'react'
import { AlertTriangle, CheckCircle, Network, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../../ui/Skeleton'
import { MetricTile } from '../../../../lib/cards/CardComponents'
import { useMissions } from '../../../../hooks/useMissions'
import { useApiKeyCheck, ApiKeyPromptModal } from '../../console-missions/shared'
import { useOvnStatus } from './useOvnStatus'
import { OVN_INSTALL_PROMPT } from '../shared'
import { loadMissionPrompt } from '../missionLoader'
import { OvnDetailModal } from './OvnDetailModal'

// ============================================================================
// Constants
// ============================================================================

/** Number of skeleton metric tiles to show during loading */
const SKELETON_METRIC_TILES = 3

/** Number of skeleton UDN rows to show during loading */
const SKELETON_UDN_ROWS = 2

// ============================================================================
// Relative time formatting
// ============================================================================

function useFormatRelativeTime() {
  const { t } = useTranslation('cards')
  return (isoString: string): string => {
    const diff = Date.now() - new Date(isoString).getTime()
    if (isNaN(diff) || diff < 0) return t('ovnStatus.syncedJustNow')

    /** Milliseconds in one minute */
    const MINUTE_MS = 60_000
    /** Milliseconds in one hour */
    const HOUR_MS = 60 * MINUTE_MS
    /** Milliseconds in one day */
    const DAY_MS = 24 * HOUR_MS

    if (diff < MINUTE_MS) return t('ovnStatus.syncedJustNow')
    if (diff < HOUR_MS) return t('ovnStatus.syncedMinutesAgo', { count: Math.floor(diff / MINUTE_MS) })
    if (diff < DAY_MS) return t('ovnStatus.syncedHoursAgo', { count: Math.floor(diff / HOUR_MS) })
    return t('ovnStatus.syncedDaysAgo', { count: Math.floor(diff / DAY_MS) })
  }
}

// ============================================================================
// Component
// ============================================================================

export function OvnStatus() {
  const { t } = useTranslation('cards')
  const formatRelativeTime = useFormatRelativeTime()
  const { data, error, showSkeleton, showEmptyState, isRefreshing } = useOvnStatus()
  const { startMission } = useMissions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)

  // ------ Loading ------
  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-3">
        <Skeleton variant="rounded" height={36} />
        <div className="flex gap-2">
          {Array.from({ length: SKELETON_METRIC_TILES }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={80} className="flex-1" />
          ))}
        </div>
        <Skeleton variant="rounded" height={20} />
        {Array.from({ length: SKELETON_UDN_ROWS }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={40} />
        ))}
      </div>
    )
  }

  // ------ Error ------
  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">{t('ovnStatus.fetchError')}</p>
      </div>
    )
  }

  // ------ Not Installed ------
  if (!data.detected || data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-3 relative">
        <Network className="w-8 h-8 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t('ovnStatus.notDetected')}</p>
        <p className="text-xs text-center max-w-xs">{t('ovnStatus.notDetectedHint')}</p>
        <button
          onClick={() =>
            checkKeyAndRun(async () => {
              const prompt = await loadMissionPrompt('ovn', OVN_INSTALL_PROMPT)
              startMission({
                title: 'Install OVN-Kubernetes',
                description: 'Install OVN-Kubernetes with UDN support for tenant network isolation',
                type: 'deploy',
                initialPrompt: prompt,
              })
            })
          }
          className="mt-1 px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/30 transition-colors"
        >
          {t('ovnStatus.installWithAgent')}
        </button>
        <ApiKeyPromptModal isOpen={showKeyPrompt} onDismiss={dismissPrompt} onGoToSettings={goToSettings} />
      </div>
    )
  }

  // ------ Detected ------
  const isHealthy = data.health === 'healthy'
  const layer2Count = (data.udns || []).filter((u) => u.networkType === 'layer2').length
  const layer3Count = (data.udns || []).filter((u) => u.networkType === 'layer3').length

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4">
      {/* Health badge + last check */}
      <div className="flex items-center justify-between">
        <div
          onClick={() => setIsDetailModalOpen(true)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium cursor-pointer hover:bg-secondary/50 transition-colors ${
            isHealthy
              ? 'bg-green-500/15 text-green-400'
              : 'bg-orange-500/15 text-orange-400'
          }`}
        >
          {isHealthy ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {isHealthy ? t('ovnStatus.healthy') : t('ovnStatus.degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatRelativeTime(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Metric tiles */}
      <div className="flex gap-3 cursor-pointer hover:bg-secondary/50 transition-colors rounded-lg" onClick={() => setIsDetailModalOpen(true)}>
        <MetricTile
          label={t('ovnStatus.ovnPods')}
          value={data.podCount}
          colorClass="text-blue-400"
          icon={<Network className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('ovnStatus.healthyPods')}
          value={data.healthyPods}
          colorClass="text-green-400"
          icon={<Wifi className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('ovnStatus.unhealthyPods')}
          value={data.unhealthyPods}
          colorClass={data.unhealthyPods > 0 ? 'text-red-400' : 'text-muted-foreground'}
          icon={<WifiOff className="w-4 h-4 text-red-400" />}
        />
      </div>

      {/* UDN summary */}
      <div className="flex gap-3 cursor-pointer hover:bg-secondary/50 transition-colors rounded-lg" onClick={() => setIsDetailModalOpen(true)}>
        <MetricTile
          label={t('ovnStatus.udnCount')}
          value={(data.udns || []).length}
          colorClass="text-purple-400"
          icon={<Network className="w-4 h-4 text-purple-400" />}
        />
        <MetricTile
          label={t('ovnStatus.layer3Networks')}
          value={layer3Count}
          colorClass="text-cyan-400"
          icon={<Network className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('ovnStatus.layer2Networks')}
          value={layer2Count}
          colorClass="text-teal-400"
          icon={<Network className="w-4 h-4 text-teal-400" />}
        />
      </div>

      {/* UDN detail list */}
      {(data.udns || []).length > 0 && (
        <div className="flex-1 flex flex-col gap-2 pt-2 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground">{t('ovnStatus.udnList')}</p>
          <div className="space-y-1.5 max-h-32 overflow-y-auto scrollbar-thin">
            {(data.udns || []).map((udn) => (
              <div key={udn.name} className="flex items-center justify-between text-xs gap-2 cursor-pointer hover:bg-secondary/50 transition-colors rounded px-1 -mx-1" onClick={() => setIsDetailModalOpen(true)}>
                <span className="text-muted-foreground truncate flex-1" title={udn.name}>
                  {udn.name}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground text-[10px]">
                    {udn.networkType === 'layer2' ? 'L2' : udn.networkType === 'layer3' ? 'L3' : '?'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground text-[10px]">
                    {udn.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
        <a
          href="https://github.com/ovn-org/ovn-kubernetes"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-blue-400 transition-colors"
        >
          {t('ovnStatus.openDocs')}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>

      <OvnDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        data={data}
      />
    </div>
  )
}
