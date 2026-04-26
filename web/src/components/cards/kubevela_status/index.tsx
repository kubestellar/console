/**
 * KubeVela Status Card
 *
 * KubeVela is a CNCF Incubating project that implements the Open Application
 * Model (OAM) on Kubernetes. This card surfaces the running Application CRs,
 * workflow step progress, component + trait health, and controller pod
 * readiness — the primary operational signals from a KubeVela-managed
 * delivery platform.
 *
 * Follows the spiffe_status / dapr_status pattern for structure and styling.
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real KubeVela controller bridge lands (`/api/kubevela/status`), the hook's
 * fetcher will pick up live data automatically with no component changes.
 *
 * Source: kubestellar/console-marketplace#43
 */

import {
  AlertTriangle,
  Box,
  CheckCircle,
  Cpu,
  GitBranch,
  Layers,
  PauseCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedKubevela } from '../../../hooks/useCachedKubevela'
import type {
  KubeVelaApplication,
  KubeVelaAppStatus,
  WorkflowStepPhase,
} from './demoData'
import { formatTimeAgo } from '../../../lib/formatters'
import { MINUTES_PER_HOUR } from '../../../lib/constants/time'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const SKELETON_TITLE_WIDTH = 140
const SKELETON_TITLE_HEIGHT = 28
const SKELETON_BADGE_WIDTH = 90
const SKELETON_BADGE_HEIGHT = 20
const SKELETON_LIST_ITEMS = 4

const PERCENT_FULL = 100
const PROGRESS_BAR_WIDTH_PX = 56
const PROGRESS_BAR_HEIGHT_PX = 4

const MAX_APPS_DISPLAYED = 5
const AGE_MINUTES_HOUR_THRESHOLD = 60
const AGE_MINUTES_DAY_THRESHOLD = 1440

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAge(ageMinutes: number): string {
  if (ageMinutes < AGE_MINUTES_HOUR_THRESHOLD) return `${ageMinutes}m`
  if (ageMinutes < AGE_MINUTES_DAY_THRESHOLD) {
    return `${Math.floor(ageMinutes / MINUTES_PER_HOUR)}h`
  }
  return `${Math.floor(ageMinutes / AGE_MINUTES_DAY_THRESHOLD)}d`
}

type StatusColorClass = string

const APP_STATUS_COLOR: Record<KubeVelaAppStatus, StatusColorClass> = {
  running: 'text-green-400',
  workflowSuspending: 'text-yellow-400',
  workflowTerminated: 'text-muted-foreground',
  workflowFailed: 'text-red-400',
  unhealthy: 'text-red-400',
  deleting: 'text-muted-foreground',
}

const APP_STATUS_BG: Record<KubeVelaAppStatus, StatusColorClass> = {
  running: 'bg-green-500/20 text-green-400',
  workflowSuspending: 'bg-yellow-500/20 text-yellow-400',
  workflowTerminated: 'bg-muted/40 text-muted-foreground',
  workflowFailed: 'bg-red-500/20 text-red-400',
  unhealthy: 'bg-red-500/20 text-red-400',
  deleting: 'bg-muted/40 text-muted-foreground',
}

const WORKFLOW_PHASE_COLOR: Record<WorkflowStepPhase, StatusColorClass> = {
  succeeded: 'bg-green-500',
  running: 'bg-blue-500',
  pending: 'bg-muted',
  failed: 'bg-red-500',
  skipped: 'bg-muted',
  suspending: 'bg-yellow-500',
}

function appStatusIcon(status: KubeVelaAppStatus) {
  if (status === 'running') {
    return <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
  }
  if (status === 'workflowSuspending') {
    return <PauseCircle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
  }
  if (status === 'workflowFailed' || status === 'unhealthy') {
    return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
  }
  if (status === 'deleting') {
    return <RefreshCw className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
  }
  return <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
}

function appStatusLabel(
  t: TFunction<'cards'>,
  status: KubeVelaAppStatus,
): string {
  const labels: Record<KubeVelaAppStatus, string> = {
    running: t('kubeVela.statusRunning', 'Running'),
    workflowSuspending: t('kubeVela.statusSuspended', 'Suspended'),
    workflowTerminated: t('kubeVela.statusTerminated', 'Terminated'),
    workflowFailed: t('kubeVela.statusFailed', 'Failed'),
    unhealthy: t('kubeVela.statusUnhealthy', 'Unhealthy'),
    deleting: t('kubeVela.statusDeleting', 'Deleting'),
  }
  return labels[status]
}

// ---------------------------------------------------------------------------
// Subsections
// ---------------------------------------------------------------------------

