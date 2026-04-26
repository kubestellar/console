import { useMemo, useState } from 'react'
import { Scale, ChevronRight } from 'lucide-react'
import { LazyEChart } from '../../charts/LazyEChart'
import { useMultiClusterInsights } from '../../../hooks/useMultiClusterInsights'
import { useCardLoadingState } from '../CardDataContext'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { InsightSourceBadge } from './InsightSourceBadge'
import { StatusBadge } from '../../ui/StatusBadge'
import { CardControlsRow } from '../../../lib/cards/CardComponents'
import { useInsightSort, INSIGHT_SORT_OPTIONS, type InsightSortField } from './insightSortUtils'
import { CHART_GRID_STROKE, CHART_TOOLTIP_CONTENT_STYLE, CHART_TOOLTIP_FONT_SIZE_COMPACT, CHART_TICK_COLOR, CHART_HEIGHT_LG, CHART_TOOLTIP_TEXT_COLOR, CHART_AXIS_FONT_SIZE } from '../../../lib/constants/ui'

const GRID_LEFT_PX = 105
const GRID_RIGHT_PX = 20
const GRID_TOP_PX = 15
const GRID_BOTTOM_PX = 20
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

  const imbalanceInsightsRaw = insightsByCategory['resource-imbalance'] || []
  const {
    sorted: imbalanceInsights,
    sortBy, setSortBy, sortDirection, setSortDirection, limit, setLimit } = useInsightSort(imbalanceInsightsRaw)

  const hasData = imbalanceInsightsRaw.length > 0
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    hasAnyData: hasData,
    isDemoData })

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
        fill: value > OVERLOADED_THRESHOLD_PCT ? '#ef4444' : value < UNDERLOADED_THRESHOLD_PCT ? '#3b82f6' : '#22c55e' }))
      .sort((a, b) => b.value - a.value)
  }, [imbalanceInsights, selectedClusters])

  const avgValue = chartData.length > 0
    ? Math.round(chartData.reduce((sum, d) => sum + d.value, 0) / chartData.length)
    : 0

  const chartOption = useMemo(() => {
    if (chartData.length === 0) return {}
    return {
      backgroundColor: 'transparent',
      grid: { left: GRID_LEFT_PX, right: GRID_RIGHT_PX, top: GRID_TOP_PX, bottom: GRID_BOTTOM_PX },
      xAxis: {
        type: 'value' as const,
        min: 0,
        max: 100,
        axisLabel: { fontSize: CHART_AXIS_FONT_SIZE, color: CHART_TICK_COLOR, formatter: (v: number) => `${v}%` },
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'category' as const,
        data: chartData.map(d => d.name),
        axisLabel: { fontSize: CHART_AXIS_FONT_SIZE, color: CHART_TICK_COLOR },
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: CHART_GRID_STROKE, type: 'dashed' as const } },
      },
      tooltip: {
        backgroundColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).backgroundColor as string,
        borderColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).borderColor as string,
        textStyle: { color: CHART_TOOLTIP_TEXT_COLOR, fontSize: Number(CHART_TOOLTIP_FONT_SIZE_COMPACT.replace('px', '')) },
        formatter: (params: { name: string; value: number }) => `${params.name}: ${params.value}%`,
      },
      series: [{
        type: 'bar',
        data: chartData.map(d => ({
          value: d.value,
          itemStyle: { color: d.fill, borderRadius: [0, 4, 4, 0] },
        })),
        markLine: {
          silent: true,
          symbol: 'none',
          data: [{
            xAxis: avgValue,
            label: { formatter: `Avg ${avgValue}%`, position: 'start', color: '#f59e0b', fontSize: CHART_AXIS_FONT_SIZE },
            lineStyle: { color: '#f59e0b', type: 'dashed' },
          }],
        },
      }],
    }
  }, [chartData, avgValue])

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
          onSortDirectionChange: setSortDirection }}
      />

      {(imbalanceInsights || []).map(insight => (
        <div
          key={insight.id}
          role="button"
          tabIndex={0}
          aria-label={`View resource imbalance: ${insight.title}`}
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
          <LazyEChart
            option={chartOption}
            style={{ height: CHART_HEIGHT_LG, width: '100%' }}
            notMerge={true}
            opts={{ renderer: 'svg' }}
          />
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
