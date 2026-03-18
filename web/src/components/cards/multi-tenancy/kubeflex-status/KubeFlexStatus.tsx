/**
 * KubeFlex Status Card
 *
 * Displays KubeFlex controller health, per-tenant control plane status,
 * and tenant count. When KubeFlex is not detected, offers an AI-assisted
 * installation mission.
 */

import { useState } from 'react'
import { AlertTriangle, CheckCircle, Layers, RefreshCw, Server, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../../ui/Skeleton'
import { MetricTile } from '../../../../lib/cards/CardComponents'
import { useMissions } from '../../../../hooks/useMissions'
import { useApiKeyCheck, ApiKeyPromptModal } from '../../console-missions/shared'
import { useKubeFlexStatus } from './useKubeflexStatus'
import { KUBEFLEX_INSTALL_PROMPT } from '../shared'
import { loadMissionPrompt } from '../missionLoader'
import { KubeFlexDetailModal } from './KubeFlexDetailModal'

// ============================================================================
// Constants
// ============================================================================

/** Number of skeleton rows shown during loading */
const SKELETON_CP_ROWS = 3

// ============================================================================
// Relative time formatting
// ============================================================================

function useFormatRelativeTime() {
  const { t } = useTranslation('cards')
  return (isoString: string): string => {
    const diff = Date.now() - new Date(isoString).getTime()
    if (isNaN(diff) || diff < 0) return t('kubeFlexStatus.syncedJustNow')

    /** Milliseconds in one minute */
    const MINUTE_MS = 60_000
    /** Milliseconds in one hour */
    const HOUR_MS = 60 * MINUTE_MS
    /** Milliseconds in one day */
    const DAY_MS = 24 * HOUR_MS

    if (diff < MINUTE_MS) return t('kubeFlexStatus.syncedJustNow')
    if (diff < HOUR_MS) return t('kubeFlexStatus.syncedMinutesAgo', { count: Math.floor(diff / MINUTE_MS) })
    if (diff < DAY_MS) return t('kubeFlexStatus.syncedHoursAgo', { count: Math.floor(diff / HOUR_MS) })
    return t('kubeFlexStatus.syncedDaysAgo', { count: Math.floor(diff / DAY_MS) })
  }
}

// ============================================================================
// Component
// ============================================================================

export function KubeFlexStatus() {
  const { t } = useTranslation('cards')
  const formatRelativeTime = useFormatRelativeTime()
  const { data, error, showSkeleton, showEmptyState, isRefreshing } = useKubeFlexStatus()
  const { startMission } = useMissions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)

  // ------ Loading ------
  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-3">
        <Skeleton variant="rounded" height={36} />
        <div className="flex gap-2">
          <Skeleton variant="rounded" height={80} className="flex-1" />
          <Skeleton variant="rounded" height={80} className="flex-1" />
          <Skeleton variant="rounded" height={80} className="flex-1" />
        </div>
        <Skeleton variant="rounded" height={20} />
        {Array.from({ length: SKELETON_CP_ROWS }).map((_, i) => (
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
        <p className="text-sm text-red-400">{t('kubeFlexStatus.fetchError')}</p>
      </div>
    )
  }

  // ------ Not Installed ------
  if (!data.detected || data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-3 relative">
        <Layers className="w-8 h-8 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t('kubeFlexStatus.notDetected')}</p>
        <p className="text-xs text-center max-w-xs">{t('kubeFlexStatus.notDetectedHint')}</p>
        <button
          onClick={() =>
            checkKeyAndRun(async () => {
              const prompt = await loadMissionPrompt('kubeflex', KUBEFLEX_INSTALL_PROMPT)
              startMission({
                title: 'Install KubeFlex',
                description: 'Install KubeFlex for dedicated per-tenant control planes',
                type: 'deploy',
                initialPrompt: prompt,
              })
            })
          }
          className="mt-1 px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/30 transition-colors"
        >
          {t('kubeFlexStatus.installWithAgent')}
        </button>
        <ApiKeyPromptModal isOpen={showKeyPrompt} onDismiss={dismissPrompt} onGoToSettings={goToSettings} />
      </div>
    )
  }

  // ------ Detected ------
  const isHealthy = data.health === 'healthy'
  const healthyCPs = (data.controlPlanes || []).filter((cp) => cp.healthy).length
  const unhealthyCPs = (data.controlPlanes || []).length - healthyCPs

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
          {isHealthy ? t('kubeFlexStatus.healthy') : t('kubeFlexStatus.degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatRelativeTime(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Metric tiles */}
      <div className="flex gap-3 cursor-pointer hover:bg-secondary/50 transition-colors rounded-lg" onClick={() => setIsDetailModalOpen(true)}>
        <MetricTile
          label={t('kubeFlexStatus.controller')}
          value={data.controllerHealthy ? t('kubeFlexStatus.controllerUp') : t('kubeFlexStatus.controllerDown')}
          colorClass={data.controllerHealthy ? 'text-green-400' : 'text-red-400'}
          icon={<Server className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('kubeFlexStatus.controlPlanes')}
          value={(data.controlPlanes || []).length}
          colorClass="text-purple-400"
          icon={<Layers className="w-4 h-4 text-purple-400" />}
        />
        <MetricTile
          label={t('kubeFlexStatus.tenants')}
          value={data.tenantCount}
          colorClass="text-cyan-400"
          icon={<Layers className="w-4 h-4 text-cyan-400" />}
        />
      </div>

      {/* Control planes list */}
      {(data.controlPlanes || []).length > 0 && (
        <div className="flex-1 flex flex-col gap-2 pt-2 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground">{t('kubeFlexStatus.controlPlaneList')}</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin">
            {(data.controlPlanes || []).map((cp) => (
              <div key={cp.name} className="flex items-center justify-between text-xs gap-2 px-2 py-1.5 rounded bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition-colors" onClick={() => setIsDetailModalOpen(true)}>
                <span className="text-foreground truncate flex-1" title={cp.name}>
                  {cp.name}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {cp.healthy ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-green-400">{t('kubeFlexStatus.cpHealthy')}</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5 text-red-400" />
                      <span className="text-red-400">{t('kubeFlexStatus.cpUnhealthy')}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          {unhealthyCPs > 0 && (
            <p className="text-xs text-orange-400">
              {t('kubeFlexStatus.unhealthyCPWarning', { count: unhealthyCPs })}
            </p>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
        <a
          href="https://github.com/kubestellar/kubeflex"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-blue-400 transition-colors"
        >
          {t('kubeFlexStatus.openDocs')}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>

      <KubeFlexDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        data={data}
      />
    </div>
  )
}
