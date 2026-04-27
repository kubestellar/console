import { AlertTriangle, CheckCircle, GitBranch, Layers, Package, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useFluxStatus } from './useFluxStatus'
import type { FluxResourceStatus } from './demoData'
import { createCardSyncFormatter } from '../../../lib/formatters'


function ResourceSection({
  title,
  icon,
  items,
}: {
  title: string
  icon: React.ReactNode
  items: FluxResourceStatus[]
}) {
  const { t } = useTranslation('cards')

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
          {t('fluxStatus.noResources')}
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map(item => (
            <div
              key={`${item.kind}:${item.cluster}:${item.namespace}:${item.name}`}
              className="rounded-md bg-secondary/30 px-3 py-2.5 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex items-center gap-1.5">
                  {item.ready ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                  )}
                  <span className="text-xs font-medium truncate">{item.name}</span>
                </div>
                <span
                  className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${
                    item.ready
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}
                >
                  {item.ready ? t('fluxStatus.statusReady') : t('fluxStatus.statusNotReady')}
                </span>
              </div>

              <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                <span className="truncate">{item.namespace} | {item.cluster}</span>
                <span className="truncate">{item.reason || item.revision || '-'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function FluxStatus() {
  const { t } = useTranslation('cards')
  const formatRelativeTime = createCardSyncFormatter(t, 'fluxStatus')
  const { data, isRefreshing, error, showSkeleton, showEmptyState } = useFluxStatus()

  const totalNotReady = data.sources.notReady + data.kustomizations.notReady + data.helmReleases.notReady
  const isHealthy = data.health === 'healthy'

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex items-center justify-between">
          <Skeleton variant="rounded" width={140} height={28} />
          <Skeleton variant="rounded" width={90} height={20} />
        </div>
        <SkeletonStats className="grid-cols-2 @md:grid-cols-4" />
        <SkeletonList items={6} className="flex-1" />
      </div>
    )
  }

  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">{t('fluxStatus.fetchError')}</p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <GitBranch className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t('fluxStatus.notInstalled')}</p>
        <p className="text-xs text-center max-w-xs">{t('fluxStatus.notInstalledHint')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            isHealthy
              ? 'bg-green-500/15 text-green-400'
              : 'bg-yellow-500/15 text-yellow-400'
          }`}
        >
          {isHealthy ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {isHealthy ? t('fluxStatus.healthy') : t('fluxStatus.degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatRelativeTime(data.lastCheckTime)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('fluxStatus.sources')}
          value={data.sources.total}
          colorClass="text-cyan-400"
          icon={<GitBranch className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('fluxStatus.kustomizations')}
          value={data.kustomizations.total}
          colorClass="text-blue-400"
          icon={<Layers className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('fluxStatus.helmReleases')}
          value={data.helmReleases.total}
          colorClass="text-purple-400"
          icon={<Package className="w-4 h-4 text-purple-400" />}
        />
        <MetricTile
          label={t('fluxStatus.notReady')}
          value={totalNotReady}
          colorClass={totalNotReady > 0 ? 'text-yellow-400' : 'text-green-400'}
          icon={
            totalNotReady > 0
              ? <AlertTriangle className="w-4 h-4 text-yellow-400" />
              : <CheckCircle className="w-4 h-4 text-green-400" />
          }
        />
      </div>

      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <ResourceSection
          title={t('fluxStatus.sectionSources')}
          icon={<GitBranch className="w-4 h-4 text-cyan-400" />}
          items={data.resources.sources}
        />
        <ResourceSection
          title={t('fluxStatus.sectionKustomizations')}
          icon={<Layers className="w-4 h-4 text-blue-400" />}
          items={data.resources.kustomizations}
        />
        <ResourceSection
          title={t('fluxStatus.sectionHelmReleases')}
          icon={<Package className="w-4 h-4 text-purple-400" />}
          items={data.resources.helmReleases}
        />
      </div>
    </div>
  )
}

export default FluxStatus
