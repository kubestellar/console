/**
 * ParetoFrontier — Interactive scatter plot showing latency-throughput tradeoff
 *
 * X-axis: output throughput per GPU, Y-axis: TTFT p50 (inverted).
 * Points colored by hardware, shaped by config. Pareto-optimal curve overlaid.
 * Filters for hardware, model, framework.
 */
import { useState, useMemo, useCallback } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, ZAxis,
} from 'recharts'
import { Filter } from 'lucide-react'
import { useReportCardDataState } from '../CardDataContext'
import {
  generateBenchmarkReports,
  extractParetoPoints,
  computeParetoFrontier,
  HARDWARE_COLORS,
  CONFIG_COLORS,
  getHardwareShort,
  getModelShort,
  type ParetoPoint,
} from '../../../lib/llmd/benchmarkMockData'

interface ScatterDot {
  cx?: number
  cy?: number
  payload?: ParetoPoint
}

const CONFIG_SHAPES: Record<string, string> = {
  standalone: 'circle',
  'llm-d': 'diamond',
  disaggregated: 'star',
}

function CustomDot({ cx: rawCx, cy: rawCy, payload }: ScatterDot) {
  if (!payload) return null
  const cx = rawCx ?? 0
  const cy = rawCy ?? 0
  const hw = getHardwareShort(payload.hardware)
  const color = HARDWARE_COLORS[hw] ?? '#6b7280'
  const shape = CONFIG_SHAPES[payload.config] ?? 'circle'
  const r = 6

  if (shape === 'diamond') {
    return (
      <g>
        <polygon
          points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
          fill={color}
          fillOpacity={0.8}
          stroke={color}
          strokeWidth={1.5}
          style={{ filter: `drop-shadow(0 0 3px ${color})` }}
        />
      </g>
    )
  }
  if (shape === 'star') {
    const pts: string[] = []
    for (let i = 0; i < 5; i++) {
      const angle = (i * 72 - 90) * Math.PI / 180
      pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`)
      const innerAngle = ((i * 72 + 36) - 90) * Math.PI / 180
      pts.push(`${cx + r * 0.5 * Math.cos(innerAngle)},${cy + r * 0.5 * Math.sin(innerAngle)}`)
    }
    return (
      <polygon
        points={pts.join(' ')}
        fill={color}
        fillOpacity={0.8}
        stroke={color}
        strokeWidth={1}
        style={{ filter: `drop-shadow(0 0 3px ${color})` }}
      />
    )
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={color}
      fillOpacity={0.7}
      stroke={color}
      strokeWidth={1.5}
      style={{ filter: `drop-shadow(0 0 3px ${color})` }}
    />
  )
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ParetoPoint }> }) {
  if (!active || !payload?.[0]) return null
  const p = payload[0].payload
  const hw = getHardwareShort(p.hardware)
  const model = getModelShort(p.model)
  return (
    <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-lg p-3 shadow-xl text-xs">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-semibold text-white">{model}</span>
        <span className="text-slate-400">{hw}</span>
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{ background: `${CONFIG_COLORS[p.config]}20`, color: CONFIG_COLORS[p.config] }}>
          {p.config}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-300">
        <span>Throughput/GPU:</span><span className="font-mono text-white">{p.throughputPerGpu.toFixed(0)} tok/s</span>
        <span>TTFT p50:</span><span className="font-mono text-white">{p.ttftP50Ms.toFixed(1)} ms</span>
        <span>TPOT p50:</span><span className="font-mono text-white">{p.tpotP50Ms.toFixed(2)} ms</span>
        <span>p99 Latency:</span><span className="font-mono text-white">{p.p99LatencyMs.toFixed(0)} ms</span>
      </div>
    </div>
  )
}

export function ParetoFrontier() {
  useReportCardDataState({ isDemoData: true, isFailed: false, consecutiveFailures: 0, hasData: true })

  const [hwFilter, setHwFilter] = useState<Set<string>>(new Set())
  const [modelFilter, setModelFilter] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)

  const { allPoints, models, hardwareList } = useMemo(() => {
    const reports = generateBenchmarkReports()
    const pts = extractParetoPoints(reports)
    const mdls = [...new Set(pts.map(p => getModelShort(p.model)))]
    const hws = [...new Set(pts.map(p => getHardwareShort(p.hardware)))]
    return { allPoints: pts, models: mdls, hardwareList: hws }
  }, [])

  const filtered = useMemo(() => {
    let pts = allPoints
    if (hwFilter.size > 0) {
      pts = pts.filter(p => hwFilter.has(getHardwareShort(p.hardware)))
    }
    if (modelFilter !== 'all') {
      pts = pts.filter(p => getModelShort(p.model) === modelFilter)
    }
    return pts
  }, [allPoints, hwFilter, modelFilter])

  const frontier = useMemo(() => computeParetoFrontier(filtered), [filtered])

  const toggleHw = useCallback((hw: string) => {
    setHwFilter(prev => {
      const next = new Set(prev)
      if (next.has(hw)) next.delete(hw)
      else next.add(hw)
      return next
    })
  }, [])

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-white">Pareto Frontier: Throughput vs Latency</div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`p-1.5 rounded-lg transition-colors ${showFilters ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
        >
          <Filter size={14} />
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 mb-3 pb-3 border-b border-slate-700/50">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Hardware:</span>
            {hardwareList.map(hw => (
              <button
                key={hw}
                onClick={() => toggleHw(hw)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                  hwFilter.size === 0 || hwFilter.has(hw)
                    ? 'text-white'
                    : 'text-slate-500 opacity-50'
                }`}
                style={{
                  background: hwFilter.size === 0 || hwFilter.has(hw)
                    ? `${HARDWARE_COLORS[hw] ?? '#6b7280'}30`
                    : undefined,
                  color: hwFilter.size === 0 || hwFilter.has(hw)
                    ? HARDWARE_COLORS[hw] ?? '#6b7280'
                    : undefined,
                }}
              >
                {hw}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Model:</span>
            <select
              value={modelFilter}
              onChange={e => setModelFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-white"
            >
              <option value="all">All Models</option>
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
            <XAxis
              type="number"
              dataKey="throughputPerGpu"
              name="Throughput/GPU"
              stroke="#71717a"
              fontSize={10}
              label={{ value: 'Output Throughput (tok/s/GPU)', position: 'insideBottom', offset: -15, fill: '#71717a', fontSize: 10 }}
            />
            <YAxis
              type="number"
              dataKey="ttftP50Ms"
              name="TTFT p50"
              stroke="#71717a"
              fontSize={10}
              reversed
              label={{ value: 'TTFT p50 (ms) — lower is better', angle: -90, position: 'insideLeft', offset: 5, fill: '#71717a', fontSize: 10 }}
            />
            <ZAxis range={[60, 60]} />
            <Tooltip content={<CustomTooltip />} />

            {/* Pareto frontier line */}
            {frontier.length > 1 && frontier.map((pt, i) => {
              if (i === 0) return null
              const prev = frontier[i - 1]
              return (
                <ReferenceLine
                  key={`pf-${i}`}
                  segment={[
                    { x: prev.throughputPerGpu, y: prev.ttftP50Ms },
                    { x: pt.throughputPerGpu, y: pt.ttftP50Ms },
                  ]}
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  strokeOpacity={0.6}
                />
              )
            })}

            <Scatter
              data={filtered}
              shape={(props: ScatterDot) => <CustomDot {...props} />}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-2 text-[10px]">
        <div className="flex items-center gap-3">
          {Object.entries(HARDWARE_COLORS).map(([hw, color]) => (
            <div key={hw} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-slate-400">{hw}</span>
            </div>
          ))}
        </div>
        <div className="w-px h-3 bg-slate-700" />
        <div className="flex items-center gap-3">
          {Object.entries(CONFIG_SHAPES).map(([cfg, shape]) => (
            <div key={cfg} className="flex items-center gap-1">
              <span className="text-slate-400">
                {shape === 'circle' ? '\u25CF' : shape === 'diamond' ? '\u25C6' : '\u2605'}
              </span>
              <span className="text-slate-400">{cfg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ParetoFrontier
