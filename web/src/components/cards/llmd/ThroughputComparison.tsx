/**
 * ThroughputComparison — Multi-bar chart comparing throughput
 *
 * Vertical grouped bar chart with X-axis hardware types, bars per config
 * (standalone, llm-d, disaggregated). Secondary axis toggle for input/output/total
 * tokens and request rate. Improvement labels on bars.
 */
import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import { useReportCardDataState } from '../CardDataContext'
import {
  generateBenchmarkReports,
  getHardwareShort,
  getModelShort,
  CONFIG_COLORS,
  type BenchmarkReport,
} from '../../../lib/llmd/benchmarkMockData'

type MetricMode = 'output' | 'input' | 'total' | 'request'

const MODES: { key: MetricMode; label: string; unit: string }[] = [
  { key: 'output', label: 'Output tok/s', unit: 'tok/s' },
  { key: 'input', label: 'Input tok/s', unit: 'tok/s' },
  { key: 'total', label: 'Total tok/s', unit: 'tok/s' },
  { key: 'request', label: 'Requests/s', unit: 'req/s' },
]

function getThroughput(report: BenchmarkReport, mode: MetricMode): number {
  const t = report.results.request_performance.aggregate.throughput
  switch (mode) {
    case 'output': return t.output_token_rate?.mean ?? 0
    case 'input': return t.input_token_rate?.mean ?? 0
    case 'total': return t.total_token_rate?.mean ?? 0
    case 'request': return t.request_rate?.mean ?? 0
  }
}

interface BarEntry {
  hardware: string
  standalone: number
  'llm-d': number
  disaggregated: number
  llmdImprove: number | null
  disaggImprove: number | null
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg p-3 shadow-xl text-xs">
      <div className="text-white font-medium mb-2">{label}</div>
      {payload.map(p => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-slate-300">{p.name}</span>
          </div>
          <span className="font-mono text-white">{p.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
        </div>
      ))}
    </div>
  )
}

function ImprovementLabel({ x, y, width, value }: { x?: string | number; y?: string | number; width?: number; value: number | null }) {
  if (value == null || value <= 0) return null
  const nx = typeof x === 'number' ? x : 0
  const ny = typeof y === 'number' ? y : 0
  return (
    <text
      x={nx + (width ?? 0) / 2}
      y={ny - 4}
      textAnchor="middle"
      fill="#22c55e"
      fontSize={9}
      fontWeight={600}
    >
      +{value}%
    </text>
  )
}

export function ThroughputComparison() {
  useReportCardDataState({ isDemoData: true, isFailed: false, consecutiveFailures: 0, hasData: true })

  const [mode, setMode] = useState<MetricMode>('output')
  const [modelFilter, setModelFilter] = useState<string>('all')

  const { reports, models } = useMemo(() => {
    const all = generateBenchmarkReports()
    const mdls = [...new Set(all.map(r => {
      const e = r.scenario.stack.find(c => c.standardized.kind === 'inference_engine')
      return getModelShort(e?.standardized.model?.name ?? '')
    }))]
    return { reports: all, models: mdls }
  }, [])

  const data: BarEntry[] = useMemo(() => {
    let filtered = reports
    if (modelFilter !== 'all') {
      filtered = reports.filter(r => {
        const e = r.scenario.stack.find(c => c.standardized.kind === 'inference_engine')
        return getModelShort(e?.standardized.model?.name ?? '') === modelFilter
      })
    }

    // Group by hardware
    const hwMap = new Map<string, { standalone: number; 'llm-d': number; disaggregated: number }>()

    for (const r of filtered) {
      const engine = r.scenario.stack.find(c => c.standardized.kind === 'inference_engine')
      const hw = getHardwareShort(engine?.standardized.accelerator?.model ?? '')
      const config = r.scenario.stack.some(c => c.standardized.role === 'prefill')
        ? 'disaggregated'
        : engine?.standardized.tool === 'llm-d' ? 'llm-d' : 'standalone'
      const val = getThroughput(r, mode)

      if (!hwMap.has(hw)) hwMap.set(hw, { standalone: 0, 'llm-d': 0, disaggregated: 0 })
      const entry = hwMap.get(hw)!
      // Take max value per config per hardware
      if (val > entry[config]) entry[config] = val
    }

    return Array.from(hwMap.entries()).map(([hw, vals]) => {
      const base = vals.standalone || 1
      return {
        hardware: hw,
        ...vals,
        llmdImprove: vals['llm-d'] > 0 && vals.standalone > 0
          ? Math.round(((vals['llm-d'] / base) - 1) * 100)
          : null,
        disaggImprove: vals.disaggregated > 0 && vals.standalone > 0
          ? Math.round(((vals.disaggregated / base) - 1) * 100)
          : null,
      }
    })
  }, [reports, modelFilter, mode])

  const modeInfo = MODES.find(m => m.key === mode)!

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-white">Throughput Comparison</span>
        <select
          value={modelFilter}
          onChange={e => setModelFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white"
        >
          <option value="all">All Models</option>
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 mb-3 bg-slate-800/80 rounded-lg p-0.5 w-fit">
        {MODES.map(m => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
              mode === m.key ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 20, bottom: 5, left: 10 }}>
            <XAxis dataKey="hardware" stroke="#71717a" fontSize={11} tick={{ fill: '#e5e5e5' }} />
            <YAxis stroke="#71717a" fontSize={10} />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 10 }}
              formatter={(value: string) => <span className="text-slate-400 text-[10px]">{value}</span>}
            />
            <Bar dataKey="standalone" name="Standalone" fill={CONFIG_COLORS.standalone} radius={[3, 3, 0, 0]} barSize={20}>
              {data.map((_, i) => (
                <Cell key={i} fill={CONFIG_COLORS.standalone} />
              ))}
            </Bar>
            <Bar
              dataKey="llm-d"
              name="llm-d"
              fill={CONFIG_COLORS['llm-d']}
              radius={[3, 3, 0, 0]}
              barSize={20}
              label={/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                (props: any) => (
                <ImprovementLabel
                  x={props.x}
                  y={props.y}
                  width={props.width}
                  value={data[props.index as number]?.llmdImprove ?? null}
                />
              )}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={CONFIG_COLORS['llm-d']} />
              ))}
            </Bar>
            <Bar
              dataKey="disaggregated"
              name="Disaggregated"
              fill={CONFIG_COLORS.disaggregated}
              radius={[3, 3, 0, 0]}
              barSize={20}
              label={/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                (props: any) => (
                <ImprovementLabel
                  x={props.x}
                  y={props.y}
                  width={props.width}
                  value={data[props.index as number]?.disaggImprove ?? null}
                />
              )}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={CONFIG_COLORS.disaggregated} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Unit label */}
      <div className="text-center text-[10px] text-slate-500 mt-1">
        {modeInfo.unit} per GPU
      </div>
    </div>
  )
}

export default ThroughputComparison
