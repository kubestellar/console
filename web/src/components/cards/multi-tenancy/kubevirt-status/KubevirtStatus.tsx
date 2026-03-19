/**
 * KubeVirt Status Card
 *
 * Displays KubeVirt operator health, VM count by state, and tenant
 * distribution. When KubeVirt is not detected, offers an AI-assisted
 * installation mission.
 */

import { useState } from 'react'
import { AlertTriangle, CheckCircle, Monitor, RefreshCw, Server, Users, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../../ui/Skeleton'
import { MetricTile } from '../../../../lib/cards/CardComponents'
import { useMissions } from '../../../../hooks/useMissions'
import { useApiKeyCheck, ApiKeyPromptModal } from '../../console-missions/shared'
import { useKubevirtStatus } from './useKubevirtStatus'
import { KUBEVIRT_INSTALL_PROMPT } from '../shared'
import { loadMissionPrompt } from '../missionLoader'
import { KubevirtDetailModal } from './KubevirtDetailModal'

// ============================================================================
// Constants
// ============================================================================

/** Number of skeleton metric tiles during loading */
const SKELETON_METRIC_TILES = 3

/** Number of skeleton VM rows during loading */
const SKELETON_VM_ROWS = 3

// ============================================================================
// Relative time formatting
// ============================================================================

function useFormatRelativeTime() {
  const { t } = useTranslation('cards')
  return (isoString: string): string => {
    const diff = Date.now() - new Date(isoString).getTime()
    if (isNaN(diff) || diff < 0) return t('kubevirtStatus.syncedJustNow')

    /** Milliseconds in one minute */
    const MINUTE_MS = 60_000
    /** Milliseconds in one hour */
    const HOUR_MS = 60 * MINUTE_MS
    /** Milliseconds in one day */
    const DAY_MS = 24 * HOUR_MS

    if (diff < MINUTE_MS) return t('kubevirtStatus.syncedJustNow')
    if (diff < HOUR_MS) return t('kubevirtStatus.syncedMinutesAgo', { count: Math.floor(diff / MINUTE_MS) })
    if (diff < DAY_MS) return t('kubevirtStatus.syncedHoursAgo', { count: Math.floor(diff / HOUR_MS) })
    return t('kubevirtStatus.syncedDaysAgo', { count: Math.floor(diff / DAY_MS) })
  }
}

// ============================================================================
// VM state badge helper
// ============================================================================

/** Map VM state to display color class */
function vmStateColorClass(state: string): string {
  switch (state) {
    case 'running': return 'text-green-400 bg-green-500/15'
    case 'stopped': return 'text-zinc-400 bg-zinc-500/15'
    case 'migrating': return 'text-blue-400 bg-blue-500/15'
    case 'pending': return 'text-yellow-400 bg-yellow-500/15'
    case 'failed': return 'text-red-400 bg-red-500/15'
    default: return 'text-muted-foreground bg-secondary'
  }
}

// ============================================================================
// Component
// ============================================================================

export function KubevirtStatus() {
  const { t } = useTranslation('cards')
  const formatRelativeTime = useFormatRelativeTime()
  const { data, error, showSkeleton, showEmptyState, isRefreshing, isDemoData } = useKubevirtStatus()
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
        <div className="flex gap-2">
          <Skeleton variant="rounded" height={80} className="flex-1" />
          <Skeleton variant="rounded" height={80} className="flex-1" />
        </div>
        <Skeleton variant="rounded" height={20} />
        {Array.from({ length: SKELETON_VM_ROWS }).map((_, i) => (
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
        <p className="text-sm text-red-400">{t('kubevirtStatus.fetchError')}</p>
      </div>
    )
  }

  // ------ Not Installed ------
  if (!data.detected || data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-3 relative">
        <Monitor className="w-8 h-8 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t('kubevirtStatus.notDetected')}</p>
        <p className="text-xs text-center max-w-xs">{t('kubevirtStatus.notDetectedHint')}</p>
        <button
          onClick={() =>
            checkKeyAndRun(async () => {
              const prompt = await loadMissionPrompt('kubevirt', KUBEVIRT_INSTALL_PROMPT)
              startMission({
                title: 'Install KubeVirt',
                description: 'Install KubeVirt for VM-based data-plane tenant isolation',
                type: 'deploy',
                initialPrompt: prompt,
              })
            })
          }
          className="mt-1 px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/30 transition-colors"
        >
          {t('kubevirtStatus.installWithAgent')}
        </button>
        <ApiKeyPromptModal isOpen={showKeyPrompt} onDismiss={dismissPrompt} onGoToSettings={goToSettings} />
      </div>
    )
  }

  // ------ Detected ------
  const isHealthy = data.health === 'healthy'
  const vms = data.vms || []
  const runningVMs = vms.filter((vm) => vm.state === 'running').length
  const stoppedVMs = vms.filter((vm) => vm.state === 'stopped').length
  const migratingVMs = vms.filter((vm) => vm.state === 'migrating').length

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4">
      {/* Health badge + last check */}
      <div className="flex items-center justify-between">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsDetailModalOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsDetailModalOpen(true) } }}
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
          {isHealthy ? t('kubevirtStatus.healthy') : t('kubevirtStatus.degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatRelativeTime(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Top metrics: infra pods */}
      <div className="flex gap-3 cursor-pointer hover:bg-secondary/50 transition-colors rounded-lg" role="button" tabIndex={0} onClick={() => setIsDetailModalOpen(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsDetailModalOpen(true) } }}>
        <MetricTile
          label={t('kubevirtStatus.infraPods')}
          value={data.podCount}
          colorClass="text-blue-400"
          icon={<Server className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('kubevirtStatus.totalVMs')}
          value={vms.length}
          colorClass="text-purple-400"
          icon={<Monitor className="w-4 h-4 text-purple-400" />}
        />
        <MetricTile
          label={t('kubevirtStatus.tenants')}
          value={data.tenantCount}
          colorClass="text-cyan-400"
          icon={<Users className="w-4 h-4 text-cyan-400" />}
        />
      </div>

      {/* Bottom metrics: VM state breakdown */}
      <div className="flex gap-3 cursor-pointer hover:bg-secondary/50 transition-colors rounded-lg" role="button" tabIndex={0} onClick={() => setIsDetailModalOpen(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsDetailModalOpen(true) } }}>
        <MetricTile
          label={t('kubevirtStatus.runningVMs')}
          value={runningVMs}
          colorClass="text-green-400"
          icon={<CheckCircle className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('kubevirtStatus.stoppedVMs')}
          value={stoppedVMs}
          colorClass={stoppedVMs > 0 ? 'text-zinc-400' : 'text-muted-foreground'}
          icon={<XCircle className="w-4 h-4 text-zinc-400" />}
        />
        {migratingVMs > 0 && (
          <MetricTile
            label={t('kubevirtStatus.migratingVMs')}
            value={migratingVMs}
            colorClass="text-blue-400"
            icon={<RefreshCw className="w-4 h-4 text-blue-400" />}
          />
        )}
      </div>

      {/* VM list */}
      {vms.length > 0 && (
        <div className="flex-1 flex flex-col gap-2 pt-2 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground">{t('kubevirtStatus.vmList')}</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin">
            {vms.map((vm) => (
              <div key={`${vm.namespace}/${vm.name}`} className="flex items-center justify-between text-xs gap-2 px-2 py-1.5 rounded bg-secondary/30 cursor-pointer hover:bg-secondary/50 transition-colors" role="button" tabIndex={0} onClick={() => setIsDetailModalOpen(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsDetailModalOpen(true) } }}>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-foreground truncate" title={vm.name}>
                    {vm.name}
                  </span>
                  <span className="text-muted-foreground/70 text-[10px] truncate" title={vm.namespace}>
                    {vm.namespace}
                  </span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${vmStateColorClass(vm.state)}`}>
                  {vm.state}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unhealthy infra warning */}
      {data.unhealthyPods > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
          <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
          <p className="text-xs text-orange-400">
            {t('kubevirtStatus.unhealthyWarning', { count: data.unhealthyPods })}
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground mt-auto">
        <a
          href="https://kubevirt.io"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-blue-400 transition-colors"
        >
          {t('kubevirtStatus.openDocs')}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>

      <KubevirtDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        data={data}
        isDemoData={isDemoData}
      />
    </div>
  )
}
