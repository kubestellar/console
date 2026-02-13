/**
 * ParetoFrontier — Interactive performance frontier chart
 *
 * Single card with 4 chart type tabs. White chart area, right-side scrollable
 * legend, connected scatter lines, GPU count labels, toggle switches.
 * Built with ECharts for zoom/pan and dense-data handling.
 */
import { useState, useMemo, useCallback, useRef } from 'react'
import ReactECharts from 'echarts-for-react'
import { Download, RotateCcw } from 'lucide-react'
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

// ---------------------------------------------------------------------------
// Metrics — Y is always throughput/GPU, X varies by chart tab
// ---------------------------------------------------------------------------

interface AxisMetric {
  label: string
  unit: string
  getValue: (p: ParetoPoint) => number
}

const METRICS: Record<string, AxisMetric> = {
  throughputPerGpu: {
    label: 'Token Throughput per GPU',
    unit: 'tok/s/gpu',
    getValue: (p) => p.throughputPerGpu,
  },
  e2eLatency: {
    label: 'End-to-end Latency',
    unit: 'ms',
    getValue: (p) => p.ttftP50Ms,
  },
  interactivity: {
    label: 'Interactivity',
    unit: 'tok/s/user',
    getValue: (p) => p.tpotP50Ms > 0 ? 1000 / p.tpotP50Ms : 0,
  },
  p99Latency: {
    label: 'p99 Latency',
    unit: 'ms',
    getValue: (p) => p.p99LatencyMs,
  },
  tpot: {
    label: 'Time per Output Token',
    unit: 'ms/tok',
    getValue: (p) => p.tpotP50Ms,
  },
}

// ---------------------------------------------------------------------------
// Chart type tabs — 4 views in one card
// ---------------------------------------------------------------------------

interface ChartTab {
  id: string
  label: string
  title: string
  xKey: string
}

const CHART_TABS: ChartTab[] = [
  { id: 'latency', label: 'E2E Latency', title: 'Token Throughput per GPU vs. End-to-end Latency', xKey: 'e2eLatency' },
  { id: 'interactivity', label: 'Interactivity', title: 'Token Throughput per GPU vs. Interactivity', xKey: 'interactivity' },
  { id: 'p99', label: 'p99 Latency', title: 'Token Throughput per GPU vs. p99 Latency', xKey: 'p99Latency' },
  { id: 'tpot', label: 'TPOT', title: 'Token Throughput per GPU vs. Time per Output Token', xKey: 'tpot' },
]

// ---------------------------------------------------------------------------
// Config symbols — deployment configuration shapes
// ---------------------------------------------------------------------------

const CONFIG_SYMBOLS: Record<string, string> = {
  standalone: 'circle',
  scheduling: 'rect',
  disaggregated: 'triangle',
}

