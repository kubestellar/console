import { AlertTriangle, CheckCircle, PauseCircle, RefreshCw, XCircle } from 'lucide-react'
import type { TFunction } from 'i18next'
import type { KubeVelaAppStatus, WorkflowStepPhase } from './demoData'
import { MINUTES_PER_HOUR } from '../../../lib/constants/time'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

export const SKELETON_TITLE_WIDTH = 140
export const SKELETON_TITLE_HEIGHT = 28
export const SKELETON_BADGE_WIDTH = 90
export const SKELETON_BADGE_HEIGHT = 20
export const SKELETON_LIST_ITEMS = 4

export const PERCENT_FULL = 100
export const PROGRESS_BAR_WIDTH_PX = 56
export const PROGRESS_BAR_HEIGHT_PX = 4

export const MAX_APPS_DISPLAYED = 5
export const AGE_MINUTES_HOUR_THRESHOLD = 60
export const AGE_MINUTES_DAY_THRESHOLD = 1440

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatAge(ageMinutes: number): string {
  if (ageMinutes < AGE_MINUTES_HOUR_THRESHOLD) return `${ageMinutes}m`
  if (ageMinutes < AGE_MINUTES_DAY_THRESHOLD) {
    return `${Math.floor(ageMinutes / MINUTES_PER_HOUR)}h`
  }
  return `${Math.floor(ageMinutes / AGE_MINUTES_DAY_THRESHOLD)}d`
}

export type StatusColorClass = string

export const APP_STATUS_COLOR: Record<KubeVelaAppStatus, StatusColorClass> = {
  running: 'text-status-success',
  workflowSuspending: 'text-status-warning',
  workflowTerminated: 'text-muted-foreground',
  workflowFailed: 'text-status-error',
  unhealthy: 'text-status-error',
  deleting: 'text-muted-foreground',
}

export const APP_STATUS_BG: Record<KubeVelaAppStatus, StatusColorClass> = {
  running: 'bg-green-500/20 text-status-success',
  workflowSuspending: 'bg-yellow-500/20 text-status-warning',
  workflowTerminated: 'bg-muted/40 text-muted-foreground',
  workflowFailed: 'bg-red-500/20 text-status-error',
  unhealthy: 'bg-red-500/20 text-status-error',
  deleting: 'bg-muted/40 text-muted-foreground',
}

export const WORKFLOW_PHASE_COLOR: Record<WorkflowStepPhase, StatusColorClass> = {
  succeeded: 'bg-green-500',
  running: 'bg-blue-500',
  pending: 'bg-muted',
  failed: 'bg-red-500',
  skipped: 'bg-muted',
  suspending: 'bg-yellow-500',
}

export function appStatusIcon(status: KubeVelaAppStatus) {
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

export function appStatusLabel(
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
