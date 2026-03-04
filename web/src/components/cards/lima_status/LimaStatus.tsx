import { CheckCircle, AlertTriangle, RefreshCw, Monitor, Cpu, MemoryStick, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../ui/Skeleton'
import { useLimaStatus } from './useLimaStatus'
import { MetricTile } from '../../../lib/cards/CardComponents'

function useFormatRelativeTime() {
  const { t } = useTranslation('cards')
  return (isoString: string): string => {
    const diff = Date.now() - new Date(isoString).getTime()
    if (isNaN(diff) || diff < 0) return t('lima.syncedJustNow')
    const minute = 60_000
    const hour = 60 * minute
    const day = 24 * hour
    if (diff < minute) return t('lima.syncedJustNow')
    if (diff < hour) return t('lima.syncedMinutesAgo', { count: Math.floor(diff / minute) })
    if (diff < day) return t('lima.syncedHoursAgo', { count: Math.floor(diff / hour) })
    return t('lima.syncedDaysAgo', { count: Math.floor(diff / day) })
  }
}

const STATUS_COLORS: Record<string, string> = {
  running: 'text-green-400',
  stopped: 'text-yellow-400',
  broken: 'text-red-400',
}

const STATUS_BG: Record<string, string> = {
  running: 'bg-green-500/15',
  stopped: 'bg-yellow-500/15',
  broken: 'bg-red-500/15',
}

export function LimaStatus() {
  const { t } = useTranslation('cards')
  const formatRelativeTime = useFormatRelativeTime()
  const { data, error, showSkeleton, showEmptyState } = useLimaStatus()

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-3">
        <Skeleton variant="rounded" height={36} />
        <div className="flex gap-2">
          <Skeleton variant="rounded" height={80} className="flex-1" />
          <Skeleton variant="rounded" height={80} className="flex-1" />
          <Skeleton variant="rounded" height={80} className="flex-1" />
        </div>
        <Skeleton variant="rounded" height={140} />
        <Skeleton variant="rounded" height={36} />
      </div>
    )
  }

  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">{t('lima.fetchError')}</p>
      </div>
    )
  }

  if (data.health === 'not-detected') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Monitor className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t('lima.notDetected')}</p>
        <p className="text-xs text-center max-w-xs">{t('lima.notDetectedHint')}</p>
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4">
      {/* Health badge + last check */}
      <div className="flex items-center justify-between">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
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
          {isHealthy ? t('lima.healthy') : t('lima.degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className="w-3 h-3" />
          <span>{formatRelativeTime(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Metric tiles */}
      <div className="flex gap-3">
        <MetricTile
          label={t('lima.totalInstances')}
          value={data.totalNodes}
          colorClass="text-blue-400"
          icon={<Server className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('lima.totalCpu')}
          value={`${data.totalCpuCores}`}
          colorClass="text-purple-400"
          icon={<Cpu className="w-4 h-4 text-purple-400" />}
        />
        <MetricTile
          label={t('lima.totalMemory')}
          value={`${data.totalMemoryGB}GB`}
          colorClass="text-cyan-400"
          icon={<MemoryStick className="w-4 h-4 text-cyan-400" />}
        />
      </div>

      {/* Instance list */}
      <div className="flex-1 flex flex-col gap-2 overflow-hidden">
        <p className="text-xs font-medium text-muted-foreground">{t('lima.instances')}</p>
        <div className="space-y-1.5 overflow-y-auto scrollbar-thin max-h-48">
          {data.instances.map((instance) => (
            <div
              key={instance.name}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 bg-secondary/30"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Monitor className={`w-3.5 h-3.5 shrink-0 ${STATUS_COLORS[instance.status] ?? 'text-muted-foreground'}`} />
                <span className="text-xs font-medium truncate">{instance.name}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                {instance.cpuCores > 0 && (
                  <span>{instance.cpuCores} CPU</span>
                )}
                {instance.memoryGB > 0 && (
                  <span>{instance.memoryGB}GB</span>
                )}
                <span
                  className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BG[instance.status] ?? ''} ${STATUS_COLORS[instance.status] ?? 'text-muted-foreground'}`}
                >
                  {t(`lima.status_${instance.status}`)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
        <a
          href="https://lima-vm.io"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-blue-400 transition-colors"
        >
          {t('lima.openDocs')}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </div>
  )
}
