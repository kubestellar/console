import { CheckCircle, AlertTriangle, RefreshCw, Database, Activity, Users, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const GROUP_LAG_WARNING_THRESHOLD = 100
const TOTAL_LAG_WARNING_THRESHOLD = 200
import { Skeleton } from '../../ui/Skeleton'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { useStrimziStatus } from './useStrimziStatus'
import type { StrimziTopic, StrimziConsumerGroup } from './demoData'

function useFormatRelativeTime() {
  return (isoString: string): string => {
    const diff = Date.now() - new Date(isoString).getTime()
    if (isNaN(diff) || diff < 0) return 'just now'
    const minute = 60_000
    const hour = 60 * minute
    const day = 24 * hour
    if (diff < minute) return 'just now'
    if (diff < hour) return `${Math.floor(diff / minute)}m ago`
    if (diff < day) return `${Math.floor(diff / hour)}h ago`
    return `${Math.floor(diff / day)}d ago`
  }
}

function TopicRow({ topic }: { topic: StrimziTopic }) {
  const { t } = useTranslation('cards')

  const statusColor =
    topic.status === 'active' ? 'text-green-400 bg-green-500/10' :
    topic.status === 'inactive' ? 'text-yellow-400 bg-yellow-500/10' :
    'text-red-400 bg-red-500/10'

  const statusLabel =
    topic.status === 'active' ? t('strimziStatus.topicStatus_active', 'Active') :
    topic.status === 'inactive' ? t('strimziStatus.topicStatus_inactive', 'Inactive') :
    t('strimziStatus.topicStatus_error', 'Error')

  return (
    <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">{topic.name}</p>
        <p className="text-xs text-muted-foreground">
          {t('strimziStatus.topicPartitionsRf', '{{count}} partitions \u00b7 RF {{rf}}', { count: topic.partitions, rf: topic.replicationFactor })}
        </p>
      </div>
      <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ml-2 ${statusColor}`}>
        {statusLabel}
      </span>
    </div>
  )
}

function ConsumerGroupRow({ group }: { group: StrimziConsumerGroup }) {
  const { t } = useTranslation('cards')

  const statusColor =
    group.status === 'ok' ? 'text-green-400' :
    group.status === 'warning' ? 'text-yellow-400' : 'text-red-400'

  const lagColor =
    group.lag === 0 ? 'text-green-400' :
    group.lag < GROUP_LAG_WARNING_THRESHOLD ? 'text-yellow-400' : 'text-red-400'

  const statusLabel =
    group.status === 'ok' ? t('strimziStatus.groupStatus_ok', 'OK') :
    group.status === 'warning' ? t('strimziStatus.groupStatus_warning', 'Warning') :
    t('strimziStatus.groupStatus_error', 'Error')

  return (
    <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">{group.groupId}</p>
        <p className={`text-xs tabular-nums ${lagColor}`}>
          {t('strimziStatus.lag', 'lag')}: {group.lag.toLocaleString()}
        </p>
      </div>
      <span className={`text-xs font-medium shrink-0 ml-2 ${statusColor}`}>
        {statusLabel}
      </span>
    </div>
  )
}

export function StrimziStatus() {
  const { t } = useTranslation('cards')
  const formatRelativeTime = useFormatRelativeTime()
  const { data, error, showSkeleton, showEmptyState, isRefreshing } = useStrimziStatus()

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-3">
        <Skeleton variant="rounded" height={36} />
        <div className="flex gap-2">
          <Skeleton variant="rounded" height={80} className="flex-1" />
          <Skeleton variant="rounded" height={80} className="flex-1" />
          <Skeleton variant="rounded" height={80} className="flex-1" />
        </div>
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
        <p className="text-sm text-red-400">{t('strimziStatus.fetchError', 'Failed to fetch Strimzi status')}</p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Database className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t('strimziStatus.notInstalled', 'Strimzi not detected')}</p>
        <p className="text-xs text-center max-w-xs">
          {t('strimziStatus.notInstalledHint', 'No Strimzi operator or Kafka pods found. Deploy Strimzi to monitor Kafka clusters.')}
        </p>
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'
  const healthColorClass = isHealthy
    ? 'bg-green-500/15 text-green-400'
    : 'bg-yellow-500/15 text-yellow-400'
  const healthLabel = isHealthy
    ? t('strimziStatus.healthy', 'Healthy')
    : t('strimziStatus.degraded', 'Degraded')

  const totalLag = data.consumerGroups.reduce((sum, g) => sum + g.lag, 0)
  const activeTopics = data.topics.filter(topic => topic.status === 'active').length

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* Health badge + cluster name + last check */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${healthColorClass}`}>
          {isHealthy ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {healthLabel}
          {data.clusterName && (
            <span className="opacity-70 text-xs font-normal">&middot; {data.clusterName}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {isRefreshing && <RefreshCw className="w-3 h-3 animate-spin" />}
          <span>{formatRelativeTime(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Key metrics */}
      <div className="flex gap-3">
        <MetricTile
          label={t('strimziStatus.brokers', 'Brokers')}
          value={`${data.brokers.ready}/${data.brokers.total}`}
          colorClass={
            data.brokers.ready === data.brokers.total && data.brokers.total > 0
              ? 'text-green-400'
              : 'text-yellow-400'
          }
          icon={<Server className="w-3 h-3" />}
        />
        <MetricTile
          label={t('strimziStatus.topics', 'Topics')}
          value={
            data.topics.length > 0
              ? `${activeTopics}/${data.topics.length}`
              : `${data.topics.length}`
          }
          colorClass="text-blue-400"
          icon={<Activity className="w-3 h-3" />}
        />
        <MetricTile
          label={t('strimziStatus.totalLag', 'Total Lag')}
          value={totalLag.toLocaleString()}
          colorClass={totalLag === 0 ? 'text-green-400' : totalLag < TOTAL_LAG_WARNING_THRESHOLD ? 'text-yellow-400' : 'text-red-400'}
          icon={<Users className="w-3 h-3" />}
        />
      </div>

      {/* Topics list */}
      {data.topics.length > 0 && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <p className="text-xs text-muted-foreground mb-2">
            {t('strimziStatus.kafkaTopics', 'Kafka Topics')}
          </p>
          <div className="space-y-1.5">
            {data.topics.map((topic) => (
              <TopicRow key={topic.name} topic={topic} />
            ))}
          </div>

          {/* Consumer groups */}
          {data.consumerGroups.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground mb-2">
                {t('strimziStatus.consumerGroups', 'Consumer Groups')}
              </p>
              <div className="space-y-1.5">
                {data.consumerGroups.map((group) => (
                  <ConsumerGroupRow key={group.groupId} group={group} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
