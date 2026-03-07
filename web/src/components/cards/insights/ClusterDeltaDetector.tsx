import { useMemo, useState } from 'react'
import { GitCompare } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useMultiClusterInsights } from '../../../hooks/useMultiClusterInsights'
import { useCardLoadingState } from '../CardDataContext'
import { InsightSourceBadge } from './InsightSourceBadge'
import { StatusBadge } from '../../ui/StatusBadge'
import { CHART_GRID_STROKE, CHART_TOOLTIP_BG, CHART_TOOLTIP_BORDER, CHART_TICK_COLOR } from '../../../lib/constants/ui'


/** Color for cluster A bars */
const CLUSTER_A_COLOR = '#3b82f6'
/** Color for cluster B bars */
const CLUSTER_B_COLOR = '#f59e0b'

const SIGNIFICANCE_COLORS: Record<string, string> = {
  high: 'border-red-500/30 bg-red-500/5',
  medium: 'border-yellow-500/30 bg-yellow-500/5',
  low: 'border-border bg-secondary/30',
}

export function ClusterDeltaDetector() {
  const { insightsByCategory, isLoading, isDemoData } = useMultiClusterInsights()

  const deltaInsights = insightsByCategory['cluster-delta'] || []

  useCardLoadingState({
    isLoading,
    hasAnyData: deltaInsights.length > 0,
    isDemoData,
  })

  // Use first insight's clusters as default selection
  const [selectedInsight, setSelectedInsight] = useState(0)
  const insight = deltaInsights[selectedInsight] || deltaInsights[0]

  const numericDeltas = useMemo(() => {
    if (!insight?.deltas) return []
    return (insight.deltas || [])
      .filter(d => typeof d.clusterA.value === 'number' && typeof d.clusterB.value === 'number')
      .map(d => ({
        dimension: d.dimension,
        [d.clusterA.name]: d.clusterA.value as number,
        [d.clusterB.name]: d.clusterB.value as number,
        significance: d.significance,
      }))
  }, [insight])

  const nonNumericDeltas = useMemo(() => {
    if (!insight?.deltas) return []
    return (insight.deltas || []).filter(
      d => typeof d.clusterA.value === 'string' || typeof d.clusterB.value === 'string',
    )
  }, [insight])

  if (!isLoading && deltaInsights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
        <GitCompare className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No cluster deltas detected</p>
        <p className="text-xs mt-1">Shared workloads are consistent across clusters</p>
      </div>
    )
  }

  const clusterPair = insight ? [...new Set(insight.affectedClusters)].slice(0, 2) : []

  return (
    <div className="space-y-3 p-1">
      {/* Workload selector */}
      {deltaInsights.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {(deltaInsights || []).map((ins, i) => (
            <button
              key={ins.id}
              onClick={() => setSelectedInsight(i)}
              className={`text-2xs px-2 py-1 rounded whitespace-nowrap ${
                i === selectedInsight
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
              }`}
            >
              {(ins.relatedResources || [])[0] || ins.title}
            </button>
          ))}
        </div>
      )}

      {insight && (
        <>
          <div className="flex items-center gap-2">
            <InsightSourceBadge source={insight.source} confidence={insight.confidence} />
            <StatusBadge
              color={insight.severity === 'critical' ? 'red' : insight.severity === 'warning' ? 'yellow' : 'blue'}
              size="xs"
            >
              {insight.severity}
            </StatusBadge>
            <span className="text-xs text-muted-foreground flex-1">{insight.description}</span>
          </div>

          {/* Legend */}
          {clusterPair.length === 2 && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CLUSTER_A_COLOR }} />
                <span className="text-2xs text-muted-foreground">{clusterPair[0]}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CLUSTER_B_COLOR }} />
                <span className="text-2xs text-muted-foreground">{clusterPair[1]}</span>
              </div>
            </div>
          )}

          {/* Numeric deltas as bar chart */}
          {numericDeltas.length > 0 && clusterPair.length === 2 && (
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={numericDeltas} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                  <XAxis dataKey="dimension" tick={{ fontSize: 9, fill: CHART_TICK_COLOR }} />
                  <YAxis tick={{ fontSize: 9, fill: CHART_TICK_COLOR }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: CHART_TOOLTIP_BG, border: `1px solid ${CHART_TOOLTIP_BORDER}`, borderRadius: 6, fontSize: 11 }}
                  />
                  <Bar dataKey={clusterPair[0]} fill={CLUSTER_A_COLOR} radius={[4, 4, 0, 0]} />
                  <Bar dataKey={clusterPair[1]} fill={CLUSTER_B_COLOR} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Non-numeric deltas as list */}
          {nonNumericDeltas.length > 0 && (
            <div className="space-y-1">
              {(nonNumericDeltas || []).map((delta, i) => (
                <div
                  key={`${delta.dimension}-${i}`}
                  className={`rounded-lg border p-2 ${SIGNIFICANCE_COLORS[delta.significance] || SIGNIFICANCE_COLORS.low}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{delta.dimension}</span>
                    <StatusBadge
                      color={delta.significance === 'high' ? 'red' : delta.significance === 'medium' ? 'yellow' : 'gray'}
                      size="xs"
                    >
                      {delta.significance}
                    </StatusBadge>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-2xs text-blue-400">{delta.clusterA.name}: {String(delta.clusterA.value)}</span>
                    <span className="text-2xs text-muted-foreground">vs</span>
                    <span className="text-2xs text-yellow-400">{delta.clusterB.name}: {String(delta.clusterB.value)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
