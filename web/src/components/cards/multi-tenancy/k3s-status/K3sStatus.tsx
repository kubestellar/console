/**
 * K3s Status Card
 *
 * Displays K3s lightweight Kubernetes pod health, server/agent details,
 * and version information. When K3s is not detected, offers an AI-assisted
 * installation mission.
 */

import { useState } from 'react'
import { AlertTriangle, Box, CheckCircle, RefreshCw, Server, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../../ui/Skeleton'
import { MetricTile } from '../../../../lib/cards/CardComponents'
import { useMissions } from '../../../../hooks/useMissions'
import { useApiKeyCheck, ApiKeyPromptModal } from '../../console-missions/shared'
import { useK3sStatus } from './useK3sStatus'
import { K3S_INSTALL_PROMPT } from '../shared'
import { loadMissionPrompt } from '../missionLoader'
import { K3sDetailModal } from './K3sDetailModal'

// ============================================================================
// Constants
// ============================================================================

/** Number of skeleton metric tiles during loading */
const SKELETON_METRIC_TILES = 3

/** Number of skeleton pod rows during loading */
const SKELETON_POD_ROWS = 3

// ============================================================================
// Relative time formatting
// ============================================================================

function useFormatRelativeTime() {
  const { t } = useTranslation('cards')
  return (isoString: string): string => {
    const diff = Date.now() - new Date(isoString).getTime()
    if (isNaN(diff) || diff < 0) return t('k3sStatus.syncedJustNow')

    /** Milliseconds in one minute */
    const MINUTE_MS = 60_000
    /** Milliseconds in one hour */
    const HOUR_MS = 60 * MINUTE_MS
    /** Milliseconds in one day */
    const DAY_MS = 24 * HOUR_MS

    if (diff < MINUTE_MS) return t('k3sStatus.syncedJustNow')
    if (diff < HOUR_MS) return t('k3sStatus.syncedMinutesAgo', { count: Math.floor(diff / MINUTE_MS) })
    if (diff < DAY_MS) return t('k3sStatus.syncedHoursAgo', { count: Math.floor(diff / HOUR_MS) })
    return t('k3sStatus.syncedDaysAgo', { count: Math.floor(diff / DAY_MS) })
  }
}

// ============================================================================
// Component
// ============================================================================

export function K3sStatus() {
  const { t } = useTranslation('cards')
  const formatRelativeTime = useFormatRelativeTime()
  const { data, error, showSkeleton, showEmptyState, isRefreshing } = useK3sStatus()
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
        {Array.from({ length: SKELETON_POD_ROWS }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={36} />
        ))}
      </div>
    )
  }

  // ------ Error ------
  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">{t('k3sStatus.fetchError')}</p>
      </div>
    )
  }

  // ------ Not Installed ------
  if (!data.detected || data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-3 relative">
        <Box className="w-8 h-8 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t('k3sStatus.notDetected')}</p>
        <p className="text-xs text-center max-w-xs">{t('k3sStatus.notDetectedHint')}</p>
        <button
          onClick={() =>
            checkKeyAndRun(async () => {
              const prompt = await loadMissionPrompt('k3s', K3S_INSTALL_PROMPT)
              startMission({
                title: 'Deploy K3s Clusters',
                description: 'Deploy K3s lightweight Kubernetes for multi-tenant control planes',
                type: 'deploy',
                initialPrompt: prompt,
              })
            })
          }
          className="mt-1 px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/30 transition-colors"
        >
          {t('k3sStatus.installWithAgent')}
        </button>
        <ApiKeyPromptModal isOpen={showKeyPrompt} onDismiss={dismissPrompt} onGoToSettings={goToSettings} />
      </div>
    )
  }

  // ------ Detected ------
  const isHealthy = data.health === 'healthy'
  const serverPods = data.serverPods || []

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
          {isHealthy ? t('k3sStatus.healthy') : t('k3sStatus.degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatRelativeTime(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Top metrics */}
      <div className="flex gap-3 cursor-pointer hover:bg-secondary/50 transition-colors rounded-lg" onClick={() => setIsDetailModalOpen(true)}>
        <MetricTile
          label={t('k3sStatus.totalPods')}
          value={data.podCount}
          colorClass="text-blue-400"
          icon={<Box className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('k3sStatus.healthyPods')}
          value={data.healthyPods}
          colorClass="text-green-400"
          icon={<CheckCircle className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('k3sStatus.serverPods')}
          value={serverPods.length}
          colorClass="text-purple-400"
          icon={<Server className="w-4 h-4 text-purple-400" />}
        />
      </div>

      {/* Server pods list */}
      {serverPods.length > 0 && (
        <div className="flex-1 flex flex-col gap-2 pt-2 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground">{t('k3sStatus.serverPodList')}</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin">
            {serverPods.map((pod) => (
              <div key={pod.name} className="flex items-center justify-between text-xs gap-2 px-2 py-1.5 rounded bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition-colors" onClick={() => setIsDetailModalOpen(true)}>
                <span className="text-foreground truncate flex-1" title={pod.name}>
                  {pod.name}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground text-[10px]">
                    {pod.version}
                  </span>
                  {pod.status === 'running' ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unhealthy warning */}
      {data.unhealthyPods > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
          <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
          <p className="text-xs text-orange-400">
            {t('k3sStatus.unhealthyWarning', { count: data.unhealthyPods })}
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground mt-auto">
        <a
          href="https://k3s.io"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-blue-400 transition-colors"
        >
          {t('k3sStatus.openDocs')}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>

      <K3sDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        data={data}
      />
    </div>
  )
}
