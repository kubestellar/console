import { useMemo } from 'react'
import { GitBranch, CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton } from '../ui/Skeleton'

interface ArgoCDHealthProps {
  config?: Record<string, unknown>
}

// Mock health status data
function getMockHealthData(clusterCount: number) {
  return {
    healthy: Math.floor(clusterCount * 3.8),
    degraded: Math.floor(clusterCount * 0.8),
    progressing: Math.floor(clusterCount * 0.5),
    missing: Math.floor(clusterCount * 0.2),
    unknown: Math.floor(clusterCount * 0.1),
  }
}

const healthConfig = {
  healthy: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10', label: 'Healthy' },
  degraded: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Degraded' },
  progressing: { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Progressing' },
  missing: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Missing' },
  unknown: { icon: AlertTriangle, color: 'text-gray-400', bg: 'bg-secondary/30', label: 'Unknown' },
}

export function ArgoCDHealth({ config: _config }: ArgoCDHealthProps) {
  const { clusters, isLoading, refetch } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()

  const filteredClusterCount = useMemo(() => {
    if (isAllClustersSelected) return clusters.length
    return selectedClusters.length
  }, [clusters, selectedClusters, isAllClustersSelected])

  const stats = useMemo(() => {
    return getMockHealthData(filteredClusterCount)
  }, [filteredClusterCount])

  const total = Object.values(stats).reduce((a, b) => a + b, 0)
  const healthyPercent = total > 0 ? (stats.healthy / total) * 100 : 0

  if (isLoading) {
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium text-muted-foreground">App Health</span>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-secondary rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Health gauge */}
      <div className="flex items-center justify-center gap-4 mb-4 p-4 rounded-lg bg-secondary/30">
        <div className="text-center">
          <p className="text-3xl font-bold text-white">{healthyPercent.toFixed(0)}%</p>
          <p className="text-xs text-muted-foreground">Healthy</p>
        </div>
        <div className="w-px h-12 bg-border" />
        <div className="text-center">
          <p className="text-3xl font-bold text-white">{total}</p>
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
                <span className="text-sm text-white">{config.label}</span>
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
