import { useMemo, useState } from 'react'
import { Activity, ChevronRight } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useMultiClusterInsights } from '../../../hooks/useMultiClusterInsights'
import { useCachedWarningEvents } from '../../../hooks/useCachedData'
import { useCardLoadingState } from '../CardDataContext'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { InsightSourceBadge } from './InsightSourceBadge'
import { StatusBadge } from '../../ui/StatusBadge'
import { CardControlsRow } from '../../../lib/cards/CardComponents'
import { useInsightSort, INSIGHT_SORT_OPTIONS, type InsightSortField } from './insightSortUtils'
import { CHART_GRID_STROKE, CHART_TOOLTIP_BG, CHART_TOOLTIP_BORDER, CHART_TICK_COLOR } from '../../../lib/constants/ui'
import { InsightDetailModal } from './InsightDetailModal'
import type { MultiClusterInsight } from '../../../types/insights'

/** Time bucket size for the timeline chart (2 minutes) */
const TIMELINE_BUCKET_MS = 2 * 60 * 1000
/** Maximum number of buckets to show on the chart */
const MAX_TIMELINE_BUCKETS = 30

/** Color palette for cluster series in the stacked area chart */
const CLUSTER_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
]

export function CrossClusterEventCorrelation() {
  const { insightsByCategory, isLoading, isDemoData } = useMultiClusterInsights()
  const { events: warningEvents } = useCachedWarningEvents()
  const { selectedClusters } = useGlobalFilters()
  const [selectedInsight, setSelectedInsight] = useState<MultiClusterInsight | null>(null)

  const correlationInsightsRaw = insightsByCategory['event-correlation'] || []
  const {
    sorted: correlationInsights,
    sortBy, setSortBy, sortDirection, setSortDirection, limit, setLimit,
  } = useInsightSort(correlationInsightsRaw)

  useCardLoadingState({
    isLoading,
    hasAnyData: correlationInsightsRaw.length > 0 || (warningEvents || []).length > 0,
    isDemoData,
  })

  // Build timeline chart data from warning events
  const { chartData, clusterNames } = useMemo(() => {
    const filtered = (warningEvents || []).filter(
      e => e.cluster && e.lastSeen && (selectedClusters.length === 0 || selectedClusters.includes(e.cluster)),
    )
    if (filtered.length === 0) return { chartData: [], clusterNames: [] }

    const clusters = [...new Set((filtered || []).map(e => e.cluster!))]
    const buckets = new Map<number, Record<string, number>>()

    for (const event of filtered) {
      const ts = new Date(event.lastSeen!).getTime()
      const bucket = Math.floor(ts / TIMELINE_BUCKET_MS) * TIMELINE_BUCKET_MS
      if (!buckets.has(bucket)) {
        const entry: Record<string, number> = {}
        for (const c of clusters) entry[c] = 0
        buckets.set(bucket, entry)
      }
      buckets.get(bucket)![event.cluster!] += event.count || 1
    }

    const sorted = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(-MAX_TIMELINE_BUCKETS)
      .map(([ts, counts]) => ({
        time: new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        ts,
        ...counts,
      }))

    return { chartData: sorted, clusterNames: clusters }
  }, [warningEvents, selectedClusters])

  if (!isLoading && correlationInsightsRaw.length === 0 && chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
        <Activity className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No cross-cluster event correlations detected</p>
        <p className="text-xs mt-1">Warning events are isolated to individual clusters</p>
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

      {/* Timeline chart */}
      {chartData.length > 0 && (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: CHART_TICK_COLOR }} />
              <YAxis tick={{ fontSize: 9, fill: CHART_TICK_COLOR }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: CHART_TOOLTIP_BG,
                  border: `1px solid ${CHART_TOOLTIP_BORDER}`,
                  borderRadius: 6,
                  fontSize: 11,
                }}
              />
              {(clusterNames || []).map((cluster, i) => (
                <Area
                  key={cluster}
                  type="monotone"
                  dataKey={cluster}
                  stackId="1"
                  stroke={CLUSTER_COLORS[i % CLUSTER_COLORS.length]}
                  fill={CLUSTER_COLORS[i % CLUSTER_COLORS.length]}
                  fillOpacity={0.3}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legend */}
      {clusterNames.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(clusterNames || []).map((cluster, i) => (
            <div key={cluster} className="flex items-center gap-1">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: CLUSTER_COLORS[i % CLUSTER_COLORS.length] }}
              />
              <span className="text-2xs text-muted-foreground">{cluster}</span>
            </div>
          ))}
        </div>
      )}

      {/* Correlation insights */}
      {correlationInsights.length > 0 && (
        <div className="space-y-2 border-t border-border pt-2">
          <span className="text-xs font-medium text-muted-foreground">Detected Correlations</span>
          {(correlationInsights || []).map(insight => (
            <div
              key={insight.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedInsight(insight)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedInsight(insight) } }}
              className="group bg-red-500/5 border border-red-500/20 rounded-lg p-2.5 space-y-1 cursor-pointer hover:bg-red-500/10 transition-colors"
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
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-xs text-muted-foreground">{insight.description}</p>
              {insight.remediation && (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-2 mt-1">
                  <StatusBadge color="blue" size="xs">AI Suggestion</StatusBadge>
                  <p className="text-xs text-muted-foreground">{insight.remediation}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <InsightDetailModal
        isOpen={!!selectedInsight}
        onClose={() => setSelectedInsight(null)}
        insight={selectedInsight}
      />
    </div>
  )
}
