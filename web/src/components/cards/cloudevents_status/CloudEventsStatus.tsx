import { useState } from 'react'
import { Activity, AlertTriangle, CheckCircle, CircleDashed, RadioTower, RefreshCw, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CardSearchInput, MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCloudEventsStatus } from './useCloudEventsStatus'
import type { CloudEventResourceState } from './demoData'

const STATUS_STYLE: Record<CloudEventResourceState, { badge: string; icon: React.ReactNode }> = {
  ready: {
    badge: 'bg-green-500/20 text-green-400',
    icon: <CheckCircle className="w-3.5 h-3.5 text-green-400" /> },
  degraded: {
    badge: 'bg-yellow-500/20 text-yellow-400',
    icon: <CircleDashed className="w-3.5 h-3.5 text-yellow-400" /> },
  error: {
    badge: 'bg-red-500/20 text-red-400',
    icon: <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> } }

const STATUS_LABEL_KEY: Record<CloudEventResourceState, 'cloudevents.status_ready' | 'cloudevents.status_degraded' | 'cloudevents.status_error'> = {
  ready: 'cloudevents.status_ready',
  degraded: 'cloudevents.status_degraded',
  error: 'cloudevents.status_error' }

function useFormatRelativeTime() {
  const { t } = useTranslation('cards')
  return (isoString: string): string => {
    const diff = Date.now() - new Date(isoString).getTime()
    if (isNaN(diff) || diff < 0) return t('cloudevents.syncedJustNow')

    const minute = 60_000
    const hour = 60 * minute
    const day = 24 * hour

    if (diff < minute) return t('cloudevents.syncedJustNow')
    if (diff < hour) return t('cloudevents.syncedMinutesAgo', { count: Math.floor(diff / minute) })
    if (diff < day) return t('cloudevents.syncedHoursAgo', { count: Math.floor(diff / hour) })
    return t('cloudevents.syncedDaysAgo', { count: Math.floor(diff / day) })
  }
}

export function CloudEventsStatus() {
  const { t } = useTranslation('cards')
  const formatRelativeTime = useFormatRelativeTime()
  const { data, isRefreshing, error, showSkeleton, showEmptyState } = useCloudEventsStatus()
  const [search, setSearch] = useState('')

  const isHealthy = data.health === 'healthy'

  const filteredResources = (() => {
    const resources = data.resources || []
    const query = search.trim().toLowerCase()
    if (!query) return resources

    return resources.filter((resource) =>
      resource.name.toLowerCase().includes(query) ||
      resource.kind.toLowerCase().includes(query) ||
      resource.namespace.toLowerCase().includes(query) ||
      resource.cluster.toLowerCase().includes(query),
    )
  })()

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex items-center justify-between">
          <Skeleton variant="rounded" width={140} height={28} />
          <Skeleton variant="rounded" width={90} height={20} />
        </div>
        <SkeletonStats className="grid-cols-4" />
        <Skeleton variant="rounded" height={32} />
        <SkeletonList items={4} className="flex-1" />
      </div>
    )
  }

  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">{t('cloudevents.fetchError')}</p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <RadioTower className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t('cloudevents.notInstalled')}</p>
        <p className="text-xs text-center max-w-xs">{t('cloudevents.notInstalledHint')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      <div className="flex items-center justify-between">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            isHealthy ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'
          }`}
        >
          {isHealthy ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {isHealthy ? t('cloudevents.healthy') : t('cloudevents.degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatRelativeTime(data.lastCheckTime)}</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <MetricTile
          label={t('cloudevents.brokers')}
          value={data.brokers.total}
          colorClass="text-blue-400"
          icon={<RadioTower className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('cloudevents.triggers')}
          value={data.triggers.total}
          colorClass="text-purple-400"
          icon={<Activity className="w-4 h-4 text-purple-400" />}
        />
        <MetricTile
          label={t('cloudevents.sources')}
          value={data.eventSources.total}
          colorClass="text-cyan-400"
          icon={<Send className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('cloudevents.deliveryFailures')}
          value={data.deliveries.failed}
          colorClass={data.deliveries.failed > 0 ? 'text-red-400' : 'text-green-400'}
          icon={<AlertTriangle className={`w-4 h-4 ${data.deliveries.failed > 0 ? 'text-red-400' : 'text-green-400'}`} />}
        />
      </div>

      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('cloudevents.searchPlaceholder')}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <p className="text-xs font-medium text-muted-foreground mb-2">{t('cloudevents.resources')}</p>
        <div className="space-y-1.5 overflow-y-auto scrollbar-thin max-h-56">
          {filteredResources.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-3 text-xs text-muted-foreground text-center">
              {t('cloudevents.noMatches')}
            </div>
          ) : (
            filteredResources.map((resource) => {
              const style = STATUS_STYLE[resource.state]
              return (
                <div key={`${resource.cluster}/${resource.namespace}/${resource.kind}/${resource.name}`} className="rounded-md bg-secondary/30 px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-1.5">
                      {style.icon}
                      <span className="text-xs font-medium truncate">{resource.name}</span>
                    </div>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${style.badge}`}>
                      {t(STATUS_LABEL_KEY[resource.state])}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                    <span className="truncate">{resource.kind} · {resource.namespace} · {resource.cluster}</span>
                    <span className="shrink-0">{t('cloudevents.sink')}: {resource.sink || t('security.notApplicable')}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
