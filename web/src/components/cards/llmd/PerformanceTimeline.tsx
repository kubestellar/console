/**
 * PerformanceTimeline — Time-series trend of nightly benchmark results
 *
 * Shows throughput/latency trends over 90 days of nightly CI runs.
 * Lines per config with confidence band. Time range selector.
 */
import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { useReportCardDataState } from '../CardDataContext'
import {
  generateTimelineReports,
  CONFIG_COLORS,
} from '../../../lib/llmd/benchmarkMockData'

type MetricKey = 'outputThroughput' | 'ttftP50Ms' | 'tpotP50Ms' | 'p99LatencyMs'
type TimeRange = 7 | 30 | 90

const METRICS: { key: MetricKey; label: string; unit: string; higherBetter: boolean }[] = [
  { key: 'outputThroughput', label: 'Output Throughput', unit: 'tok/s', higherBetter: true },
  { key: 'ttftP50Ms', label: 'TTFT p50', unit: 'ms', higherBetter: false },
  { key: 'tpotP50Ms', label: 'TPOT p50', unit: 'ms', higherBetter: false },
  { key: 'p99LatencyMs', label: 'p99 Latency', unit: 'ms', higherBetter: false },
]

interface ChartPoint {
  date: string
  [lineKey: string]: string | number | undefined
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg p-3 shadow-xl text-xs">
      <div className="text-slate-400 mb-2">{label}</div>
      {payload.filter(p => p.value !== undefined).map(p => (
        <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-slate-300">{p.name}</span>
          </div>
          <span className="font-mono text-white">{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

export function PerformanceTimeline() {
  useReportCardDataState({ isDemoData: true, isFailed: false, consecutiveFailures: 0, hasData: true })

  const [metric, setMetric] = useState<MetricKey>('outputThroughput')
  const [range, setRange] = useState<TimeRange>(30)

  const allPoints = useMemo(() => generateTimelineReports(90), [])

  // Get unique line keys (hardware + config combos)
  const lineKeys = useMemo(() => {
    const keys = new Set<string>()
    allPoints.forEach(p => keys.add(`${p.hardware} ${p.config}`))
    return [...keys]
  }, [allPoints])

  // Build chart data: one row per date, columns per line key
  const { chartData, trendInfo } = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - range)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const filtered = allPoints.filter(p => p.date >= cutoffStr)

    // Group by date
    const dateMap = new Map<string, ChartPoint>()
    for (const p of filtered) {
      if (!dateMap.has(p.date)) dateMap.set(p.date, { date: p.date })
      const row = dateMap.get(p.date)!
      const key = `${p.hardware} ${p.config}`
      row[key] = p[metric]
    }

    const data = [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date))

    // Compute trend for each line
    const trends: Record<string, number> = {}
    for (const key of lineKeys) {
      const vals = data.map(d => d[key]).filter((v): v is number => typeof v === 'number')
      if (vals.length >= 2) {
        const first = vals.slice(0, 5).reduce((a, b) => a + b, 0) / Math.min(5, vals.length)
        const last = vals.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, vals.length)
        trends[key] = ((last / first) - 1) * 100
      }
    }

    return { chartData: data, trendInfo: trends }
  }, [allPoints, metric, range, lineKeys])

  const metricInfo = METRICS.find(m => m.key === metric)!

  // Assign colors: use config color + slight variation per hardware
  const lineColors = useMemo(() => {
    const colors: Record<string, string> = {}
    lineKeys.forEach(key => {
      const config = key.split(' ').pop() ?? ''
      colors[key] = CONFIG_COLORS[config] ?? '#6b7280'
    })
    return colors
  }, [lineKeys])

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-white">Performance Timeline</span>
        <div className="flex items-center gap-2">
          {([7, 30, 90] as TimeRange[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2 py-0.5 text-xs rounded font-medium transition-colors ${
                range === r ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {/* Metric tabs */}
      <div className="flex gap-1 mb-3 bg-slate-800/80 rounded-lg p-0.5 w-fit">
        {METRICS.map(m => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
              metric === m.key ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Trend indicators */}
      <div className="flex items-center gap-4 mb-2 text-[10px]">
        {lineKeys.map(key => {
          const trend = trendInfo[key]
          if (trend === undefined) return null
          const positive = metricInfo.higherBetter ? trend > 0 : trend < 0
          return (
            <div key={key} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: lineColors[key] }} />
              <span className="text-slate-400">{key}:</span>
              <span className={positive ? 'text-emerald-400' : 'text-red-400'}>
                {positive ? <TrendingUp size={10} className="inline" /> : <TrendingDown size={10} className="inline" />}
                {' '}{Math.abs(trend).toFixed(1)}%
              </span>
            </div>
          )
        })}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <XAxis
              dataKey="date"
              stroke="#71717a"
              fontSize={9}
              tickFormatter={(d: string) => {
                const parts = d.split('-')
                return `${parts[1]}/${parts[2]}`
              }}
            />
            <YAxis stroke="#71717a" fontSize={10} />
            <Tooltip content={<CustomTooltip />} />
            {lineKeys.map(key => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={lineColors[key]}
                strokeWidth={2}
                dot={false}
                connectNulls
                strokeOpacity={0.9}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Y-axis label */}
      <div className="text-center text-[10px] text-slate-500 mt-1">
        {metricInfo.label} ({metricInfo.unit})
      </div>
    </div>
  )
}

export default PerformanceTimeline
