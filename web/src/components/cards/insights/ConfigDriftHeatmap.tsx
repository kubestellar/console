import { useMemo } from 'react'
import { Diff } from 'lucide-react'
import { useMultiClusterInsights } from '../../../hooks/useMultiClusterInsights'
import { useCardLoadingState } from '../CardDataContext'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { InsightSourceBadge } from './InsightSourceBadge'
import { StatusBadge } from '../../ui/StatusBadge'
import { CardControlsRow } from '../../../lib/cards/CardComponents'
import { useInsightSort, INSIGHT_SORT_OPTIONS, type InsightSortField } from './insightSortUtils'

/** Maximum clusters to show in the heatmap grid */
const MAX_HEATMAP_CLUSTERS = 12
/** Max length for cluster name in column headers */
const COLUMN_HEADER_MAX_LEN = 8
/** Truncated column header suffix length */
const COLUMN_HEADER_TRUNCATE_LEN = 6
/** Max length for cluster name in row labels */
const ROW_LABEL_MAX_LEN = 10
/** Truncated row label suffix length */
const ROW_LABEL_TRUNCATE_LEN = 8
/** High drift intensity threshold for red coloring */
const HIGH_DRIFT_THRESHOLD = 0.7
/** Medium drift intensity threshold for yellow coloring */
const MEDIUM_DRIFT_THRESHOLD = 0.3

export function ConfigDriftHeatmap() {
  const { insightsByCategory, isLoading, isDemoData } = useMultiClusterInsights()
  const { selectedClusters } = useGlobalFilters()

  const driftInsightsRaw = useMemo(() => insightsByCategory['config-drift'] || [], [insightsByCategory])
  const {
    sorted: driftInsights,
    sortBy, setSortBy, sortDirection, setSortDirection, limit, setLimit,
  } = useInsightSort(driftInsightsRaw)

  useCardLoadingState({
    isLoading,
    hasAnyData: driftInsightsRaw.length > 0,
    isDemoData,
  })

  // Build cluster-pair drift counts
  const { clusters, driftMatrix } = useMemo(() => {
    const clusterSet = new Set<string>()
    for (const insight of driftInsights || []) {
      for (const c of insight.affectedClusters || []) {
        if (selectedClusters.length === 0 || selectedClusters.includes(c)) {
          clusterSet.add(c)
        }
      }
    }
    const clusterList = Array.from(clusterSet).slice(0, MAX_HEATMAP_CLUSTERS)

    // Count drift items per cluster pair
    const matrix = new Map<string, number>()
    for (const insight of driftInsights || []) {
      const affected = (insight.affectedClusters || []).filter(c => clusterList.includes(c))
      for (let i = 0; i < affected.length; i++) {
        for (let j = i + 1; j < affected.length; j++) {
          const key = `${affected[i]}:${affected[j]}`
          matrix.set(key, (matrix.get(key) || 0) + 1)
        }
      }
    }

    return { clusters: clusterList, driftMatrix: matrix }
  }, [driftInsights, selectedClusters])

  const maxDrift = Math.max(1, ...Array.from(driftMatrix.values()))

  function getDriftColor(count: number): string {
    if (count === 0) return 'bg-green-500/20'
    const intensity = count / maxDrift
    if (intensity > HIGH_DRIFT_THRESHOLD) return 'bg-red-500/30'
    if (intensity > MEDIUM_DRIFT_THRESHOLD) return 'bg-yellow-500/25'
    return 'bg-orange-500/15'
  }

  function getDriftCount(a: string, b: string): number {
    return driftMatrix.get(`${a}:${b}`) || driftMatrix.get(`${b}:${a}`) || 0
  }

  if (!isLoading && driftInsightsRaw.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
        <Diff className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No config drift detected</p>
        <p className="text-xs mt-1">Shared workloads have consistent configuration</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-1">
      <CardControlsRow
        cardControls={{
          limit,
          onLimitChange: setLimit,
          sortBy,
          sortOptions: INSIGHT_SORT_OPTIONS,
          onSortChange: (v) => setSortBy(v as InsightSortField),
          sortDirection,
          onSortDirectionChange: setSortDirection,
        }}
      />

      {/* Heatmap */}
      {clusters.length >= 2 && (
        <div className="overflow-x-auto">
          <table className="w-full text-2xs">
            <thead>
              <tr>
                <th className="p-1 text-left text-muted-foreground" />
                {(clusters || []).map(c => (
                  <th key={c} className="p-1 text-center text-muted-foreground max-w-16 truncate" title={c}>
                    {c.length > COLUMN_HEADER_MAX_LEN ? c.slice(0, COLUMN_HEADER_TRUNCATE_LEN) + '..' : c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(clusters || []).map((row, ri) => (
                <tr key={row}>
                  <td className="p-1 text-muted-foreground max-w-20 truncate" title={row}>
                    {row.length > ROW_LABEL_MAX_LEN ? row.slice(0, ROW_LABEL_TRUNCATE_LEN) + '..' : row}
                  </td>
                  {(clusters || []).map((col, ci) => {
                    if (ri === ci) {
                      return <td key={col} className="p-1"><div className="w-6 h-6 bg-secondary/30 rounded" /></td>
                    }
                    const count = getDriftCount(row, col)
                    return (
                      <td key={col} className="p-1">
                        <div
                          className={`w-6 h-6 rounded flex items-center justify-center cursor-pointer hover:ring-1 hover:ring-foreground/20 ${getDriftColor(count)}`}
                          title={`${row} ↔ ${col}: ${count} drift items`}
                        >
                          {count > 0 && <span className="text-[8px] font-medium">{count}</span>}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 text-2xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-500/20" />
          <span>In sync</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-orange-500/15" />
          <span>Low drift</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-yellow-500/25" />
          <span>Medium</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-500/30" />
          <span>High</span>
        </div>
      </div>

      {/* Drift details list */}
      <div className="space-y-1 border-t border-border pt-2 max-h-32 overflow-y-auto">
        {(driftInsights || []).map(insight => (
          <div key={insight.id} className="space-y-1">
            <div
              className="flex items-center gap-2 text-xs py-1 hover:bg-secondary/30 rounded px-1"
            >
              <InsightSourceBadge source={insight.source} confidence={insight.confidence} />
              <StatusBadge
                color={insight.severity === 'warning' ? 'yellow' : 'blue'}
                size="xs"
              >
                {insight.severity}
              </StatusBadge>
              <span className="flex-1 truncate">{insight.title}</span>
              <span className="text-2xs text-muted-foreground">{insight.affectedClusters.length} clusters</span>
            </div>
            {insight.remediation && (
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-2 mt-1">
                <StatusBadge color="blue" size="xs">AI Suggestion</StatusBadge>
                <p className="text-xs text-muted-foreground">{insight.remediation}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
