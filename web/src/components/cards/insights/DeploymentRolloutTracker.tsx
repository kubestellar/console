import { useMemo, useState } from 'react'
import { Rocket, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useMultiClusterInsights } from '../../../hooks/useMultiClusterInsights'
import { useCardLoadingState } from '../CardDataContext'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { InsightSourceBadge } from './InsightSourceBadge'
import { StatusBadge } from '../../ui/StatusBadge'
import { CardControlsRow } from '../../../lib/cards/CardComponents'
import { useInsightSort, INSIGHT_SORT_OPTIONS, type InsightSortField } from './insightSortUtils'
import { CHART_GRID_STROKE, CHART_TOOLTIP_BG, CHART_TOOLTIP_BORDER, CHART_TICK_COLOR } from '../../../lib/constants/ui'

/** Color for completed rollout progress */
const COMPLETE_COLOR = '#22c55e'
/** Color for in-progress rollout */
const PROGRESS_COLOR = '#3b82f6'
/** Color for failed rollout */
const FAILED_COLOR = '#ef4444'
/** Color for pending rollout */
const PENDING_COLOR = '#6b7280'

/** Full progress percentage */
const FULL_PROGRESS_PCT = 100

function getProgressColor(status: string): string {
  if (status === 'complete') return COMPLETE_COLOR
  if (status === 'failed') return FAILED_COLOR
  if (status === 'pending') return PENDING_COLOR
  return PROGRESS_COLOR
}

function getStatusIcon(status: string) {
  if (status === 'complete') return <CheckCircle2 className="w-3 h-3 text-green-400" />
  if (status === 'failed') return <AlertTriangle className="w-3 h-3 text-red-400" />
  if (status === 'pending') return <Clock className="w-3 h-3 text-gray-400" />
  return <Rocket className="w-3 h-3 text-blue-400" />
}

export function DeploymentRolloutTracker() {
  const { insightsByCategory, isLoading, isDemoData } = useMultiClusterInsights()
  const { selectedClusters } = useGlobalFilters()

  const rolloutInsightsRaw = useMemo(() => {
    const all = insightsByCategory['rollout-tracker'] || []
    if (selectedClusters.length === 0) return all
    return all.filter(i =>
      (i.affectedClusters || []).some(c => selectedClusters.includes(c)),
    )
  }, [insightsByCategory, selectedClusters])
  const {
    sorted: rolloutInsights,
    sortBy, setSortBy, sortDirection, setSortDirection, limit, setLimit,
  } = useInsightSort(rolloutInsightsRaw)

  useCardLoadingState({
    isLoading,
    hasAnyData: rolloutInsightsRaw.length > 0,
    isDemoData,
  })

  const [selectedRollout, setSelectedRollout] = useState(0)
  const insight = rolloutInsights[selectedRollout] || rolloutInsights[0]

  // Build per-cluster progress data from insight metrics
  const clusterProgress = useMemo(() => {
    if (!insight?.metrics) return []
    const clusters = insight.affectedClusters || []
    return (clusters || []).map(cluster => {
      const progress = insight.metrics?.[`${cluster}_progress`] ?? 0
      const statusKey = `${cluster}_status`
      const status = insight.metrics?.[statusKey] !== undefined
        ? (['pending', 'in-progress', 'complete', 'failed'][insight.metrics[statusKey]] || 'pending')
        : (progress >= FULL_PROGRESS_PCT ? 'complete' : progress > 0 ? 'in-progress' : 'pending')
      return {
        cluster,
        progress: typeof progress === 'number' ? progress : 0,
        status,
      }
    })
  }, [insight])

  if (!isLoading && rolloutInsightsRaw.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
        <Rocket className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No active rollouts detected</p>
        <p className="text-xs mt-1">All deployments are at consistent versions</p>
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

      {/* Rollout selector */}
      {rolloutInsights.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {(rolloutInsights || []).map((ins, i) => (
            <button
              key={ins.id}
              onClick={() => setSelectedRollout(i)}
              className={`text-2xs px-2 py-1 rounded whitespace-nowrap ${
                i === selectedRollout
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
            <span className="text-xs font-medium flex-1">{insight.title}</span>
          </div>
          <p className="text-xs text-muted-foreground">{insight.description}</p>

          {/* Per-cluster progress chart */}
          {clusterProgress.length > 0 && (
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={clusterProgress}
                  layout="vertical"
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                  <XAxis
                    type="number"
                    domain={[0, FULL_PROGRESS_PCT]}
                    tick={{ fontSize: 9, fill: CHART_TICK_COLOR }}
                    tickFormatter={v => `${v}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="cluster"
                    tick={{ fontSize: 9, fill: CHART_TICK_COLOR }}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: CHART_TOOLTIP_BG,
                      border: `1px solid ${CHART_TOOLTIP_BORDER}`,
                      borderRadius: 6,
                      fontSize: 11,
                    }}
                    formatter={((value: number) => [`${value}%`, 'Progress']) as never}
                  />
                  <Bar dataKey="progress" radius={[0, 4, 4, 0]}>
                    {(clusterProgress || []).map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={getProgressColor(entry.status)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Per-cluster status list */}
          {clusterProgress.length > 0 && (
            <div className="space-y-1">
              {(clusterProgress || []).map(cp => (
                <div key={cp.cluster} className="flex items-center gap-2 text-xs">
                  {getStatusIcon(cp.status)}
                  <span className="font-medium min-w-20">{cp.cluster}</span>
                  <div className="flex-1 bg-secondary/30 rounded-full h-1.5">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${cp.progress}%`,
                        backgroundColor: getProgressColor(cp.status),
                      }}
                    />
                  </div>
                  <span className="text-2xs text-muted-foreground w-10 text-right">{cp.progress}%</span>
                </div>
              ))}
            </div>
          )}

          {/* AI remediation */}
          {insight.remediation && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-2">
              <div className="flex items-center gap-1 mb-1">
                <StatusBadge color="blue" size="xs">AI Suggestion</StatusBadge>
              </div>
              <p className="text-xs text-muted-foreground">{insight.remediation}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
