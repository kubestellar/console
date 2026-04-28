/**
 * Volcano Status Card
 *
 * Volcano is a CNCF Incubating batch/HPC scheduler for Kubernetes that
 * extends the default scheduler with gang scheduling, fair-share queues,
 * preemption, and per-job resource accounting. It's the de-facto scheduler
 * for AI/ML training, HPC, and big-data workloads on Kubernetes.
 *
 * This card surfaces the operational signals a platform team needs to
 * monitor a Volcano deployment: queues (with capacity), job phase
 * distribution (pending / running / completed / failed), pod groups, and
 * aggregate GPU allocation.
 *
 * Follows the spiffe_status / linkerd_status / envoy_status pattern for
 * structure and styling.
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real Volcano bridge lands (`/api/volcano/status`), the hook's fetcher
 * will pick up live data automatically with no component changes.
 */

import {
  AlertTriangle,
  CheckCircle,
  Cpu,
  Layers,
  ListChecks,
  Package,
  RefreshCw,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedVolcano } from '../../../hooks/useCachedVolcano'
import type {
  QueueState,
  VolcanoJob,
  VolcanoJobPhase,
  VolcanoPodGroup,
  VolcanoQueue,
} from './demoData'
import { formatTimeAgo } from '../../../lib/formatters'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const SKELETON_TITLE_WIDTH = 140
const SKELETON_TITLE_HEIGHT = 28
const SKELETON_BADGE_WIDTH = 90
const SKELETON_BADGE_HEIGHT = 20
const SKELETON_LIST_ITEMS = 5

const MAX_QUEUES_DISPLAYED = 5
const MAX_JOBS_DISPLAYED = 5

const PERCENT_MAX = 100
const PERCENT_NEAR_FULL_THRESHOLD = 80

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const QUEUE_STATE_CLASS: Record<QueueState, string> = {
  Open: 'bg-green-500/20 text-green-400',
  Closing: 'bg-yellow-500/20 text-yellow-400',
  Closed: 'bg-red-500/20 text-red-400',
}

const JOB_PHASE_CLASS: Record<VolcanoJobPhase, string> = {
  Pending: 'bg-yellow-500/20 text-yellow-400',
  Running: 'bg-cyan-500/20 text-cyan-400',
  Completed: 'bg-green-500/20 text-green-400',
  Failed: 'bg-red-500/20 text-red-400',
  Aborted: 'bg-red-500/20 text-red-400',
}

function percentUsed(allocated: number, capability: number): number {
  if (capability <= 0) return 0
  const pct = (allocated / capability) * PERCENT_MAX
  return Math.min(Math.round(pct), PERCENT_MAX)
}

function usageBarClass(pct: number): string {
  if (pct >= PERCENT_NEAR_FULL_THRESHOLD) return 'bg-red-400'
  if (pct >= PERCENT_MAX / 2) return 'bg-yellow-400'
  return 'bg-cyan-400'
}

// ---------------------------------------------------------------------------
// Subsections
// ---------------------------------------------------------------------------

