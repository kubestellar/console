/**
 * ParetoFrontier — Interactive scatter plot showing latency-throughput tradeoff
 *
 * X-axis: output throughput per GPU, Y-axis: TTFT p50 (inverted).
 * Points colored by hardware, shaped by config. Pareto-optimal curve overlaid.
 * Filters for hardware, model, framework.
 * Built with ECharts for zoom/pan, interactive legend, and better dense-data handling.
 */
import { useState, useMemo, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import { Filter } from 'lucide-react'
import { useReportCardDataState } from '../CardDataContext'
import { useCachedBenchmarkReports } from '../../../hooks/useBenchmarkData'
import {
  generateBenchmarkReports,
  extractParetoPoints,
  computeParetoFrontier,
  HARDWARE_COLORS,
  getHardwareShort,
  getModelShort,
  type ParetoPoint,
} from '../../../lib/llmd/benchmarkMockData'

const CONFIG_SYMBOLS: Record<string, string> = {
  standalone: 'circle',
  scheduling: 'diamond',
  disaggregated: 'triangle',
}

const CONFIG_DISPLAY: Record<string, string> = {
  circle: '\u25CF',
  diamond: '\u25C6',
  triangle: '\u25B2',
}

export function ParetoFrontier() {
  const { data: liveReports, isDemoFallback, isFailed, consecutiveFailures, isLoading } = useCachedBenchmarkReports()
  const effectiveReports = useMemo(() => isDemoFallback ? generateBenchmarkReports() : (liveReports ?? []), [isDemoFallback, liveReports])
  useReportCardDataState({ isDemoData: isDemoFallback, isFailed, consecutiveFailures, isLoading, hasData: effectiveReports.length > 0 })

  const [hwFilter, setHwFilter] = useState<Set<string>>(new Set())
  const [modelFilter, setModelFilter] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)

  const { allPoints, models, hardwareList } = useMemo(() => {
    const pts = extractParetoPoints(effectiveReports)
    const mdls = [...new Set(pts.map(p => getModelShort(p.model)))]
    const hws = [...new Set(pts.map(p => getHardwareShort(p.hardware)))]
    return { allPoints: pts, models: mdls, hardwareList: hws }
  }, [effectiveReports])

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

  // Build ECharts option
  const option = useMemo(() => {
    // Group data by hardware × config for distinct series
    const seriesMap = new Map<string, { hw: string; config: string; points: ParetoPoint[] }>()
    for (const pt of filtered) {
      const hw = getHardwareShort(pt.hardware)
      const key = `${hw} · ${pt.config}`
      if (!seriesMap.has(key)) seriesMap.set(key, { hw, config: pt.config, points: [] })
      seriesMap.get(key)!.points.push(pt)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scatterSeries: any[] = [...seriesMap.entries()].map(([name, { hw, config, points }]) => ({
      name,
      type: 'scatter',
      symbol: CONFIG_SYMBOLS[config] ?? 'circle',
      symbolSize: 8,
      data: points.map(p => ({
        value: [p.throughputPerGpu, p.ttftP50Ms],
        point: p,
      })),
      itemStyle: {
        color: HARDWARE_COLORS[hw] ?? '#6b7280',
        borderColor: 'rgba(15, 23, 42, 0.6)',
        borderWidth: 0.5,
      },
      emphasis: {
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 2,
          shadowBlur: 12,
          shadowColor: HARDWARE_COLORS[hw] ?? '#6b7280',
        },
        scale: 1.8,
      },
      z: 2,
    }))

    // Pareto frontier as dashed line overlay
    if (frontier.length > 1) {
      scatterSeries.push({
        name: 'Pareto Frontier',
        type: 'line',
        data: frontier.map(p => [p.throughputPerGpu, p.ttftP50Ms]),
        lineStyle: {
          color: '#f59e0b',
          width: 2,
          type: 'dashed',
          opacity: 0.7,
        },
        itemStyle: { color: '#f59e0b' },
        symbol: 'none',
        z: 10,
        silent: true,
      })
    }

    return {
      backgroundColor: 'transparent',
      grid: {
        top: 15,
        right: 20,
        bottom: 55,
        left: 65,
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: '#334155',
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: '#e2e8f0', fontSize: 11 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          const pt = params.data?.point as ParetoPoint | undefined
          if (!pt) return ''
          const hw = getHardwareShort(pt.hardware)
          const model = getModelShort(pt.model)
          const hwColor = HARDWARE_COLORS[hw] ?? '#6b7280'
          return `<div style="font-weight:600;margin-bottom:6px">${model} <span style="color:#94a3b8">${hw}</span>` +
            `<span style="background:${hwColor}20;color:${hwColor};padding:1px 6px;border-radius:4px;font-size:10px;margin-left:6px">${pt.config}</span></div>` +
            `<div style="display:grid;grid-template-columns:auto auto;gap:2px 14px;font-size:11px">` +
            `<span style="color:#94a3b8">Throughput/GPU:</span><span style="font-family:monospace">${pt.throughputPerGpu.toFixed(0)} tok/s</span>` +
            `<span style="color:#94a3b8">TTFT p50:</span><span style="font-family:monospace">${pt.ttftP50Ms.toFixed(1)} ms</span>` +
            `<span style="color:#94a3b8">TPOT p50:</span><span style="font-family:monospace">${pt.tpotP50Ms.toFixed(2)} ms</span>` +
            `<span style="color:#94a3b8">p99 Latency:</span><span style="font-family:monospace">${pt.p99LatencyMs.toFixed(0)} ms</span>` +
            `</div>`
        },
      },
      legend: {
        show: false,
      },
      xAxis: {
        type: 'value',
        name: 'Output Throughput (tok/s/GPU)',
        nameLocation: 'middle',
        nameGap: 28,
        nameTextStyle: { color: '#71717a', fontSize: 10 },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
        axisLabel: { color: '#71717a', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        name: 'TTFT p50 (ms) — lower is better',
        nameLocation: 'middle',
        nameGap: 50,
        nameTextStyle: { color: '#71717a', fontSize: 10 },
        inverse: true,
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
        axisLabel: { color: '#71717a', fontSize: 10 },
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'weakFilter' },
        { type: 'inside', yAxisIndex: 0, filterMode: 'weakFilter' },
      ],
      series: scatterSeries,
    }
  }, [filtered, frontier])

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
      <div className="flex-1 min-h-0" style={{ minHeight: 300 }}>
        <ReactECharts
          option={option}
          style={{ height: '100%', width: '100%' }}
          opts={{ renderer: 'canvas' }}
          lazyUpdate
        />
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
          {Object.entries(CONFIG_SYMBOLS).map(([cfg, shape]) => (
            <div key={cfg} className="flex items-center gap-1">
              <span className="text-slate-400">
                {CONFIG_DISPLAY[shape] ?? '\u25CF'}
              </span>
              <span className="text-slate-400">{cfg}</span>
            </div>
          ))}
        </div>
        <div className="w-px h-3 bg-slate-700" />
        <span className="text-slate-500 italic">scroll to zoom</span>
      </div>
    </div>
  )
}

export default ParetoFrontier
