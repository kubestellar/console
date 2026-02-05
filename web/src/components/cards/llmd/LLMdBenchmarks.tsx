/**
 * LLM-d Benchmarks Dashboard
 *
 * Shows benchmark results and stack configuration comparisons.
 * In live mode, compares configurations across discovered stacks.
 * In demo mode, shows reference benchmark data.
 */
import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Trophy, TrendingUp, Zap, Clock, Layers, ExternalLink, Sparkles, Server } from 'lucide-react'
import { useOptionalStack } from '../../../contexts/StackContext'
import { useCardDemoState, useReportCardDataState } from '../CardDataContext'
import { getBenchmarkResults, type BenchmarkResult } from '../../../lib/llmd/mockData'
import type { LLMdStack } from '../../../hooks/useStackDiscovery'

type ViewMode = 'comparison' | 'latency' | 'stacks'
type ModelFilter = 'all' | string

const COLORS = {
  baseline: '#475569',
  'llm-d': '#9333ea',
  disaggregated: '#22c55e',
  unified: '#3b82f6',
  healthy: '#22c55e',
  degraded: '#f59e0b',
  unhealthy: '#ef4444',
}

const CONFIG_LABELS = {
  baseline: 'Baseline vLLM',
  'llm-d': 'llm-d',
  disaggregated: 'Disaggregated',
}

interface StackComparisonData {
  name: string
  model: string
  replicas: number
  readyReplicas: number
  hasDisaggregation: boolean
  hasAutoscaler: boolean
  autoscalerType?: string
  status: string
  prefillReplicas: number
  decodeReplicas: number
}

function getStackComparisonData(stacks: LLMdStack[]): StackComparisonData[] {
  return stacks.map(stack => ({
    name: stack.name,
    model: stack.model || 'Unknown',
    replicas: stack.totalReplicas,
    readyReplicas: stack.readyReplicas,
    hasDisaggregation: stack.hasDisaggregation,
    hasAutoscaler: !!stack.autoscaler,
    autoscalerType: stack.autoscaler?.type ?? undefined,
    status: stack.status,
    prefillReplicas: stack.components.prefill.reduce((sum, c) => sum + c.replicas, 0),
    decodeReplicas: stack.components.decode.reduce((sum, c) => sum + c.replicas, 0),
  }))
}

