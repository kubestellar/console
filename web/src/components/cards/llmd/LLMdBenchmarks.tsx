/**
 * LLM-d Benchmarks Dashboard
 *
 * Performance metrics from llm-d-benchmark results with
 * comparison charts and latency distributions.
 */
import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis } from 'recharts'
import { Trophy, TrendingUp, Zap, Clock } from 'lucide-react'
import { getBenchmarkResults, type BenchmarkResult } from '../../../lib/llmd/mockData'

type ViewMode = 'comparison' | 'latency' | 'throughput'
type ModelFilter = 'all' | 'Llama-3-70B' | 'Granite-13B' | 'DeepSeek-R1'

const COLORS = {
  baseline: '#64748b',
  'llm-d': '#9333ea',
  disaggregated: '#22c55e',
}

const CONFIG_LABELS = {
  baseline: 'Baseline vLLM',
  'llm-d': 'llm-d',
  disaggregated: 'Disaggregated',
}

export function LLMdBenchmarks() {
  const [viewMode, setViewMode] = useState<ViewMode>('comparison')
  const [modelFilter, setModelFilter] = useState<ModelFilter>('all')

  const allResults = useMemo(() => getBenchmarkResults(), [])

  const filteredResults = useMemo(() => {
    if (modelFilter === 'all') return allResults
    return allResults.filter(r => r.model === modelFilter)
  }, [allResults, modelFilter])

  const models = useMemo(() => {
    const unique = [...new Set(allResults.map(r => r.model))]
    return ['all', ...unique] as ModelFilter[]
  }, [allResults])

  // Prepare comparison data
  const comparisonData = useMemo(() => {
    const grouped: Record<string, BenchmarkResult[]> = {}

    filteredResults.forEach(r => {
      if (!grouped[r.model]) grouped[r.model] = []
      grouped[r.model].push(r)
    })

    return Object.entries(grouped).map(([model, results]) => {
      const baseline = results.find(r => r.configuration === 'baseline')
      const llmd = results.find(r => r.configuration === 'llm-d')
      const disagg = results.find(r => r.configuration === 'disaggregated')

      return {
        model: model.replace('-', '\n'),
        baselineTTFT: baseline?.ttftMs || 0,
        llmdTTFT: llmd?.ttftMs || 0,
        disaggTTFT: disagg?.ttftMs || 0,
        baselineThroughput: baseline?.throughputTokensPerSec || 0,
        llmdThroughput: llmd?.throughputTokensPerSec || 0,
        disaggThroughput: disagg?.throughputTokensPerSec || 0,
      }
    })
  }, [filteredResults])

  // Prepare latency distribution data
  const latencyData = useMemo(() => {
    return filteredResults.map(r => ({
      name: `${r.model.split('-')[0]} ${r.configuration}`,
      model: r.model,
      config: r.configuration,
      p50: r.p50LatencyMs,
      p95: r.p95LatencyMs,
      p99: r.p99LatencyMs,
    }))
  }, [filteredResults])

  // Prepare scatter plot data (TTFT vs Throughput)
  const scatterData = useMemo(() => {
    return filteredResults.map(r => ({
      x: r.ttftMs,
      y: r.throughputTokensPerSec,
      z: r.model.includes('70B') ? 100 : r.model.includes('R1') ? 120 : 60,
      name: r.model,
      config: r.configuration,
    }))
  }, [filteredResults])

  // Calculate improvement metrics
  const improvements = useMemo(() => {
    const llama = allResults.filter(r => r.model === 'Llama-3-70B')
    const baseline = llama.find(r => r.configuration === 'baseline')
    const llmd = llama.find(r => r.configuration === 'llm-d')
    const disagg = llama.find(r => r.configuration === 'disaggregated')

    if (!baseline || !llmd) return null

    return {
      ttftReduction: Math.round((1 - llmd.ttftMs / baseline.ttftMs) * 100),
      throughputIncrease: Math.round((llmd.throughputTokensPerSec / baseline.throughputTokensPerSec - 1) * 100),
      disaggTtftReduction: disagg ? Math.round((1 - disagg.ttftMs / baseline.ttftMs) * 100) : 0,
      disaggThroughputIncrease: disagg ? Math.round((disagg.throughputTokensPerSec / baseline.throughputTokensPerSec - 1) * 100) : 0,
    }
  }, [allResults])

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: Record<string, string | number | undefined> }> }) => {
    if (!active || !payload?.[0]) return null

    const data = payload[0].payload
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm">
        <div className="font-medium text-white mb-1">{String(data.name ?? data.model ?? '')}</div>
        {data.config && (
          <div className="text-muted-foreground capitalize mb-1">{String(data.config)}</div>
        )}
        {data.x !== undefined && (
          <div className="text-cyan-400">TTFT: {data.x}ms</div>
        )}
        {data.y !== undefined && (
          <div className="text-green-400">Throughput: {data.y} tokens/s</div>
        )}
      </div>
    )
  }

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-amber-400" />
          <span className="font-medium text-white">Benchmarks</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Model filter */}
          <select
            value={modelFilter}
            onChange={e => setModelFilter(e.target.value as ModelFilter)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white"
          >
            {models.map(m => (
              <option key={m} value={m}>{m === 'all' ? 'All Models' : m}</option>
            ))}
          </select>

          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded">
            Demo
          </span>
        </div>
      </div>

      {/* View mode tabs */}
      <div className="flex gap-1 mb-4 bg-slate-800 rounded-lg p-1 w-fit">
        {(['comparison', 'latency', 'throughput'] as ViewMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-1 text-xs rounded capitalize transition-colors ${
              viewMode === mode
                ? 'bg-purple-500/20 text-purple-400'
                : 'text-muted-foreground hover:text-white'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Improvement highlights */}
      {improvements && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-purple-400 mb-1">
              <Clock size={12} />
              <span className="text-xs">TTFT</span>
            </div>
            <div className="text-white font-bold">-{improvements.ttftReduction}%</div>
            <div className="text-xs text-muted-foreground">llm-d</div>
          </div>

          <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-purple-400 mb-1">
              <Zap size={12} />
              <span className="text-xs">Throughput</span>
            </div>
            <div className="text-white font-bold">+{improvements.throughputIncrease}%</div>
            <div className="text-xs text-muted-foreground">llm-d</div>
          </div>

          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-green-400 mb-1">
              <Clock size={12} />
              <span className="text-xs">TTFT</span>
            </div>
            <div className="text-white font-bold">-{improvements.disaggTtftReduction}%</div>
            <div className="text-xs text-muted-foreground">Disagg</div>
          </div>

          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-green-400 mb-1">
              <TrendingUp size={12} />
              <span className="text-xs">Throughput</span>
            </div>
            <div className="text-white font-bold">+{improvements.disaggThroughputIncrease}%</div>
            <div className="text-xs text-muted-foreground">Disagg</div>
          </div>
        </div>
      )}

      {/* Chart area */}
      <div className="flex-1 min-h-0">
        {viewMode === 'comparison' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparisonData} layout="vertical">
              <XAxis type="number" stroke="#71717a" fontSize={10} />
              <YAxis
                type="category"
                dataKey="model"
                stroke="#71717a"
                fontSize={10}
                width={80}
                tick={{ fill: '#a1a1aa' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                }}
              />
              <Bar dataKey="baselineTTFT" name="Baseline" fill={COLORS.baseline} radius={[0, 4, 4, 0]} />
              <Bar dataKey="llmdTTFT" name="llm-d" fill={COLORS['llm-d']} radius={[0, 4, 4, 0]} />
              <Bar dataKey="disaggTTFT" name="Disaggregated" fill={COLORS.disaggregated} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {viewMode === 'latency' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={latencyData}>
              <XAxis dataKey="name" stroke="#71717a" fontSize={8} angle={-45} textAnchor="end" height={60} />
              <YAxis stroke="#71717a" fontSize={10} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                }}
              />
              <Bar dataKey="p50" name="P50" stackId="a" fill="#22c55e" />
              <Bar dataKey="p95" name="P95" stackId="a" fill="#f59e0b" />
              <Bar dataKey="p99" name="P99" stackId="a" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        )}

        {viewMode === 'throughput' && (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <XAxis
                type="number"
                dataKey="x"
                name="TTFT"
                stroke="#71717a"
                fontSize={10}
                label={{ value: 'TTFT (ms)', position: 'bottom', fill: '#71717a', fontSize: 10 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Throughput"
                stroke="#71717a"
                fontSize={10}
                label={{ value: 'Tokens/s', angle: -90, position: 'left', fill: '#71717a', fontSize: 10 }}
              />
              <ZAxis type="number" dataKey="z" range={[50, 200]} />
              <Tooltip content={<CustomTooltip />} />
              <Scatter data={scatterData}>
                {scatterData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={COLORS[entry.config as keyof typeof COLORS]}
                    style={{ filter: `drop-shadow(0 0 4px ${COLORS[entry.config as keyof typeof COLORS]})` }}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 text-xs">
        {Object.entries(CONFIG_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: COLORS[key as keyof typeof COLORS] }}
            />
            <span className="text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default LLMdBenchmarks
