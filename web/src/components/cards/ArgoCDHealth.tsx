import { CheckCircle, XCircle, Clock, AlertTriangle, ExternalLink, AlertCircle } from 'lucide-react'
import { Skeleton } from '../ui/Skeleton'
import { useArgoCDHealth } from '../../hooks/useArgoCD'
import { useReportCardDataState } from './CardDataContext'

interface ArgoCDHealthProps {
  config?: Record<string, unknown>
}

const healthConfig = {
  healthy: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10', label: 'Healthy' },
  degraded: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Degraded' },
  progressing: { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Progressing' },
  missing: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Missing' },
  unknown: { icon: AlertTriangle, color: 'text-gray-400', bg: 'bg-secondary/30', label: 'Unknown' },
}

export function ArgoCDHealth({ config: _config }: ArgoCDHealthProps) {
  const {
    stats,
    total,
    healthyPercent,
    isLoading,
    isRefreshing,
    isFailed,
    consecutiveFailures,
  } = useArgoCDHealth()

  // hasData should be true once loading completes (even with empty data)
  const hasData = !isLoading || total > 0

  // Report data state to CardWrapper
  useReportCardDataState({
    isFailed,
    consecutiveFailures,
    isLoading: isLoading && total === 0,
    isRefreshing: isRefreshing || (isLoading && total > 0),
    hasData,
  })

  const showSkeleton = isLoading && total === 0 && !isFailed

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={130} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={80} className="mb-4" />
        <div className="space-y-2">
          <Skeleton variant="rounded" height={20} />
          <Skeleton variant="rounded" height={20} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-end mb-3">
        <div className="flex items-center gap-1">
          <a
            href="https://argo-cd.readthedocs.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400"
            title="ArgoCD Documentation"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-orange-400 font-medium">ArgoCD Integration</p>
          <p className="text-muted-foreground">
            Install ArgoCD for application health tracking.{' '}
            <a href="https://argo-cd.readthedocs.io/en/stable/getting_started/" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
              Install guide →
            </a>
          </p>
        </div>
      </div>

      {/* Health gauge */}
      <div className="flex items-center justify-center gap-4 mb-4 p-4 rounded-lg bg-secondary/30">
        <div className="text-center">
          <p className="text-3xl font-bold text-foreground">{healthyPercent.toFixed(0)}%</p>
          <p className="text-xs text-muted-foreground">Healthy</p>
        </div>
        <div className="w-px h-12 bg-border" />
        <div className="text-center">
          <p className="text-3xl font-bold text-foreground">{total}</p>
          <p className="text-xs text-muted-foreground">Total Apps</p>
        </div>
      </div>

      {/* Health breakdown */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {(Object.entries(stats) as [keyof typeof healthConfig, number][]).map(([key, count]) => {
          const config = healthConfig[key]
          const Icon = config.icon

          return (
            <div key={key} className={`flex items-center justify-between p-2 rounded-lg ${config.bg}`}>
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${config.color}`} />
                <span className="text-sm text-foreground">{config.label}</span>
              </div>
              <span className={`text-sm font-bold ${config.color}`}>{count}</span>
            </div>
          )
        })}
      </div>

      {/* Health bar */}
      <div className="mt-4 pt-3 border-t border-border/50">
        <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
          <div
            className="bg-green-500 transition-all"
            style={{ width: `${(stats.healthy / total) * 100}%` }}
          />
          <div
            className="bg-red-500 transition-all"
            style={{ width: `${(stats.degraded / total) * 100}%` }}
          />
          <div
            className="bg-blue-500 transition-all"
            style={{ width: `${(stats.progressing / total) * 100}%` }}
          />
          <div
            className="bg-orange-500 transition-all"
            style={{ width: `${(stats.missing / total) * 100}%` }}
          />
          <div
            className="bg-gray-500 transition-all"
            style={{ width: `${(stats.unknown / total) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}