const CONFIG_LABEL: Record<string, string> = {
  standalone: '\u25CF',
  scheduling: '\u25A0',
  disaggregated: '\u25B2',
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ParetoFrontierProps {
  config?: { chartType?: string }
}

export function ParetoFrontier({ config }: ParetoFrontierProps) {
  const chartRef = useRef<ReactECharts>(null)

  // ---- Data ----
  const { data: liveReports, isDemoFallback, isFailed, consecutiveFailures, isLoading } = useCachedBenchmarkReports()
  const effectiveReports = useMemo(
    () => (isDemoFallback ? generateBenchmarkReports() : (liveReports ?? [])),
    [isDemoFallback, liveReports],
  )
  useReportCardDataState({
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
    isLoading,
    hasData: effectiveReports.length > 0,
  })

  // ---- Chart type selection ----
  const initialTab = useMemo(() => {
    const ct = config?.chartType
    if (!ct) return 0
    const idx = CHART_TABS.findIndex(t => ct.includes(t.id))
    return idx >= 0 ? idx : 0
  }, [config?.chartType])

  const [activeTab, setActiveTab] = useState(initialTab)
  const tab = CHART_TABS[activeTab]
  const xAxis = METRICS[tab.xKey]
  const yAxis = METRICS.throughputPerGpu

  // ---- Toggles ----
  const [hideNonOptimal, setHideNonOptimal] = useState(false)
  const [hideLabels, setHideLabels] = useState(false)
  const [highContrast, setHighContrast] = useState(true)

  // ---- Filters ----
  const [modelFilter, setModelFilter] = useState('all')
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set())

  // ---- Processed data ----
  const { allPoints, models } = useMemo(() => {
    const pts = extractParetoPoints(effectiveReports)
    const mdls = [...new Set(pts.map(p => getModelShort(p.model)))]
    return { allPoints: pts, models: mdls }
  }, [effectiveReports])

  const filtered = useMemo(() => {
    if (modelFilter === 'all') return allPoints
    return allPoints.filter(p => getModelShort(p.model) === modelFilter)
  }, [allPoints, modelFilter])

  const frontier = useMemo(() => computeParetoFrontier(filtered), [filtered])
  const frontierUids = useMemo(() => new Set(frontier.map(p => p.uid)), [frontier])

  const displayPoints = useMemo(() => {
    if (!hideNonOptimal) return filtered
    return filtered.filter(p => frontierUids.has(p.uid))
  }, [filtered, hideNonOptimal, frontierUids])

  // ---- Series grouping ----
  const seriesMap = useMemo(() => {
    const map = new Map<string, { hw: string; cfg: string; pts: ParetoPoint[] }>()
    for (const pt of displayPoints) {
      const hw = getHardwareShort(pt.hardware)
      const name = `${hw} (${pt.config})`
      if (!map.has(name)) map.set(name, { hw, cfg: pt.config, pts: [] })
      map.get(name)!.pts.push(pt)
    }
    for (const s of map.values()) {
      s.pts.sort((a, b) => xAxis.getValue(a) - xAxis.getValue(b))
    }
    return map
  }, [displayPoints, xAxis])

  // ---- Callbacks ----
  const toggleSeries = useCallback((name: string) => {
    setHiddenSeries(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const handleDownload = useCallback(() => {
    const inst = chartRef.current?.getEchartsInstance()
    if (!inst) return
    const url = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
    const a = document.createElement('a')
    a.href = url
    a.download = `pareto-${tab.id}.png`
    a.click()
  }, [tab.id])

  const handleResetZoom = useCallback(() => {
    chartRef.current?.getEchartsInstance()?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 })
  }, [])

  // ---- ECharts option ----
  const option = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allSeries: any[] = [...seriesMap.entries()]
      .filter(([name]) => !hiddenSeries.has(name))
      .map(([name, { hw, cfg, pts }]) => {
        const color = HARDWARE_COLORS[hw] ?? '#6b7280'
        return {
          name,
          type: 'line',
          smooth: true,
          symbol: CONFIG_SYMBOLS[cfg] ?? 'circle',
          symbolSize: highContrast ? 10 : 7,
          data: pts.map(p => ({ value: [xAxis.getValue(p), yAxis.getValue(p)], point: p })),
          lineStyle: { color, width: highContrast ? 2 : 1.5, opacity: highContrast ? 0.85 : 0.55 },
          itemStyle: {
            color,
            borderColor: highContrast ? '#000' : 'rgba(0,0,0,0.15)',
            borderWidth: highContrast ? 1.5 : 0.5,
          },
          label: {
            show: !hideLabels,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter: (p: any) => {
              const pt = p.data?.point as ParetoPoint | undefined
              return pt && pt.gpuCount > 1 ? `${pt.gpuCount}` : ''
            },
            fontSize: 9,
            color: '#555',
            position: 'top',
            distance: 4,
          },
          emphasis: {
            itemStyle: { borderColor: '#000', borderWidth: 2, shadowBlur: 6, shadowColor: color },
            scale: 1.5,
          },
          z: 2,
        }
      })

    // Pareto frontier dashed line
    if (frontier.length > 1 && !hideNonOptimal) {
      const sorted = [...frontier].sort((a, b) => xAxis.getValue(a) - xAxis.getValue(b))
      allSeries.push({
        name: 'Pareto Frontier',
        type: 'line',
        smooth: true,
        data: sorted.map(p => [xAxis.getValue(p), yAxis.getValue(p)]),
        lineStyle: { color: '#ef4444', width: 2, type: 'dashed', opacity: 0.8 },
        itemStyle: { color: '#ef4444' },
        symbol: 'none',
        z: 10,
        silent: true,
      })
    }

    return {
      backgroundColor: '#f0f0ee',
      grid: { top: 16, right: 16, bottom: 42, left: 60 },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(255,255,255,0.97)',
        borderColor: '#d1d5db',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: '#1f2937', fontSize: 11 },
        extraCssText: 'box-shadow:0 4px 12px rgba(0,0,0,0.1);',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          const pt = params.data?.point as ParetoPoint | undefined
          if (!pt) return ''
          const hw = getHardwareShort(pt.hardware)
          const model = getModelShort(pt.model)
          const c = HARDWARE_COLORS[hw] ?? '#6b7280'
          return (
            `<div style="font-weight:600;margin-bottom:6px;color:#111">${model} ` +
            `<span style="color:#666">${hw}</span> ` +
            `<span style="background:${c}18;color:${c};padding:1px 6px;border-radius:4px;font-size:10px">${pt.config}</span></div>` +
            `<div style="display:grid;grid-template-columns:auto auto;gap:2px 14px;font-size:11px">` +
            `<span style="color:#888">Throughput/GPU:</span><span style="font-family:monospace;color:#111">${pt.throughputPerGpu.toFixed(0)} tok/s</span>` +
            `<span style="color:#888">TTFT p50:</span><span style="font-family:monospace;color:#111">${pt.ttftP50Ms.toFixed(1)} ms</span>` +
            `<span style="color:#888">TPOT p50:</span><span style="font-family:monospace;color:#111">${pt.tpotP50Ms.toFixed(2)} ms/tok</span>` +
            `<span style="color:#888">p99 Latency:</span><span style="font-family:monospace;color:#111">${pt.p99LatencyMs.toFixed(0)} ms</span>` +
            `<span style="color:#888">GPUs:</span><span style="font-family:monospace;color:#111">${pt.gpuCount}\u00d7</span>` +
            `</div>`
          )
        },
      },
      legend: { show: false },
      xAxis: {
        type: 'value',
        name: `${xAxis.label} (${xAxis.unit})`,
        nameLocation: 'middle',
        nameGap: 26,
        nameTextStyle: { color: '#555', fontSize: 11, fontWeight: 500 },
        axisLine: { lineStyle: { color: '#d1d5db' } },
        splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } },
        axisLabel: { color: '#666', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        name: `${yAxis.label} (${yAxis.unit})`,
        nameLocation: 'middle',
        nameGap: 48,
        nameTextStyle: { color: '#555', fontSize: 11, fontWeight: 500 },
        axisLine: { lineStyle: { color: '#d1d5db' } },
        splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } },
        axisLabel: {
          color: '#666',
          fontSize: 10,
          formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v),
        },
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'weakFilter' },
        { type: 'inside', yAxisIndex: 0, filterMode: 'weakFilter' },
      ],
      series: allSeries,
    }
  }, [seriesMap, frontier, hideNonOptimal, hideLabels, highContrast, hiddenSeries, xAxis, yAxis])

  // ---- Legend items ----
  const legendItems = useMemo(
    () => [...seriesMap.entries()].map(([name, { hw, cfg }]) => ({
      name,
      hw,
      cfg,
      color: HARDWARE_COLORS[hw] ?? '#6b7280',
    })),
    [seriesMap],
  )

  // Subtitle
  const subtitle = useMemo(() => {
    if (modelFilter !== 'all') return `${modelFilter} \u2022 llm-d benchmarks`
    const list = models.slice(0, 3).join(', ')
    return `${list}${models.length > 3 ? ` +${models.length - 3}` : ''} \u2022 llm-d benchmarks`
  }, [modelFilter, models])

  return (
    <div className="h-full flex flex-col" style={{ padding: '12px 14px 8px' }}>
      {/* Title + action buttons */}
      <div className="flex items-start justify-between mb-1.5 flex-shrink-0">
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold text-foreground leading-tight truncate">{tab.title}</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-3">
          <button
            onClick={handleDownload}
            className="p-1.5 rounded border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Download PNG"
          >
            <Download size={12} />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-1.5 rounded border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Reset zoom"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* Chart type tabs + model filter */}
      <div className="flex items-center gap-1 mb-2 flex-shrink-0">
        {CHART_TABS.map((ct, i) => (
          <button
            key={ct.id}
            onClick={() => setActiveTab(i)}
            className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
              activeTab === i
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
          >
            {ct.label}
          </button>
        ))}
        <div className="flex-1" />
        <select
          value={modelFilter}
          onChange={e => setModelFilter(e.target.value)}
          className="bg-secondary border border-border rounded px-2 py-0.5 text-[10px] text-foreground"
        >
          <option value="all">All Models</option>
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Chart area + right legend */}
      <div className="flex flex-1 min-h-0 gap-2">
        {/* ECharts white chart */}
        <div className="flex-1 min-w-0 rounded overflow-hidden" style={{ minHeight: 200 }}>
          <ReactECharts
            ref={chartRef}
            option={option}
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'canvas' }}
            lazyUpdate
          />
        </div>

        {/* Right legend panel */}
        <div className="flex-shrink-0 flex flex-col" style={{ width: 148 }}>
          {/* Series list */}
          <div className="flex-1 overflow-y-auto space-y-px" style={{ scrollbarWidth: 'thin' }}>
            {legendItems.map(({ name, cfg, color }) => {
              const hidden = hiddenSeries.has(name)
              return (
                <button
                  key={name}
                  onClick={() => toggleSeries(name)}
                  className={`flex items-center gap-1.5 w-full text-left px-1 py-0.5 rounded text-[10px] hover:bg-secondary/60 transition-opacity ${
                    hidden ? 'opacity-25' : ''
                  }`}
                  title={`${hidden ? 'Show' : 'Hide'} ${name}`}
                >
                  <span style={{ color, fontSize: 11 }}>{CONFIG_LABEL[cfg] ?? '\u25CF'}</span>
                  <span className="text-muted-foreground truncate">{name}</span>
                </button>
              )
            })}
            {frontier.length > 1 && !hideNonOptimal && (
              <div className="flex items-center gap-1.5 px-1 py-0.5 text-[10px]">
                <span className="text-red-400">- -</span>
                <span className="text-muted-foreground/60">Pareto Frontier</span>
              </div>
            )}
          </div>

          {/* Toggle controls */}
          <div className="border-t border-border/50 mt-1 pt-1.5 space-y-1 flex-shrink-0">
            <Toggle label="Hide Non-Optimal" active={hideNonOptimal} onChange={setHideNonOptimal} />
            <Toggle label="Hide Labels" active={hideLabels} onChange={setHideLabels} />
            <Toggle label="High Contrast" active={highContrast} onChange={setHighContrast} />
          </div>

          {/* Config shape key */}
          <div className="border-t border-border/50 mt-1.5 pt-1 flex-shrink-0">
            {Object.entries(CONFIG_LABEL).map(([cfg, sym]) => (
              <div key={cfg} className="flex items-center gap-1.5 text-[10px] text-muted-foreground py-px">
                <span>{sym}</span>
                <span className="capitalize">{cfg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom hint */}
      <p className="text-center text-[9px] text-muted-foreground/50 mt-1 flex-shrink-0">
        Scroll to zoom &middot; Drag to pan &middot; Double-click to reset
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toggle switch — small pill-style toggle
// ---------------------------------------------------------------------------

function Toggle({ label, active, onChange }: { label: string; active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!active)} className="flex items-center justify-between w-full group">
      <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
      <span
        className={`relative inline-flex rounded-full transition-colors ${
          active ? 'bg-foreground/30' : 'bg-muted'
        }`}
        style={{ width: 26, height: 14 }}
      >
        <span
          className={`absolute rounded-full transition-all ${
            active ? 'bg-foreground' : 'bg-muted-foreground/50'
          }`}
          style={{ top: 2, width: 10, height: 10, left: active ? 14 : 2 }}
        />
      </span>
    </button>
  )
}

export default ParetoFrontier
