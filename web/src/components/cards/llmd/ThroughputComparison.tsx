/**
 * ThroughputComparison — Throughput scaling under increasing load
 *
 * Line chart: X = QPS (queries/sec), Y = output throughput (tok/s).
 * One line per experiment variant. Shows how throughput scales with load.
 * Filter by experiment category, ISL/OSL, and model.
 */
import { useState, useMemo } from 'react'
import {
  Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Area, ComposedChart,
} from 'recharts'
import { Zap, TrendingUp } from 'lucide-react'
import { useReportCardDataState } from '../CardDataContext'
import { useCachedBenchmarkReports } from '../../../hooks/useBenchmarkData'
import {
  generateBenchmarkReports,
} from '../../../lib/llmd/benchmarkMockData'
import {
  groupByExperiment,
  getFilterOptions,
  type ExperimentGroup,
} from '../../../lib/llmd/benchmarkDataUtils'
import { useTranslation } from 'react-i18next'

interface ChartRow {
  qps: number
  [lineKey: string]: number | undefined
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: number
}) {
  if (!active || !payload?.length) return null
  const sorted = [...payload].filter(p => p.value !== undefined).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  return (
    <div className="bg-slate-900 backdrop-blur-sm border border-slate-700 rounded-lg p-3 shadow-xl text-xs max-w-xs">
      <div className="text-white font-medium mb-2">QPS: {label}</div>
      {sorted.map(p => (
        <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-slate-300 truncate">{p.name}</span>
          </div>
          <span className="font-mono text-white shrink-0">{p.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
      ))}
    </div>
  )
}

export function ThroughputComparison() {
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
  const [category, setCategory] = useState<string>('all')
  const [islFilter, setIslFilter] = useState<number>(0)
  const [oslFilter, setOslFilter] = useState<number>(0)

  const groups = useMemo(() => groupByExperiment(effectiveReports, {
    category: category !== 'all' ? category : undefined,
    isl: islFilter || undefined,
    osl: oslFilter || undefined,
  }), [effectiveReports, category, islFilter, oslFilter])

  // Build chart data: one row per QPS, columns per experiment
  const { chartData } = useMemo(() => {
    const qpsSet = new Set<number>()
    groups.forEach(g => g.points.forEach(p => qpsSet.add(p.qps)))
    const allQps = [...qpsSet].sort((a, b) => a - b)

    const keys = groups.map(g => g.shortVariant)
    const data: ChartRow[] = allQps.map(qps => {
      const row: ChartRow = { qps }
      for (const g of groups) {
        const pt = g.points.find(p => p.qps === qps)
        row[g.shortVariant] = pt?.throughput
      }
      return row
    })
    return { chartData: data, lineKeys: keys }
  }, [groups])

  // Peak throughput summary
  const peakInfo = useMemo(() => {
    let best: ExperimentGroup | null = null
    let bestVal = 0
    for (const g of groups) {
      const peak = Math.max(...g.points.map(p => p.throughput))
      if (peak > bestVal) { bestVal = peak; best = g }
    }
    return best ? { variant: best.shortVariant, value: bestVal } : null
  }, [groups])

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-blue-400" />
          <span className="text-sm font-medium text-white">Throughput Scaling</span>
          {peakInfo && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/15 text-blue-400">
              <TrendingUp size={10} />
              Peak: {peakInfo.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} tok/s
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

      {/* Chart */}
      <div className="flex-1 min-h-0" style={{ minHeight: 200 }}>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 30, left: 15 }}>
              <defs>
                {groups.map(g => (
                  <linearGradient key={g.shortVariant} id={`grad-${g.shortVariant.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={g.color} stopOpacity={0.2} />
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
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                label={{ value: 'tok/s', angle: -90, position: 'insideLeft', offset: 5, fill: '#71717a', fontSize: 10 }}
              />
              <Tooltip content={<CustomTooltip />} />
              {groups.map(g => (
                <Area
                  key={`area-${g.shortVariant}`}
                  type="monotone"
                  dataKey={g.shortVariant}
                  fill={`url(#grad-${g.shortVariant.replace(/\W/g, '')})`}
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

export default ThroughputComparison
