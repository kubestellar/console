/**
 * ResourceUtilization — Experiment comparison at selected QPS
 *
 * Horizontal grouped bar chart comparing all experiment variants.
 * Shows throughput, TTFT, TPOT, and p99 latency side by side.
 * Highlight best-in-class for each metric.
 */
import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from 'recharts'
import { BarChart3, Trophy } from 'lucide-react'
import { useReportCardDataState } from '../CardDataContext'
import { useCachedBenchmarkReports } from '../../../hooks/useBenchmarkData'
import { generateBenchmarkReports } from '../../../lib/llmd/benchmarkMockData'
import {
  groupByExperiment,
  getFilterOptions,
  CONFIG_TYPE_COLORS,
} from '../../../lib/llmd/benchmarkDataUtils'
import { useTranslation } from 'react-i18next'

type MetricMode = 'throughput' | 'ttftP50Ms' | 'tpotP50Ms' | 'p99LatencyMs'

const MODES: { key: MetricMode; label: string; unit: string; higherBetter: boolean }[] = [
  { key: 'throughput', label: 'Throughput', unit: 'tok/s', higherBetter: true },
  { key: 'ttftP50Ms', label: 'TTFT p50', unit: 'ms', higherBetter: false },
  { key: 'tpotP50Ms', label: 'TPOT p50', unit: 'ms', higherBetter: false },
  { key: 'p99LatencyMs', label: 'p99 Latency', unit: 'ms', higherBetter: false },
]

interface BarEntry {
  name: string
  value: number
  config: string
  color: string
  isBest: boolean
  fullVariant: string
}

function CustomTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ payload: BarEntry }>
}) {
  if (!active || !payload?.[0]) return null
  const p = payload[0].payload
  return (
    <div className="bg-slate-900 backdrop-blur-sm border border-slate-700 rounded-lg p-3 shadow-xl text-xs">
      <div className="text-white font-medium mb-1">{p.fullVariant}</div>
      <div className="flex items-center gap-2">
        <span className="text-slate-300">Value:</span>
        <span className="font-mono text-white">{p.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
        {p.isBest && <Trophy size={12} className="text-amber-400" />}
      </div>
      <div className="mt-1 text-slate-400">
        Type: <span style={{ color: CONFIG_TYPE_COLORS[p.config as keyof typeof CONFIG_TYPE_COLORS] }}>{p.config}</span>
      </div>
    </div>
  )
}

export function ResourceUtilization() {
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
  const [mode, setMode] = useState<MetricMode>('throughput')
  const [category, setCategory] = useState<string>('all')
  const groups = useMemo(() => groupByExperiment(effectiveReports, {
    category: category !== 'all' ? category : undefined,
  }), [effectiveReports, category])

  // Get available QPS values and default to highest
  const qpsValues = useMemo(() => {
    const vals = new Set<number>()
    groups.forEach(g => g.points.forEach(p => vals.add(p.qps)))
    return [...vals].sort((a, b) => a - b)
  }, [groups])

  const [qpsFilter, setQpsFilter] = useState<number>(0)
  const effectiveQps = qpsFilter || (qpsValues.length > 0 ? qpsValues[qpsValues.length - 1] : 0)

  const modeInfo = MODES.find(m => m.key === mode)!

  const { data, bestVariant, bestValue } = useMemo(() => {
    const entries: BarEntry[] = []

    for (const g of groups) {
      const pt = g.points.find(p => p.qps === effectiveQps)
      if (!pt) continue
      const val = mode === 'throughput' ? pt.throughput : pt[mode]
      entries.push({
        name: g.shortVariant,
        value: val,
        config: g.config,
        color: g.color,
        isBest: false,
        fullVariant: `${g.category} / ${g.shortVariant}`,
      })
    }

    // Mark best
    if (entries.length > 0) {
      const sorted = [...entries].sort((a, b) =>
        modeInfo.higherBetter ? b.value - a.value : a.value - b.value
      )
      sorted[0].isBest = true
    }

    const best = entries.find(e => e.isBest)

    return {
      data: entries.sort((a, b) =>
        modeInfo.higherBetter ? b.value - a.value : a.value - b.value
      ),
      bestVariant: best?.name ?? '',
      bestValue: best?.value ?? 0,
    }
  }, [groups, effectiveQps, mode, modeInfo.higherBetter])

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-emerald-400" />
          <span className="text-sm font-medium text-white">Experiment Comparison</span>
          {bestVariant && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400">
              <Trophy size={10} />
              Best: {bestVariant} ({bestValue.toLocaleString(undefined, { maximumFractionDigits: 1 })} {modeInfo.unit})
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
            value={qpsFilter}
            onChange={e => setQpsFilter(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px] text-white"
          >
            <option value={0}>Peak QPS ({effectiveQps})</option>
            {qpsValues.map(q => <option key={q} value={q}>QPS {q}</option>)}
          </select>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 mb-3 bg-slate-800/80 rounded-lg p-0.5 w-fit">
        {MODES.map(m => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
              mode === m.key ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0" style={{ minHeight: 200 }}>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} horizontal={false} />
              <XAxis
                type="number"
                stroke="#71717a"
                fontSize={10}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))}
              />
              <YAxis
                type="category"
                dataKey="name"
                stroke="#71717a"
                fontSize={10}
                width={140}
                tick={(props: Record<string, unknown>) => {
                  const x = Number(props.x ?? 0)
                  const y = Number(props.y ?? 0)
                  const value = String((props.payload as { value?: string })?.value ?? '')
                  const entry = data.find(d => d.name === value)
                  return (
                    <g>
                      <text x={x} y={y} dy={4} textAnchor="end" fill={entry?.isBest ? '#fbbf24' : '#a1a1aa'} fontSize={10} fontWeight={entry?.isBest ? 600 : 400}>
                        {entry?.isBest ? '\u2605 ' : ''}{value}
                      </text>
                    </g>
                  )
                }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                {data.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.color}
                    fillOpacity={entry.isBest ? 1 : 0.7}
                    stroke={entry.isBest ? '#fbbf24' : 'none'}
                    strokeWidth={entry.isBest ? 2 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500 text-sm">
            No data for QPS {effectiveQps}
          </div>
        )}
      </div>

      {/* Config type legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-[10px]">
        {Object.entries(CONFIG_TYPE_COLORS).map(([cfg, color]) => (
          <div key={cfg} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: color }} />
            <span className="text-slate-400">{cfg}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ResourceUtilization
