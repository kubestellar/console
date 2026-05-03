import {
  AlertTriangle,
  Building2,
  CheckCircle,
  Database,
  Package,
  RefreshCw,
  Users,
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../ui/Skeleton'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { useArtifactHubStatus } from './useArtifactHubStatus'
import { createCardSyncFormatter } from '../../../lib/formatters'


export function ArtifactHubStatus() {
  const { t } = useTranslation('cards')
  const formatRelativeTime = createCardSyncFormatter(t, 'artifactHub')
  const { data, error, isRefreshing, showSkeleton, showEmptyState } = useArtifactHubStatus()

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-3">
        <Skeleton variant="rounded" height={36} />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton variant="rounded" height={80} className="flex-1" />
          <Skeleton variant="rounded" height={80} className="flex-1" />
          <Skeleton variant="rounded" height={80} className="flex-1" />
          <Skeleton variant="rounded" height={80} className="flex-1" />
        </div>
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  if (error || showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">
          {error ? t('artifactHub.fetchError') : t('artifactHub.noData')}
        </p>
        <p className="text-xs">{t('artifactHub.noDataHint')}</p>
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4">
      <div className="flex flex-wrap items-center justify-between gap-y-2">
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
          {isHealthy ? t('artifactHub.healthy') : t('artifactHub.degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={cn('w-3 h-3', isRefreshing && 'animate-spin')} />
          <span>{formatRelativeTime(data.lastCheckTime)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MetricTile
          label={t('artifactHub.packages')}
          value={data.packages.toLocaleString()}
          colorClass="text-blue-400"
          icon={<Package className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('artifactHub.repositories')}
          value={data.repositories.toLocaleString()}
          colorClass="text-purple-400"
          icon={<Database className="w-4 h-4 text-purple-400" />}
        />
        <MetricTile
          label={t('artifactHub.organizations')}
          value={data.organizations.toLocaleString()}
          colorClass="text-teal-400"
          icon={<Building2 className="w-4 h-4 text-teal-400" />}
        />
        <MetricTile
          label={t('artifactHub.users')}
          value={data.users.toLocaleString()}
          colorClass="text-orange-400"
          icon={<Users className="w-4 h-4 text-orange-400" />}
        />
      </div>

      <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
        <a
          href="https://artifacthub.io"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-blue-400 transition-colors"
        >
          {t('artifactHub.openArtifactHub')}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>
    </div>
  )
}

export default ArtifactHubStatus
