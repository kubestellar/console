/**
 * PerformanceTimeline — ISL × OSL performance heatmap
 *
 * Interactive heatmap showing how input/output sequence lengths affect
 * throughput or latency. Each cell is colored by intensity with hover details.
 * Filter by experiment category and QPS level.
 */
import { useState, useMemo } from 'react'
import { LayoutGrid, ArrowDown, ArrowRight } from 'lucide-react'
import { useReportCardDataState } from '../CardDataContext'
import { useCachedBenchmarkReports } from '../../../hooks/useBenchmarkData'
import { generateBenchmarkReports } from '../../../lib/llmd/benchmarkMockData'
import {
  extractExperimentMeta,
  getFilterOptions,
} from '../../../lib/llmd/benchmarkDataUtils'
import type { BenchmarkReport } from '../../../lib/llmd/benchmarkMockData'
import { useTranslation } from 'react-i18next'

type MetricMode = 'throughput' | 'ttft' | 'p99' | 'tpot'

const MODES: { key: MetricMode; label: string; unit: string; higherBetter: boolean }[] = [
  { key: 'throughput', label: 'Throughput', unit: 'tok/s', higherBetter: true },
  { key: 'ttft', label: 'TTFT p50', unit: 'ms', higherBetter: false },
  { key: 'tpot', label: 'TPOT p50', unit: 'ms', higherBetter: false },
  { key: 'p99', label: 'p99 Latency', unit: 'ms', higherBetter: false },
]

interface CellData {
  isl: number
  osl: number
  value: number
  count: number
}

function extractMetric(r: BenchmarkReport, mode: MetricMode): number {
  const agg = r.results.request_performance.aggregate
  switch (mode) {
    case 'throughput': return agg.throughput.output_token_rate?.mean ?? 0
    case 'ttft': return (agg.latency.time_to_first_token?.p50 ?? 0) * 1000
    case 'tpot': return (agg.latency.time_per_output_token?.p50 ?? 0) * 1000
    case 'p99': return (agg.latency.request_latency?.p99 ?? 0) * 1000
  }
}

function getColor(value: number, min: number, max: number, higherBetter: boolean): string {
  if (max === min) return 'rgba(59, 130, 246, 0.5)'
  const ratio = higherBetter
    ? (value - min) / (max - min)
    : 1 - (value - min) / (max - min)

  // Green = good, Red = bad
  if (ratio > 0.7) return `rgba(34, 197, 94, ${0.3 + ratio * 0.5})`
  if (ratio > 0.4) return `rgba(234, 179, 8, ${0.3 + ratio * 0.4})`
  return `rgba(239, 68, 68, ${0.3 + (1 - ratio) * 0.4})`
}

