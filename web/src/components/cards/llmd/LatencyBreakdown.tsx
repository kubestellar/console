/**
 * LatencyBreakdown — Latency metrics under increasing load
 *
 * Line chart: X = QPS (queries/sec), Y = latency (ms).
 * Tabs for TTFT p50, TPOT p50, p99 Request Latency, ITL.
 * Shows how latency degrades as load increases.
 */
import { useState, useMemo } from 'react'
import {
  Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Area, ComposedChart, ReferenceLine,
} from 'recharts'
import { Clock, AlertTriangle } from 'lucide-react'
import { useReportCardDataState } from '../CardDataContext'
import { useCachedBenchmarkReports } from '../../../hooks/useBenchmarkData'
import {
  generateBenchmarkReports,
} from '../../../lib/llmd/benchmarkMockData'
import {
  groupByExperiment,
  getFilterOptions,
  type ScalingPoint,
} from '../../../lib/llmd/benchmarkDataUtils'
import { useTranslation } from 'react-i18next'

type MetricTab = 'ttftP50Ms' | 'tpotP50Ms' | 'p99LatencyMs' | 'itlP50Ms' | 'requestLatencyMs'

const TABS: { key: MetricTab; label: string; unit: string; sla?: number }[] = [
  { key: 'ttftP50Ms', label: 'TTFT p50', unit: 'ms', sla: 100 },
  { key: 'tpotP50Ms', label: 'TPOT p50', unit: 'ms' },
  { key: 'p99LatencyMs', label: 'p99 Latency', unit: 'ms', sla: 5000 },
  { key: 'itlP50Ms', label: 'ITL p50', unit: 'ms' },
  { key: 'requestLatencyMs', label: 'Request p50', unit: 'ms' },
]

interface ChartRow {
  qps: number
  [lineKey: string]: number | undefined
}

function CustomTooltip({ active, payload, label, unit }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: number
  unit?: string
}) {
  if (!active || !payload?.length) return null
  const sorted = [...payload].filter(p => p.value !== undefined).sort((a, b) => (a.value ?? 0) - (b.value ?? 0))
  return (
    <div className="bg-slate-900 backdrop-blur-sm border border-slate-700 rounded-lg p-3 shadow-xl text-xs max-w-xs">
      <div className="text-white font-medium mb-2">QPS: {label}</div>
      {sorted.map(p => (
        <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-slate-300 truncate">{p.name}</span>
          </div>
          <span className="font-mono text-white shrink-0">{p.value.toFixed(1)} {unit}</span>
        </div>
      ))}
    </div>
  )
}

