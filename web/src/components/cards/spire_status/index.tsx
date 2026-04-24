/**
 * SPIRE (SPIFFE Runtime Environment) Status Card
 *
 * Displays SPIRE workload identity plane health — server pod readiness,
 * agent DaemonSet coverage, attested agent count, registration entry
 * count, and trust bundle age. Follows the tuf_status / linkerd_status
 * pattern for structure and styling.
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real SPIRE bridge lands (backed by the SPIRE server admin API), the
 * hook's fetcher will pick up live data automatically with no component
 * changes.
 */

import {
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Server,
  ShieldCheck,
  ShieldOff,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedSpire } from '../../../hooks/useCachedSpire'
import { useCardLoadingState } from '../CardDataContext'
import { cn } from '../../../lib/cn'
import type { SpirePodPhase, SpireServerPod } from '../../../lib/demo/spire'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const SKELETON_TITLE_WIDTH = 140
const SKELETON_TITLE_HEIGHT = 28
const SKELETON_BADGE_WIDTH = 90
const SKELETON_BADGE_HEIGHT = 20
const SKELETON_LIST_ITEMS = 3

// Trust bundle age thresholds — these mirror typical SPIRE rotation cadence.
// A healthy rotation is under 24h; over 48h signals the rotation pipeline
// is stalled.
const TRUST_BUNDLE_AGE_WARN_HOURS = 24
const TRUST_BUNDLE_AGE_ALERT_HOURS = 48

// How many server pod rows to show inline — SPIRE is typically deployed
// as a HA StatefulSet of 1-3 replicas, so 4 rows covers the common case
// and keeps the card compact.
const MAX_SERVER_POD_ROWS = 4

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function phaseBadgeClass(phase: SpirePodPhase, ready: boolean): string {
  if (phase === 'Running' && ready) return 'bg-green-500/20 text-green-400'
  if (phase === 'Running' && !ready) return 'bg-yellow-500/20 text-yellow-400'
  if (phase === 'Pending') return 'bg-yellow-500/20 text-yellow-400'
  if (phase === 'Failed') return 'bg-red-500/20 text-red-400'
  if (phase === 'Succeeded') return 'bg-blue-500/20 text-blue-400'
  return 'bg-secondary/40 text-muted-foreground'
}

function trustBundleColor(hours: number): string {
  if (hours >= TRUST_BUNDLE_AGE_ALERT_HOURS) return 'text-red-400'
  if (hours >= TRUST_BUNDLE_AGE_WARN_HOURS) return 'text-yellow-400'
  return 'text-green-400'
}

