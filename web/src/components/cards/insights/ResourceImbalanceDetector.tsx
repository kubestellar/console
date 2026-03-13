import { useMemo, useState } from 'react'
import { Scale, ChevronRight } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { useMultiClusterInsights } from '../../../hooks/useMultiClusterInsights'
import { useCardLoadingState } from '../CardDataContext'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { InsightSourceBadge } from './InsightSourceBadge'
import { StatusBadge } from '../../ui/StatusBadge'
import { CardControlsRow } from '../../../lib/cards/CardComponents'
import { useInsightSort, INSIGHT_SORT_OPTIONS, type InsightSortField } from './insightSortUtils'
import { CHART_GRID_STROKE, CHART_TOOLTIP_CONTENT_STYLE, CHART_TOOLTIP_FONT_SIZE_COMPACT, CHART_TICK_COLOR } from '../../../lib/constants/ui'
import { InsightDetailModal } from './InsightDetailModal'
import type { MultiClusterInsight } from '../../../types/insights'

/** Percentage threshold for coloring bars as overloaded */
const OVERLOADED_THRESHOLD_PCT = 75
/** Percentage threshold for coloring bars as underloaded */
const UNDERLOADED_THRESHOLD_PCT = 30
/** Max length for cluster name on chart Y-axis */
const CHART_LABEL_MAX_LEN = 15
/** Truncated chart label prefix length */
const CHART_LABEL_TRUNCATE_LEN = 12

export function ResourceImbalanceDetector() {
  const { insightsByCategory, isLoading, isDemoData } = useMultiClusterInsights()
  const { selectedClusters } = useGlobalFilters()
  const [modalInsight, setModalInsight] = useState<MultiClusterInsight | null>(null)

  const imbalanceInsightsRaw = useMemo(() => insightsByCategory['resource-imbalance'] || [], [insightsByCategory])
  const {
    sorted: imbalanceInsights,
    sortBy, setSortBy, sortDirection, setSortDirection, limit, setLimit,
  } = useInsightSort(imbalanceInsightsRaw)

  useCardLoadingState({
    isLoading,
    hasAnyData: imbalanceInsightsRaw.length > 0,
    isDemoData,
  })

  // Build chart data from the first (CPU) insight's metrics
  const chartData = useMemo(() => {
    const insight = imbalanceInsights[0]
    if (!insight?.metrics) return []
    return Object.entries(insight.metrics)
      .filter(([name]) => selectedClusters.length === 0 || selectedClusters.includes(name))
      .map(([name, value]) => ({
        name: name.length > CHART_LABEL_MAX_LEN ? name.slice(0, CHART_LABEL_TRUNCATE_LEN) + '...' : name,
        fullName: name,
        value,
        fill: value > OVERLOADED_THRESHOLD_PCT ? '#ef4444' : value < UNDERLOADED_THRESHOLD_PCT ? '#3b82f6' : '#22c55e',
      }))
      .sort((a, b) => b.value - a.value)
  }, [imbalanceInsights, selectedClusters])

  const avgValue = chartData.length > 0
    ? Math.round(chartData.reduce((sum, d) => sum + d.value, 0) / chartData.length)
    : 0

  if (!isLoading && imbalanceInsightsRaw.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
        <Scale className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No resource imbalance detected</p>
        <p className="text-xs mt-1">All clusters are within normal utilization range</p>
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

      {(imbalanceInsights || []).map(insight => (
        <div
          key={insight.id}
          role="button"
          tabIndex={0}
          onClick={() => setModalInsight(insight)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setModalInsight(insight) } }}
          className="group space-y-2 cursor-pointer hover:bg-secondary/30 rounded-lg p-1 -m-1 transition-colors"
        >
          <div className="flex items-center gap-2">
            <InsightSourceBadge source={insight.source} confidence={insight.confidence} />
            <StatusBadge
              color={insight.severity === 'critical' ? 'red' : insight.severity === 'warning' ? 'yellow' : 'blue'}
              size="xs"
            >
              {insight.severity}
            </StatusBadge>
            <span className="text-xs text-muted-foreground flex-1">{insight.title}</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <p className="text-xs text-muted-foreground">{insight.description}</p>
        </div>
      ))}

      {chartData.length > 0 && (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: CHART_TICK_COLOR }} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: CHART_TICK_COLOR }} width={100} />
              <Tooltip
                contentStyle={{ ...CHART_TOOLTIP_CONTENT_STYLE, fontSize: CHART_TOOLTIP_FONT_SIZE_COMPACT }}
                formatter={((value: number) => [`${value}%`, 'Usage']) as never}
              />
              <ReferenceLine x={avgValue} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: `Avg ${avgValue}%`, position: 'top', fontSize: 10, fill: '#f59e0b' }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Remediation suggestions */}
      {(imbalanceInsights || []).map(insight => insight.remediation && (
        <div key={`${insight.id}-rem`} className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-2 mt-1">
          <StatusBadge color="blue" size="xs">AI Suggestion</StatusBadge>
          <p className="text-xs text-muted-foreground">{insight.remediation}</p>
        </div>
      ))}

      <InsightDetailModal
        isOpen={!!modalInsight}
        onClose={() => setModalInsight(null)}
        insight={modalInsight}
      />
    </div>
  )
}