export function LatencyBreakdown() {
  const { t: _t } = useTranslation()
  const { data: liveReports, isDemoFallback, isFailed, consecutiveFailures, isLoading, isRefreshing } = useCachedBenchmarkReports()
  const effectiveReports = useMemo(
    () => isDemoFallback ? generateBenchmarkReports() : (liveReports ?? []),
    [isDemoFallback, liveReports]
  )
  useReportCardDataState({
    isDemoData: isDemoFallback, isFailed, consecutiveFailures, isLoading, isRefreshing,
    hasData: effectiveReports.length > 0,
  })

  const filterOpts = useMemo(() => getFilterOptions(effectiveReports), [effectiveReports])
  const [tab, setTab] = useState<MetricTab>('ttftP50Ms')
  const [category, setCategory] = useState<string>('all')
  const [islFilter, setIslFilter] = useState<number>(0)
  const [oslFilter, setOslFilter] = useState<number>(0)

  const tabInfo = TABS.find(t => t.key === tab)!

  const groups = useMemo(() => groupByExperiment(effectiveReports, {
    category: category !== 'all' ? category : undefined,
    isl: islFilter || undefined,
    osl: oslFilter || undefined,
  }), [effectiveReports, category, islFilter, oslFilter])

  const { chartData, maxLatency } = useMemo(() => {
    const qpsSet = new Set<number>()
    groups.forEach(g => g.points.forEach(p => qpsSet.add(p.qps)))
    const allQps = [...qpsSet].sort((a, b) => a - b)

    let maxLat = 0
    const data: ChartRow[] = allQps.map(qps => {
      const row: ChartRow = { qps }
      for (const g of groups) {
        const pt = g.points.find(p => p.qps === qps)
        const val = pt?.[tab as keyof ScalingPoint] as number | undefined
        row[g.shortVariant] = val
        if (val && val > maxLat) maxLat = val
      }
      return row
    })
    return { chartData: data, maxLatency: maxLat }
  }, [groups, tab])

  // Find worst offender at max QPS
  const degradationWarning = useMemo(() => {
    if (groups.length === 0) return null
    let worstIncrease = 0
    let worstVariant = ''
    for (const g of groups) {
      if (g.points.length < 2) continue
      const first = g.points[0]?.[tab as keyof ScalingPoint] as number
      const last = g.points[g.points.length - 1]?.[tab as keyof ScalingPoint] as number
      if (first > 0) {
        const increase = ((last / first) - 1) * 100
        if (increase > worstIncrease) {
          worstIncrease = increase
          worstVariant = g.shortVariant
        }
      }
    }
    return worstIncrease > 50 ? { variant: worstVariant, increase: worstIncrease } : null
  }, [groups, tab])

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-amber-400" />
          <span className="text-sm font-medium text-white">Latency Under Load</span>
          {degradationWarning && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/15 text-red-400">
              <AlertTriangle size={10} />
              {degradationWarning.variant}: +{degradationWarning.increase.toFixed(0)}% at peak
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px] text-white"
          >
            <option value="all">All Categories</option>
            {filterOpts.categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={islFilter}
            onChange={e => setIslFilter(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px] text-white"
          >
            <option value={0}>All ISL</option>
            {filterOpts.islValues.map(v => <option key={v} value={v}>ISL {v}</option>)}
          </select>
          <select
            value={oslFilter}
            onChange={e => setOslFilter(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px] text-white"
          >
            <option value={0}>All OSL</option>
            {filterOpts.oslValues.map(v => <option key={v} value={v}>OSL {v}</option>)}
          </select>
        </div>
      </div>

      {/* Metric tabs */}
      <div className="flex gap-1 mb-3 bg-slate-800/80 rounded-lg p-0.5 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
              tab === t.key ? 'bg-amber-500/20 text-amber-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0" style={{ minHeight: 200 }}>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 30, left: 15 }}>
              <defs>
                {groups.map(g => (
                  <linearGradient key={g.shortVariant} id={`lat-grad-${g.shortVariant.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={g.color} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={g.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.5} />
              <XAxis
                dataKey="qps"
                stroke="#71717a"
                fontSize={10}
                label={{ value: 'QPS (queries/sec)', position: 'insideBottom', offset: -15, fill: '#71717a', fontSize: 10 }}
              />
              <YAxis
                stroke="#71717a"
                fontSize={10}
                label={{ value: tabInfo.unit, angle: -90, position: 'insideLeft', offset: 5, fill: '#71717a', fontSize: 10 }}
              />
              <Tooltip content={<CustomTooltip unit={tabInfo.unit} />} />

              {/* SLA reference line */}
              {tabInfo.sla && maxLatency > tabInfo.sla * 0.5 && (
                <ReferenceLine
                  y={tabInfo.sla}
                  stroke="#ef4444"
                  strokeDasharray="6 3"
                  strokeOpacity={0.6}
                  label={{ value: `SLA: ${tabInfo.sla}ms`, fill: '#ef4444', fontSize: 9, position: 'right' }}
                />
              )}

              {groups.map(g => (
                <Area
                  key={`area-${g.shortVariant}`}
                  type="monotone"
                  dataKey={g.shortVariant}
                  fill={`url(#lat-grad-${g.shortVariant.replace(/\W/g, '')})`}
                  stroke="none"
                />
              ))}
              {groups.map(g => (
                <Line
                  key={g.shortVariant}
                  type="monotone"
                  dataKey={g.shortVariant}
                  stroke={g.color}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: g.color, strokeWidth: 0 }}
                  activeDot={{ r: 5, stroke: g.color, strokeWidth: 2, fill: '#0f172a' }}
                  connectNulls
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500 text-sm">
            No data available for selected filters
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10px]">
        {groups.map(g => (
          <div key={g.shortVariant} className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: g.color }} />
            <span className="text-slate-400">{g.shortVariant}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default LatencyBreakdown
