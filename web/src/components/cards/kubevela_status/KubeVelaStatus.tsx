import { CheckCircle, AlertTriangle, RefreshCw, Layers, Box, GitBranch, Cpu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../ui/Skeleton'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { useKubeVelaStatus } from './useKubeVelaStatus'
import type { KubeVelaApplication } from './demoData'

function useFormatRelativeTime() {
  const { t } = useTranslation('cards')
  return (isoString: string): string => {
    const diff = Date.now() - new Date(isoString).getTime()
    if (isNaN(diff) || diff < 0) return t('kubevela.syncedJustNow', 'just now')
    const minute = 60_000
    const hour = 60 * minute
    const day = 24 * hour
    if (diff < minute) return t('kubevela.syncedJustNow', 'just now')
    if (diff < hour) return t('kubevela.syncedMinutesAgo', '{{count}}m ago', { count: Math.floor(diff / minute) })
    if (diff < day) return t('kubevela.syncedHoursAgo', '{{count}}h ago', { count: Math.floor(diff / hour) })
    return t('kubevela.syncedDaysAgo', '{{count}}d ago', { count: Math.floor(diff / day) })
  }
}

function appStatusColor(status: KubeVelaApplication['status']): string {
  if (status === 'running') return 'text-green-400'
  if (status === 'workflowSuspending') return 'text-yellow-400'
  if (status === 'workflowFailed' || status === 'workflowTerminated' || status === 'unhealthy') return 'text-red-400'
  if (status === 'deleting') return 'text-muted-foreground'
  return 'text-muted-foreground'
}

function appStatusIcon(status: KubeVelaApplication['status']) {
  if (status === 'running') return <CheckCircle className="w-3.5 h-3.5 text-green-400" />
  if (status === 'workflowSuspending') return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
  if (status === 'deleting') return <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
  if (status === 'workflowTerminated') return <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
  return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
}

function useAppStatusLabel() {
  const { t } = useTranslation('cards')
  return (status: KubeVelaApplication['status']): string => {
    const labels: Record<KubeVelaApplication['status'], string> = {
      running: t('kubevela.statusRunning', 'Running'),
      workflowSuspending: t('kubevela.statusSuspended', 'Suspended'),
      workflowTerminated: t('kubevela.statusTerminated', 'Terminated'),
      workflowFailed: t('kubevela.statusFailed', 'Failed'),
      unhealthy: t('kubevela.statusUnhealthy', 'Unhealthy'),
      deleting: t('kubevela.statusDeleting', 'Deleting'),
    }
    return labels[status] ?? status
  }
}

function WorkflowProgress({ completed, total }: { completed: number; total: number }) {
  if (total === 0) return null
  const pct = Math.round((completed / total) * 100)
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{completed}/{total}</span>
    </div>
  )
}

export function KubeVelaStatus() {
  const { t } = useTranslation('cards')
  const formatRelativeTime = useFormatRelativeTime()
  const appStatusLabel = useAppStatusLabel()
  const { data, error, showSkeleton, showEmptyState, isRefreshing } = useKubeVelaStatus()

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
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={60} />
      </div>
    )
  }

  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">{t('kubevela.fetchError', 'Failed to fetch KubeVela status')}</p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Layers className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t('kubevela.notInstalled', 'KubeVela not detected')}</p>
        <p className="text-xs text-center max-w-xs">
          {t('kubevela.notInstalledHint', 'No KubeVela controller pods found. Install KubeVela to manage OAM applications.')}
        </p>
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'
  const healthColorClass = isHealthy
    ? 'bg-green-500/15 text-green-400'
    : 'bg-yellow-500/15 text-yellow-400'
  const healthLabel = isHealthy
    ? t('kubevela.healthy', 'Healthy')
    : t('kubevela.degraded', 'Degraded')

  const apps = data.apps ?? { total: 0, running: 0, failed: 0 }
  const totalComponents = data.totalComponents ?? 0
  const totalTraits = data.totalTraits ?? 0

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* Health badge + last check */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${healthColorClass}`}>
          {isHealthy ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {healthLabel}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {isRefreshing && <RefreshCw className="w-3 h-3 animate-spin" />}
          <span>{formatRelativeTime(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Key metrics */}
      <div className="flex gap-3">
        <MetricTile
          label={t('kubevela.apps', 'Apps')}
          value={`${apps.running}/${apps.total}`}
          colorClass={
            apps.failed > 0
              ? 'text-yellow-400'
              : apps.running === apps.total && apps.total > 0
                ? 'text-green-400'
                : 'text-muted-foreground'
          }
          icon={<Box className="w-3 h-3" />}
        />
        <MetricTile
          label={t('kubevela.components', 'Components')}
          value={totalComponents > 0 ? totalComponents.toString() : '—'}
          colorClass="text-blue-400"
          icon={<Cpu className="w-3 h-3" />}
        />
        <MetricTile
          label={t('kubevela.traits', 'Traits')}
          value={totalTraits > 0 ? totalTraits.toString() : '—'}
          colorClass="text-purple-400"
          icon={<GitBranch className="w-3 h-3" />}
        />
      </div>

      {/* Application list */}
      {(data.applications || []).length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <p className="text-xs text-muted-foreground mb-2">
            {t('kubevela.applications', 'Applications')}
          </p>
          <div className="space-y-1.5">
            {(data.applications || []).map((app) => (
              <div
                key={`${app.namespace}/${app.name}`}
                className="flex items-start justify-between rounded-md bg-muted/30 px-3 py-2 gap-2"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <div className="mt-0.5 shrink-0">
                    {appStatusIcon(app.status)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{app.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{app.namespace}</p>
                    {app.message && (
                      <p className="text-xs text-red-400/80 truncate mt-0.5">{app.message}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <p className={`text-xs font-medium tabular-nums ${appStatusColor(app.status)}`}>
                    {appStatusLabel(app.status)}
                  </p>
                  <WorkflowProgress
                    completed={app.workflowStepsCompleted}
                    total={app.workflowSteps}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