export function PerformanceTimeline() {
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
  const [qpsFilter, setQpsFilter] = useState<number>(0)
  const [hoveredCell, setHoveredCell] = useState<CellData | null>(null)

  // Get available QPS values
  const qpsValues = useMemo(() => {
    const values = new Set<number>()
    for (const r of effectiveReports) {
      const meta = extractExperimentMeta(r)
      if (meta.qps > 0) values.add(meta.qps)
    }
    return [...values].sort((a, b) => a - b)
  }, [effectiveReports])

  const modeInfo = MODES.find(m => m.key === mode)!

  // Build heatmap data
  const { cells, islValues, oslValues, minVal, maxVal } = useMemo(() => {
    const cellMap = new Map<string, { total: number; count: number }>()
    const isls = new Set<number>()
    const osls = new Set<number>()

    for (const r of effectiveReports) {
      const meta = extractExperimentMeta(r)
      if (meta.isl === 0 || meta.osl === 0) continue
      if (category !== 'all' && meta.category !== category) continue
      if (qpsFilter > 0 && meta.qps !== qpsFilter) continue

      const val = extractMetric(r, mode)
      const key = `${meta.isl}-${meta.osl}`
      isls.add(meta.isl)
      osls.add(meta.osl)

      if (!cellMap.has(key)) cellMap.set(key, { total: 0, count: 0 })
      const entry = cellMap.get(key)!
      entry.total += val
      entry.count++
    }

    const result: CellData[] = []
    let min = Infinity, max = -Infinity
    for (const [key, { total, count }] of cellMap) {
      const [isl, osl] = key.split('-').map(Number)
      const value = total / count
      if (value < min) min = value
      if (value > max) max = value
      result.push({ isl, osl, value, count })
    }

    return {
      cells: result,
      islValues: [...isls].sort((a, b) => a - b),
      oslValues: [...osls].sort((a, b) => a - b),
      minVal: min === Infinity ? 0 : min,
      maxVal: max === -Infinity ? 0 : max,
    }
  }, [effectiveReports, mode, category, qpsFilter])

  const getCell = (isl: number, osl: number) => cells.find(c => c.isl === isl && c.osl === osl)

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <LayoutGrid size={14} className="text-purple-400" />
          <span className="text-sm font-medium text-white">Sequence Length Impact</span>
          <span className="text-[10px] text-slate-500">ISL × OSL → {modeInfo.label}</span>
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
            <option value={0}>All QPS</option>
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
              mode === m.key ? 'bg-purple-500/20 text-purple-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Heatmap */}
      <div className="flex-1 min-h-0 flex items-center justify-center" style={{ minHeight: 250 }}>
        {cells.length > 0 ? (
          <div className="relative">
            {/* Y-axis label */}
            <div className="absolute -left-8 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] text-slate-500 flex items-center gap-1 whitespace-nowrap">
              <ArrowDown size={10} className="rotate-90" />
              OSL (Output Seq Len)
            </div>

            <div className="ml-4">
              {/* X-axis header */}
              <div className="flex items-center gap-1 mb-1 pl-16">
                {islValues.map(isl => (
                  <div key={isl} className="flex-1 text-center text-[10px] text-slate-400 font-mono">
                    {isl}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1 mb-2 pl-16">
                <div className="flex-1 text-center text-[10px] text-slate-500 flex items-center justify-center gap-1">
                  <ArrowRight size={10} />
                  ISL (Input Seq Len)
                </div>
              </div>

              {/* Grid */}
              {oslValues.map(osl => (
                <div key={osl} className="flex items-center gap-1 mb-1">
                  <div className="w-14 text-right text-[10px] text-slate-400 font-mono pr-2">{osl}</div>
                  {islValues.map(isl => {
                    const cell = getCell(isl, osl)
                    if (!cell) return (
                      <div key={isl} className="flex-1 aspect-[2/1] min-h-[48px] rounded-lg bg-slate-800/30 border border-slate-700/30 flex items-center justify-center">
                        <span className="text-[10px] text-slate-600">—</span>
                      </div>
                    )
                    const isHovered = hoveredCell?.isl === isl && hoveredCell?.osl === osl
                    return (
                      <div
                        key={isl}
                        className={`flex-1 aspect-[2/1] min-h-[48px] rounded-lg border flex flex-col items-center justify-center cursor-pointer transition-all ${
                          isHovered ? 'border-white/40 scale-105 z-10' : 'border-slate-700/30'
                        }`}
                        style={{ backgroundColor: getColor(cell.value, minVal, maxVal, modeInfo.higherBetter) }}
                        onMouseEnter={() => setHoveredCell(cell)}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        <span className="text-sm font-bold text-white">
                          {cell.value >= 1000 ? `${(cell.value / 1000).toFixed(1)}k` : cell.value.toFixed(cell.value < 10 ? 2 : 0)}
                        </span>
                        <span className="text-[9px] text-white/60">{modeInfo.unit}</span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* Hover detail */}
            {hoveredCell && (
              <div className="absolute -right-4 top-0 translate-x-full bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl text-xs min-w-[160px] z-20">
                <div className="text-white font-medium mb-1">ISL {hoveredCell.isl} × OSL {hoveredCell.osl}</div>
                <div className="text-slate-300">{modeInfo.label}: <span className="font-mono text-white">{hoveredCell.value.toFixed(1)} {modeInfo.unit}</span></div>
                <div className="text-slate-400 mt-1">{hoveredCell.count} reports averaged</div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-slate-500 text-sm">No data for selected filters</div>
        )}
      </div>

      {/* Color scale legend */}
      <div className="flex items-center justify-center gap-2 mt-2 text-[10px] text-slate-400">
        <span>{modeInfo.higherBetter ? 'Low' : 'Best'}</span>
        <div className="flex h-2 rounded overflow-hidden">
          <div className="w-8 bg-red-500/50" />
          <div className="w-8 bg-yellow-500/50" />
          <div className="w-8 bg-green-500/50" />
        </div>
        <span>{modeInfo.higherBetter ? 'High' : 'Worst'}</span>
      </div>
    </div>
  )
}

export default PerformanceTimeline