function QueueRow({ queue }: { queue: VolcanoQueue }) {
  const cpuPct = percentUsed(queue.allocatedCpu, queue.capabilityCpu)
  const gpuPct = percentUsed(queue.allocatedGpu, queue.capabilityGpu)

  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-xs font-medium text-foreground truncate font-mono">
            {queue.name}
          </span>
        </div>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${QUEUE_STATE_CLASS[queue.state]}`}
        >
          {queue.state}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span>
          {queue.runningJobs} run · {queue.pendingJobs} pend
        </span>
        <span className="ml-auto shrink-0 font-mono">weight {queue.weight}</span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-muted-foreground w-8 shrink-0">CPU</span>
          <div className="flex-1 h-1.5 rounded bg-secondary/50 overflow-hidden">
            <div
              className={`h-full ${usageBarClass(cpuPct)}`}
              style={{ width: `${cpuPct}%` }}
            />
          </div>
          <span className="font-mono text-muted-foreground shrink-0">
            {queue.allocatedCpu}/{queue.capabilityCpu}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-muted-foreground w-8 shrink-0">GPU</span>
          <div className="flex-1 h-1.5 rounded bg-secondary/50 overflow-hidden">
            <div
              className={`h-full ${usageBarClass(gpuPct)}`}
              style={{ width: `${gpuPct}%` }}
            />
          </div>
          <span className="font-mono text-muted-foreground shrink-0">
            {queue.allocatedGpu}/{queue.capabilityGpu}
          </span>
        </div>
      </div>
    </div>
  )
}

function JobRow({ job }: { job: VolcanoJob }) {
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-xs font-medium text-foreground truncate font-mono">
            {job.namespace}/{job.name}
          </span>
        </div>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${JOB_PHASE_CLASS[job.phase]}`}
        >
          {job.phase}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="truncate">
          queue {job.queue} · {job.runningPods}/{job.totalPods} pods
        </span>
        <span className="ml-auto shrink-0 font-mono">
          {job.gpuRequest > 0 ? `${job.gpuRequest} GPU` : 'CPU-only'}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function VolcanoStatus() {
  const { t } = useTranslation('cards')
  const { data, isRefreshing, error, showSkeleton, showEmptyState } =
    useCachedVolcano()

  const isHealthy = data.health === 'healthy'
  const queues = data.queues ?? []
  const jobs = data.jobs ?? []
  const podGroups: VolcanoPodGroup[] = data.podGroups ?? []
  const displayedQueues = queues.slice(0, MAX_QUEUES_DISPLAYED)
  const displayedJobs = jobs.slice(0, MAX_JOBS_DISPLAYED)

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <Skeleton
            variant="rounded"
            width={SKELETON_TITLE_WIDTH}
            height={SKELETON_TITLE_HEIGHT}
          />
          <Skeleton
            variant="rounded"
            width={SKELETON_BADGE_WIDTH}
            height={SKELETON_BADGE_HEIGHT}
          />
        </div>
        <SkeletonStats className="grid-cols-2 @md:grid-cols-4" />
        <SkeletonList items={SKELETON_LIST_ITEMS} className="flex-1" />
      </div>
    )
  }

  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">
          {t('volcanoStatus.fetchError', 'Unable to fetch Volcano status')}
        </p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Layers className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('volcanoStatus.notInstalled', 'Volcano scheduler not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'volcanoStatus.notInstalledHint',
            'No Volcano scheduler reachable from the connected clusters.',
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* Header — health pill + freshness */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            isHealthy
              ? 'bg-green-500/15 text-green-400'
              : 'bg-yellow-500/15 text-yellow-400'
          }`}
        >
          {isHealthy ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {isHealthy
            ? t('volcanoStatus.healthy', 'Healthy')
            : t('volcanoStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatTimeAgo(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('volcanoStatus.queues', 'Queues')}
          value={`${data.stats.totalQueues}`}
          colorClass="text-cyan-400"
          icon={<Layers className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('volcanoStatus.runningJobs', 'Running')}
          value={`${data.stats.runningJobs}`}
          colorClass="text-green-400"
          icon={<ListChecks className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('volcanoStatus.pendingJobs', 'Pending')}
          value={`${data.stats.pendingJobs}`}
          colorClass="text-yellow-400"
          icon={<ListChecks className="w-4 h-4 text-yellow-400" />}
        />
        <MetricTile
          label={t('volcanoStatus.allocatedGpu', 'GPUs')}
          value={`${data.stats.allocatedGpu}`}
          colorClass="text-purple-400"
          icon={<Cpu className="w-4 h-4 text-purple-400" />}
        />
      </div>

      {/* Scheduler info + lists */}
      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('volcanoStatus.sectionScheduler', 'Scheduler')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {t('volcanoStatus.version', 'version')}:{' '}
              <span className="text-foreground">{data.stats.schedulerVersion}</span>
            </span>
          </div>
          <div className="grid grid-cols-2 @sm:grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-md bg-secondary/30 px-2 py-1.5">
              <div className="text-muted-foreground">
                {t('volcanoStatus.podGroups', 'Pod groups')}
              </div>
              <div className="font-mono text-foreground">
                {data.stats.totalPodGroups}
              </div>
            </div>
            <div className="rounded-md bg-secondary/30 px-2 py-1.5">
              <div className="text-muted-foreground">
                {t('volcanoStatus.completedJobs', 'Completed')}
              </div>
              <div className="font-mono text-green-400">
                {data.stats.completedJobs}
              </div>
            </div>
            <div className="rounded-md bg-secondary/30 px-2 py-1.5">
              <div className="text-muted-foreground">
                {t('volcanoStatus.failedJobs', 'Failed')}
              </div>
              <div className="font-mono text-red-400">{data.stats.failedJobs}</div>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('volcanoStatus.sectionQueues', 'Queues')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {queues.length}
            </span>
          </div>

          {queues.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('volcanoStatus.noQueues', 'No queues configured')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(displayedQueues ?? []).map(queue => (
                <QueueRow key={`${queue.cluster}:${queue.name}`} queue={queue} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('volcanoStatus.sectionJobs', 'Recent jobs')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {jobs.length} · {podGroups.length} pg
            </span>
          </div>

          {jobs.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('volcanoStatus.noJobs', 'No Volcano jobs found')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(displayedJobs ?? []).map(job => (
                <JobRow
                  key={`${job.cluster}:${job.namespace}:${job.name}`}
                  job={job}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default VolcanoStatus
