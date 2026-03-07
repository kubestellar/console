import { useMemo } from 'react'
import { Scale } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { useMultiClusterInsights } from '../../../hooks/useMultiClusterInsights'
import { useCardLoadingState } from '../CardDataContext'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { InsightSourceBadge } from './InsightSourceBadge'
import { StatusBadge } from '../../ui/StatusBadge'
import { CHART_GRID_STROKE, CHART_TOOLTIP_BG, CHART_TOOLTIP_BORDER, CHART_TICK_COLOR } from '../../../lib/constants/ui'

/** Percentage threshold for coloring bars as overloaded */
const OVERLOADED_THRESHOLD_PCT = 75
/** Percentage threshold for coloring bars as underloaded */
const UNDERLOADED_THRESHOLD_PCT = 30

export function ResourceImbalanceDetector() {
  const { insightsByCategory, isLoading, isDemoData } = useMultiClusterInsights()
  const { selectedClusters } = useGlobalFilters()

  const imbalanceInsights = useMemo(() => insightsByCategory['resource-imbalance'] || [], [insightsByCategory])

  useCardLoadingState({
    isLoading,
    hasAnyData: imbalanceInsights.length > 0,
    isDemoData,
  })

  // Build chart data from the first (CPU) insight's metrics
  const chartData = useMemo(() => {
    const insight = imbalanceInsights[0]
    if (!insight?.metrics) return []
    return Object.entries(insight.metrics)
      .filter(([name]) => selectedClusters.length === 0 || selectedClusters.includes(name))
      .map(([name, value]) => ({
        name: name.length > 15 ? name.slice(0, 12) + '...' : name,
        fullName: name,
        value,
        fill: value > OVERLOADED_THRESHOLD_PCT ? '#ef4444' : value < UNDERLOADED_THRESHOLD_PCT ? '#3b82f6' : '#22c55e',
      }))
      .sort((a, b) => b.value - a.value)
  }, [imbalanceInsights, selectedClusters])

  const avgValue = chartData.length > 0
    ? Math.round(chartData.reduce((sum, d) => sum + d.value, 0) / chartData.length)
    : 0

  if (!isLoading && imbalanceInsights.length === 0) {
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
      {(imbalanceInsights || []).map(insight => (
        <div key={insight.id} className="space-y-2">
          <div className="flex items-center gap-2">
            <InsightSourceBadge source={insight.source} confidence={insight.confidence} />
            <StatusBadge
              color={insight.severity === 'critical' ? 'red' : insight.severity === 'warning' ? 'yellow' : 'blue'}
              size="xs"
            >
              {insight.severity}
            </StatusBadge>
            <span className="text-xs text-muted-foreground flex-1">{insight.title}</span>
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
                contentStyle={{ backgroundColor: CHART_TOOLTIP_BG, border: `1px solid ${CHART_TOOLTIP_BORDER}`, borderRadius: 6, fontSize: 11 }}
                formatter={((value: number) => [`${value}%`, 'Usage']) as never}
              />
              <ReferenceLine x={avgValue} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: `Avg ${avgValue}%`, position: 'top', fontSize: 10, fill: '#f59e0b' }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