function ServerPodRow({
  pod,
  phaseLabel,
}: {
  pod: SpireServerPod
  phaseLabel: string
}) {
  const isHealthy = pod.ready && pod.phase === 'Running'
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          {isHealthy ? (
            <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
          )}
          <span className="text-xs font-medium font-mono truncate">{pod.name}</span>
        </div>
        <span
          className={cn(
            'text-[11px] px-1.5 py-0.5 rounded-full shrink-0',
            phaseBadgeClass(pod.phase, pod.ready),
          )}
        >
          {phaseLabel}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="truncate">{pod.node}</span>
        {pod.restarts > 0 ? (
          <span className="text-yellow-400 shrink-0">
            {pod.restarts}×
          </span>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SpireStatus() {
  const { t } = useTranslation('cards')
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  } = useCachedSpire()

  // Rule: never show demo data while still loading
  const isDemoData = isDemoFallback && !isLoading

  // 'not-installed' counts as "we have data" so the card isn't stuck in skeleton
  const hasAnyData =
    data.health === 'not-installed' ? true : data.serverPods.length > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    isDemoData,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  })

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex items-center justify-between">
          <Skeleton variant="rounded" width={SKELETON_TITLE_WIDTH} height={SKELETON_TITLE_HEIGHT} />
          <Skeleton variant="rounded" width={SKELETON_BADGE_WIDTH} height={SKELETON_BADGE_HEIGHT} />
        </div>
        <SkeletonStats className="grid-cols-4" />
        <SkeletonList items={SKELETON_LIST_ITEMS} className="flex-1" />
      </div>
    )
  }

  if (showEmptyState || (data.health === 'not-installed' && !isDemoData)) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <ShieldOff className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('spireStatus.notInstalled', 'SPIRE not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'spireStatus.notInstalledHint',
            'No SPIRE server pods reachable. Deploy SPIRE (server + agent DaemonSet) to monitor workload identity issuance across the fleet.',
          )}
        </p>
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'
  const serverPods = data.serverPods ?? []
  const agent = data.agentDaemonSet

  const phaseLabels: Record<SpirePodPhase, string> = {
    Running: t('spireStatus.phaseRunning', 'Running'),
    Pending: t('spireStatus.phasePending', 'Pending'),
    Failed: t('spireStatus.phaseFailed', 'Failed'),
    Succeeded: t('spireStatus.phaseSucceeded', 'Succeeded'),
    Unknown: t('spireStatus.phaseUnknown', 'Unknown'),
  }

  const trustBundleAge = data.summary.trustBundleAgeHours

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* Header — health pill + trust domain */}
      <div className="flex items-center justify-between gap-2">
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
            isHealthy
              ? 'bg-green-500/15 text-green-400'
              : 'bg-yellow-500/15 text-yellow-400',
          )}
        >
          {isHealthy ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {isHealthy
            ? t('spireStatus.healthy', 'Healthy')
            : t('spireStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={cn('w-3 h-3', isRefreshing ? 'animate-spin' : '')} />
          <span>
            {t('spireStatus.version', 'version')}:{' '}
            <span className="text-foreground font-mono">{data.version}</span>
          </span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('spireStatus.serverReplicas', 'Server')}
          value={`${data.summary.serverReadyReplicas}/${data.summary.serverDesiredReplicas}`}
          colorClass={
            data.summary.serverReadyReplicas === data.summary.serverDesiredReplicas
              ? 'text-green-400'
              : 'text-yellow-400'
          }
          icon={<Server className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('spireStatus.attestedAgents', 'Agents')}
          value={data.summary.attestedAgents}
          colorClass="text-cyan-400"
          icon={<Users className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('spireStatus.registrationEntries', 'Entries')}
          value={data.summary.registrationEntries}
          colorClass="text-cyan-400"
          icon={<ShieldCheck className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('spireStatus.trustBundleAge', 'Bundle age')}
          value={`${trustBundleAge}h`}
          colorClass={trustBundleColor(trustBundleAge)}
          icon={<Clock className={cn('w-4 h-4', trustBundleColor(trustBundleAge))} />}
        />
      </div>

      {/* Server pods + agent DS detail */}
      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('spireStatus.sectionServer', 'SPIRE Server')}
            </h4>
            {data.trustDomain ? (
              <span className="text-[11px] text-muted-foreground ml-auto truncate max-w-[50%] font-mono">
                {data.trustDomain}
              </span>
            ) : null}
          </div>

          {serverPods.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('spireStatus.noServerPods', 'No SPIRE server pods reporting.')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(serverPods ?? [])
                .slice(0, MAX_SERVER_POD_ROWS)
                .map(pod => (
                  <ServerPodRow
                    key={pod.name}
                    pod={pod}
                    phaseLabel={phaseLabels[pod.phase] ?? pod.phase}
                  />
                ))}
            </div>
          )}
        </section>

        {agent ? (
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('spireStatus.sectionAgent', 'Agent DaemonSet')}
              </h4>
            </div>
            <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium font-mono truncate">
                  {agent.namespace}/{agent.name}
                </span>
                <span
                  className={cn(
                    'text-[11px] px-1.5 py-0.5 rounded-full shrink-0',
                    agent.numberReady === agent.desiredNumberScheduled &&
                      agent.numberMisscheduled === 0
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-yellow-500/20 text-yellow-400',
                  )}
                >
                  {agent.numberReady}/{agent.desiredNumberScheduled}{' '}
                  {t('spireStatus.nodes', 'nodes')}
                </span>
              </div>
              {agent.numberMisscheduled > 0 ? (
                <div className="text-[11px] text-yellow-400">
                  {t('spireStatus.misscheduled', '{{count}} misscheduled', {
                    count: agent.numberMisscheduled,
                  })}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}

export default SpireStatus
