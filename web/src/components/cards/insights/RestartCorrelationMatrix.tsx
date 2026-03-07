import { useMemo } from 'react'
import { RefreshCcw, Bug, Server } from 'lucide-react'
import { useMultiClusterInsights } from '../../../hooks/useMultiClusterInsights'
import { useCardLoadingState } from '../CardDataContext'
import { InsightSourceBadge } from './InsightSourceBadge'
import { StatusBadge } from '../../ui/StatusBadge'



export function RestartCorrelationMatrix() {
  const { insightsByCategory, isLoading, isDemoData } = useMultiClusterInsights()

  const restartInsights = useMemo(() => insightsByCategory['restart-correlation'] || [], [insightsByCategory])

  useCardLoadingState({
    isLoading,
    hasAnyData: restartInsights.length > 0,
    isDemoData,
  })

  const appBugInsights = useMemo(
    () => (restartInsights || []).filter(i => i.id.includes('app-bug')),
    [restartInsights],
  )

  const infraInsights = useMemo(
    () => (restartInsights || []).filter(i => i.id.includes('infra-issue')),
    [restartInsights],
  )

  if (!isLoading && restartInsights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
        <RefreshCcw className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No restart correlations detected</p>
        <p className="text-xs mt-1">Pod restarts are within normal patterns</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-1">
      {/* App Bug Pattern (horizontal) */}
      {appBugInsights.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Bug className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-xs font-medium text-yellow-400">Application Bug Pattern</span>
            <span className="text-2xs text-muted-foreground">Same workload failing across clusters</span>
          </div>
          {(appBugInsights || []).map(insight => (
            <div
              key={insight.id}
              className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-2.5 space-y-1"
            >
              <div className="flex items-center gap-2">
                <InsightSourceBadge source={insight.source} confidence={insight.confidence} />
                <StatusBadge
                  color={insight.severity === 'critical' ? 'red' : 'yellow'}
                  size="xs"
                >
                  {insight.severity}
                </StatusBadge>
                <span className="text-xs font-medium flex-1">{insight.title}</span>
              </div>
              <p className="text-xs text-muted-foreground">{insight.description}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {(insight.affectedClusters || []).map(cluster => (
                  <StatusBadge key={cluster} color="yellow" size="xs">{cluster}</StatusBadge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Infra Issue Pattern (vertical) */}
      {infraInsights.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Server className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs font-medium text-red-400">Infrastructure Issue Pattern</span>
            <span className="text-2xs text-muted-foreground">Many workloads failing in one cluster</span>
          </div>
          {(infraInsights || []).map(insight => (
            <div
              key={insight.id}
              className="bg-red-500/5 border border-red-500/20 rounded-lg p-2.5 space-y-1"
            >
              <div className="flex items-center gap-2">
                <InsightSourceBadge source={insight.source} confidence={insight.confidence} />
                <StatusBadge
                  color={insight.severity === 'critical' ? 'red' : 'yellow'}
                  size="xs"
                >
                  {insight.severity}
                </StatusBadge>
                <span className="text-xs font-medium flex-1">{insight.title}</span>
              </div>
              <p className="text-xs text-muted-foreground">{insight.description}</p>
              {insight.relatedResources && insight.relatedResources.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {(insight.relatedResources || []).map(resource => (
                    <StatusBadge key={resource} color="gray" size="xs">{resource}</StatusBadge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