export function LLMdBenchmarks() {
  const stackContext = useOptionalStack()
  const { shouldUseDemoData } = useCardDemoState({ requires: 'stack' })

  // Report demo state to CardWrapper so it can show demo badge and yellow outline
  useReportCardDataState({ isDemoData: shouldUseDemoData, isFailed: false, consecutiveFailures: 0 })

  const [viewMode, setViewMode] = useState<ViewMode>(shouldUseDemoData ? 'comparison' : 'stacks')
  const [modelFilter, setModelFilter] = useState<ModelFilter>('all')

  // Demo benchmark data
  const allResults = useMemo(() => getBenchmarkResults(), [])

  const filteredResults = useMemo(() => {
    if (modelFilter === 'all') return allResults
    return allResults.filter(r => r.model === modelFilter)
  }, [allResults, modelFilter])

  const models = useMemo(() => {
    const unique = [...new Set(allResults.map(r => r.model))]
    return ['all', ...unique] as ModelFilter[]
  }, [allResults])

  // Live stack comparison data
  const stackComparison = useMemo(() => {
    if (!stackContext?.stacks) return []
    return getStackComparisonData(stackContext.stacks)
  }, [stackContext?.stacks])

  // Prepare comparison data for benchmark view
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

  // Calculate improvement metrics from benchmark data
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

  // Stack-level stats
  const stackStats = useMemo(() => {
    if (stackComparison.length === 0) return null
    const totalReplicas = stackComparison.reduce((sum, s) => sum + s.replicas, 0)
    const healthyStacks = stackComparison.filter(s => s.status === 'healthy').length
    const disaggStacks = stackComparison.filter(s => s.hasDisaggregation).length
    const autoscaledStacks = stackComparison.filter(s => s.hasAutoscaler).length
    return { totalReplicas, healthyStacks, disaggStacks, autoscaledStacks, total: stackComparison.length }
  }, [stackComparison])

  const showDemoBadge = shouldUseDemoData
  const availableViews: ViewMode[] = shouldUseDemoData
    ? ['comparison', 'latency']
    : ['stacks', 'comparison', 'latency']

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-amber-400" />
          <span className="font-medium text-white">Benchmarks</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Model filter - only for benchmark views */}
          {viewMode !== 'stacks' && (
            <select
              value={modelFilter}
              onChange={e => setModelFilter(e.target.value as ModelFilter)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white"
            >
              {models.map(m => (
                <option key={m} value={m}>{m === 'all' ? 'All Models' : m}</option>
              ))}
            </select>
          )}

          {showDemoBadge && (
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded flex items-center gap-1">
              <Sparkles size={10} />
              Demo
            </span>
          )}
        </div>
      </div>

      {/* View mode tabs */}
      <div className="flex gap-1 mb-4 bg-slate-800 rounded-lg p-1 w-fit">
        {availableViews.map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-1 text-xs rounded capitalize transition-colors flex items-center gap-1 ${
              viewMode === mode
                ? 'bg-purple-500/20 text-purple-400'
                : 'text-muted-foreground hover:text-white'
            }`}
          >
            {mode === 'stacks' && <Server size={12} />}
            {mode === 'stacks' ? 'Stacks' : mode}
          </button>
        ))}
      </div>

      {/* Live Stack Comparison View */}
      {viewMode === 'stacks' && !shouldUseDemoData && (
        <>
          {/* Stack stats summary */}
          {stackStats && (
            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 text-center">
                <div className="text-white font-bold">{stackStats.total}</div>
                <div className="text-xs text-muted-foreground">Stacks</div>
              </div>
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                <div className="text-white font-bold">{stackStats.healthyStacks}</div>
                <div className="text-xs text-muted-foreground">Healthy</div>
              </div>
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-2 text-center">
                <div className="text-white font-bold">{stackStats.disaggStacks}</div>
                <div className="text-xs text-muted-foreground">P/D Disagg</div>
              </div>
              <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-2 text-center">
                <div className="text-white font-bold">{stackStats.autoscaledStacks}</div>
                <div className="text-xs text-muted-foreground">Autoscaled</div>
              </div>
            </div>
          )}

          {/* Stack comparison chart */}
          <div className="flex-1 min-h-0">
            {stackComparison.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stackComparison} layout="vertical">
                  <XAxis type="number" stroke="#71717a" fontSize={10} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#71717a"
                    fontSize={10}
                    width={100}
                    tick={{ fill: '#a1a1aa' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                    }}
                    formatter={(value, name) => {
                      const labels: Record<string, string> = {
                        replicas: 'Total Replicas',
                        prefillReplicas: 'Prefill',
                        decodeReplicas: 'Decode',
                      }
                      return [value ?? 0, labels[String(name)] || name]
                    }}
                  />
                  <Bar dataKey="prefillReplicas" name="Prefill" stackId="a" fill={COLORS['llm-d']} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="decodeReplicas" name="Decode" stackId="a" fill={COLORS.disaggregated} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="replicas" name="Unified" fill={COLORS.unified} radius={[0, 4, 4, 0]}>
                    {stackComparison.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.hasDisaggregation ? 'transparent' : COLORS.unified}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Layers size={32} className="text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No stacks discovered</p>
                <p className="text-xs text-muted-foreground mt-1">Select a stack to see configuration</p>
              </div>
            )}
          </div>

          {/* Stack legend */}
          {stackComparison.length > 0 && (
            <div className="flex items-center justify-center gap-6 mt-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS['llm-d'] }} />
                <span className="text-muted-foreground">Prefill</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.disaggregated }} />
                <span className="text-muted-foreground">Decode</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.unified }} />
                <span className="text-muted-foreground">Unified</span>
              </div>
            </div>
          )}

          {/* Link to benchmarks repo */}
          <div className="mt-4 pt-3 border-t border-slate-700">
            <a
              href="https://github.com/llm-d/llm-d-benchmark"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              <ExternalLink size={12} />
              Run benchmarks with llm-d-benchmark
            </a>
          </div>
        </>
      )}

      {/* Benchmark Data Views (Demo or Reference) */}
      {viewMode !== 'stacks' && (
        <>
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
                    labelStyle={{ color: '#e5e5e5' }}
                    itemStyle={{ color: '#a1a1aa' }}
                    cursor={{ fill: 'rgba(30, 41, 59, 0.5)' }}
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
                    labelStyle={{ color: '#e5e5e5' }}
                    itemStyle={{ color: '#a1a1aa' }}
                    cursor={{ fill: 'rgba(30, 41, 59, 0.5)' }}
                  />
                  <Bar dataKey="p50" name="P50" stackId="a" fill="#22c55e" />
                  <Bar dataKey="p95" name="P95" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="p99" name="P99" stackId="a" fill="#ef4444" />
                </BarChart>
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

          {/* Reference note */}
          {shouldUseDemoData && (
            <div className="mt-4 pt-3 border-t border-slate-700">
              <p className="text-xs text-muted-foreground text-center">
                Reference benchmarks from llm-d documentation
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default LLMdBenchmarks
