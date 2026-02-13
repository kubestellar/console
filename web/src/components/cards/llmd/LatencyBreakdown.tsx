/**
 * LatencyBreakdown — Percentile comparison of latency metrics
 *
 * Grouped horizontal bar chart showing p50/p90/p95/p99 for each config.
 * Tabs to switch between TTFT, TPOT, ITL, NTPOT, and request latency.
 */
import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import { useCardDemoState, useReportCardDataState } from '../CardDataContext'
import { useCachedBenchmarkReports } from '../../../hooks/useBenchmarkData'
import {
  generateBenchmarkReports,
  getHardwareShort,
  getModelShort,
  CONFIG_COLORS,
  type BenchmarkReport,
  type Statistics,
} from '../../../lib/llmd/benchmarkMockData'

type MetricTab = 'ttft' | 'tpot' | 'itl' | 'ntpot' | 'request'

const TABS: { key: MetricTab; label: string }[] = [
  { key: 'ttft', label: 'TTFT' },
  { key: 'tpot', label: 'TPOT' },
  { key: 'itl', label: 'ITL' },
  { key: 'ntpot', label: 'NTPOT' },
  { key: 'request', label: 'Request' },
]

const PERCENTILE_COLORS: Record<string, string> = {
  p50: '#22c55e',
  p90: '#eab308',
  p95: '#f97316',
  p99: '#ef4444',
}

function getLatencyField(report: BenchmarkReport, tab: MetricTab): Statistics | undefined {
  const lat = report.results.request_performance.aggregate.latency
  switch (tab) {
    case 'ttft': return lat.time_to_first_token
    case 'tpot': return lat.time_per_output_token
    case 'itl': return lat.inter_token_latency
    case 'ntpot': return lat.normalized_time_per_output_token
    case 'request': return lat.request_latency
  }
}

interface BarEntry {
  name: string
  config: string
  p50: number
  p90: number
  p95: number
  p99: number
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }> }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg p-3 shadow-xl text-xs">
      {payload.map(p => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-slate-300">{p.name}</span>
          </div>
          <span className="font-mono text-white">{p.value.toFixed(2)} ms</span>
        </div>
      ))}
    </div>
  )
}

export function LatencyBreakdown() {
  const { data: liveReports, isFailed, consecutiveFailures, isLoading } = useCachedBenchmarkReports()
  const { shouldUseDemoData } = useCardDemoState({ requires: 'backend', isLiveDataAvailable: !isFailed })
  const effectiveReports = useMemo(() => shouldUseDemoData ? generateBenchmarkReports() : (liveReports ?? []), [shouldUseDemoData, liveReports])
  useReportCardDataState({ isDemoData: shouldUseDemoData, isFailed, consecutiveFailures, isLoading, hasData: effectiveReports.length > 0 })

  const [tab, setTab] = useState<MetricTab>('ttft')
  const [modelFilter, setModelFilter] = useState<string>('all')

  const { reports, models } = useMemo(() => {
    const mdls = [...new Set(effectiveReports.map(r => {
      const e = r.scenario.stack.find(c => c.standardized.kind === 'inference_engine')
      return getModelShort(e?.standardized.model?.name ?? '')
    }))]
    return { reports: effectiveReports, models: mdls }
  }, [effectiveReports])

  const data: BarEntry[] = useMemo(() => {
    let filtered = reports
    if (modelFilter !== 'all') {
      filtered = reports.filter(r => {
        const e = r.scenario.stack.find(c => c.standardized.kind === 'inference_engine')
        return getModelShort(e?.standardized.model?.name ?? '') === modelFilter
      })
    }
    // Pick one report per config + hardware combo
    const seen = new Set<string>()
    const entries: BarEntry[] = []

    for (const r of filtered) {
      const engine = r.scenario.stack.find(c => c.standardized.kind === 'inference_engine')
      const hw = getHardwareShort(engine?.standardized.accelerator?.model ?? '')
      const config = r.scenario.stack.some(c => c.standardized.role === 'prefill')
        ? 'disaggregated'
        : engine?.standardized.tool === 'llm-d' ? 'llm-d' : 'standalone'
      const key = `${hw}-${config}`
      if (seen.has(key)) continue
      seen.add(key)

      const stats = getLatencyField(r, tab)
      if (!stats) continue

      const toMs = stats.units === 's' ? 1000 : stats.units === 's/token' ? 1000 : 1

      entries.push({
        name: `${hw} ${config}`,
        config,
        p50: (stats.p50 ?? stats.mean) * toMs,
        p90: (stats.p90 ?? stats.mean * 1.3) * toMs,
        p95: (stats.p95 ?? stats.mean * 1.6) * toMs,
        p99: (stats.p99 ?? stats.mean * 2.3) * toMs,
      })
    }

    return entries.sort((a, b) => a.p50 - b.p50)
  }, [reports, modelFilter, tab])

  // Find best llm-d improvement
  const improvement = useMemo(() => {
    const standalone = data.find(d => d.config === 'standalone')
    const llmd = data.find(d => d.config === 'disaggregated') ?? data.find(d => d.config === 'llm-d')
    if (!standalone || !llmd) return null
    return Math.round((1 - llmd.p99 / standalone.p99) * 100)
  }, [data])

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header + tabs */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-white">Latency Breakdown</span>
          {improvement && improvement > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-400">
              llm-d reduces p99 by {improvement}%
            </span>
          )}
        </div>
        <select
          value={modelFilter}
          onChange={e => setModelFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white"
        >
          <option value="all">All Models</option>
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Metric tabs */}
      <div className="flex gap-1 mb-3 bg-slate-800/80 rounded-lg p-0.5 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
              tab === t.key ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <XAxis type="number" stroke="#71717a" fontSize={10} />
            <YAxis
              type="category"
              dataKey="name"
              stroke="#71717a"
              fontSize={10}
              width={120}
              tick={({ x, y, payload }: { x: string | number; y: string | number; payload: { value: string } }) => {
                const entry = data.find(d => d.name === payload.value)
                const color = entry ? CONFIG_COLORS[entry.config] : '#a1a1aa'
                return (
                  <text x={Number(x)} y={Number(y)} dy={4} textAnchor="end" fill={color} fontSize={10}>
                    {payload.value}
                  </text>
                )
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 10 }}
              formatter={(value: string) => <span className="text-slate-400 text-[10px]">{value}</span>}
            />
            {Object.entries(PERCENTILE_COLORS).map(([pct, color]) => (
              <Bar key={pct} dataKey={pct} name={pct.toUpperCase()} fill={color} radius={[0, 3, 3, 0]} barSize={8}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={color} fillOpacity={entry.config === 'standalone' ? 0.5 : 0.9} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default LatencyBreakdown