function WorkflowProgress({
  completed,
  total,
  status,
}: {
  completed: number
  total: number
  status: KubeVelaAppStatus
}) {
  if (total === 0) return null
  const pct = Math.round((completed / total) * PERCENT_FULL)
  const fillClass =
    status === 'workflowFailed' || status === 'unhealthy'
      ? WORKFLOW_PHASE_COLOR.failed
      : status === 'workflowSuspending'
        ? WORKFLOW_PHASE_COLOR.suspending
        : pct === PERCENT_FULL
          ? WORKFLOW_PHASE_COLOR.succeeded
          : WORKFLOW_PHASE_COLOR.running

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div
        className="rounded-full bg-muted overflow-hidden"
        style={{
          width: `${PROGRESS_BAR_WIDTH_PX}px`,
          height: `${PROGRESS_BAR_HEIGHT_PX}px`,
        }}
      >
        <div
          className={`h-full rounded-full ${fillClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {completed}/{total}
      </span>
    </div>
  )
}

function ApplicationRow({
  app,
  t,
}: {
  app: KubeVelaApplication
  t: TFunction<'cards'>
}) {
  const currentStep = app.workflowSteps.find(
    s =>
      s.phase === 'failed' ||
      s.phase === 'suspending' ||
      s.phase === 'running' ||
      s.phase === 'pending',
  )
  const traitsSummary = (app.traits ?? []).map(tr => tr.type).join(', ')

  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          {appStatusIcon(app.status)}
          <span className="text-xs font-medium text-foreground truncate">
            {app.name}
          </span>
          <span className="text-[11px] text-muted-foreground truncate">
            {app.namespace}
          </span>
        </div>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${APP_STATUS_BG[app.status]}`}
        >
          {appStatusLabel(t, app.status)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground min-w-0">
          <span className="shrink-0">
            <Cpu className="inline w-3 h-3 mr-0.5 text-blue-400" />
            {app.componentCount}{' '}
            {t('kubeVela.componentsShort', 'components')}
          </span>
          <span className="shrink-0">
            <GitBranch className="inline w-3 h-3 mr-0.5 text-purple-400" />
            {app.traitCount} {t('kubeVela.traitsShort', 'traits')}
          </span>
          <span className="ml-auto shrink-0 font-mono">
            {formatAge(app.ageMinutes)}
          </span>
        </div>
        <WorkflowProgress
          completed={app.workflowStepsCompleted}
          total={app.workflowStepsTotal}
          status={app.status}
        />
      </div>

      {traitsSummary && (
        <div className="text-[11px] text-muted-foreground/80 truncate">
          {t('kubeVela.traits', 'Traits')}: {traitsSummary}
        </div>
      )}

      {currentStep && currentStep.phase !== 'succeeded' && (
        <div className="text-[11px] text-muted-foreground truncate">
          <span className={APP_STATUS_COLOR[app.status]}>
            {t('kubeVela.currentStep', 'Step')}:
          </span>{' '}
          <span className="font-mono">{currentStep.name}</span>
          {currentStep.message && (
            <span className="text-red-400/80"> — {currentStep.message}</span>
          )}
        </div>
      )}

      {app.message && !currentStep?.message && (
        <div className="text-[11px] text-red-400/80 truncate">{app.message}</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function KubeVelaStatus() {
  const { t } = useTranslation('cards')
  const { data, isRefreshing, error, showSkeleton, showEmptyState } =
    useCachedKubevela()

  const applications = data.applications ?? []
  const displayedApps = applications.slice(0, MAX_APPS_DISPLAYED)
  const isHealthy = data.health === 'healthy'

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex items-center justify-between">
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
        <SkeletonStats className="grid-cols-4" />
        <SkeletonList items={SKELETON_LIST_ITEMS} className="flex-1" />
      </div>
    )
  }

  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">
          {t('kubeVela.fetchError', 'Failed to fetch KubeVela status')}
        </p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Layers className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('kubeVela.notInstalled', 'KubeVela not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'kubeVela.notInstalledHint',
            'No KubeVela controller pods found. Deploy KubeVela to manage application delivery.',
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* Header — health pill + freshness */}
      <div className="flex items-center justify-between gap-2">
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
            ? t('kubeVela.healthy', 'Healthy')
            : t('kubeVela.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw
            className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`}
          />
          <span>{formatTimeAgo(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('kubeVela.apps', 'Apps')}
          value={`${data.summary.runningApplications}/${data.summary.totalApplications}`}
          colorClass={
            data.summary.failedApplications > 0
              ? 'text-yellow-400'
              : 'text-green-400'
          }
          icon={<Box className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('kubeVela.components', 'Components')}
          value={`${data.stats.totalComponents}`}
          colorClass="text-blue-400"
          icon={<Cpu className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('kubeVela.traits', 'Traits')}
          value={`${data.stats.totalTraits}`}
          colorClass="text-purple-400"
          icon={<GitBranch className="w-4 h-4 text-purple-400" />}
        />
        <MetricTile
          label={t('kubeVela.controllers', 'Controllers')}
          value={`${data.summary.runningControllerPods}/${data.summary.totalControllerPods}`}
          colorClass={
            data.summary.runningControllerPods ===
            data.summary.totalControllerPods
              ? 'text-green-400'
              : 'text-yellow-400'
          }
          icon={<Layers className="w-4 h-4 text-cyan-400" />}
        />
      </div>

      {/* Application list */}
      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-green-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('kubeVela.applications', 'Applications')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {applications.length}
            </span>
          </div>

          {applications.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('kubeVela.noApplications', 'No Application CRs found')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(displayedApps ?? []).map(app => (
                <ApplicationRow
                  key={`${app.cluster}:${app.namespace}/${app.name}`}
                  app={app}
                  t={t}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default KubeVelaStatus
