/**
 * ParetoFrontier — Interactive performance frontier chart
 *
 * Dropdown filters (Model, ISL/OSL, Framework, Chart) control the data
 * and chart view. Ten chart presets covering throughput, cost, power, latency,
 * interactivity, GPU scaling, and efficiency dimensions.
 * Right-side legend with hardware-colored dots, info pills, and Reset filter.
 * Connected smooth scatter lines with GPU count labels. Built with ECharts.
 */
import { useState, useMemo, useRef } from 'react'
import { SECONDS_PER_HOUR } from '../../../lib/constants/time'
import { LazyEChart } from '../../charts/LazyEChart'
import type ReactEChartsType from 'echarts-for-react'
import { Download, RotateCcw } from 'lucide-react'
import { useReportCardDataState } from '../CardDataContext'
import { useCachedBenchmarkReports } from '../../../hooks/useBenchmarkData'
import {
  extractParetoPoints,
  computeParetoFrontier,
  HARDWARE_COLORS,
  getHardwareShort,
  getModelShort,
  type ParetoPoint } from '../../../lib/llmd/benchmarkMockData'
import { useTranslation } from 'react-i18next'
import { DynamicCardErrorBoundary } from '../DynamicCardErrorBoundary'
import { downloadDataUrl } from '../../../lib/download'
import { CHART_MIN_HEIGHT_PX, CHART_AXIS_FONT_SIZE, CHART_AXIS_FONT_SIZE_SM } from '../../../lib/constants/ui'

// ── Tooltip spacing constants (ECharts renders its own DOM, so Tailwind/CSS vars are unavailable) ──
/** Spacing between tooltip header and grid body */
const TOOLTIP_HEADER_MARGIN_PX = '8px'
/** Horizontal padding for config badge */
const TOOLTIP_BADGE_PAD_H_PX = '8px'
/** Vertical padding for config badge */
const TOOLTIP_BADGE_PAD_V_PX = '2px'
/** Gap between grid rows */
const TOOLTIP_GRID_GAP_ROW_PX = '4px'
/** Gap between grid columns */
const TOOLTIP_GRID_GAP_COL_PX = '16px'
/** Badge border-radius */
const TOOLTIP_BADGE_RADIUS_PX = '4px'

const LEGEND_PANEL_WIDTH_PX = 130

// Minimal parameter type for ECharts label/tooltip formatter callbacks
interface EChartsFormatterParam {
  data?: { point?: ParetoPoint }
}

// Minimal ECharts series config type covering both scatter/line and frontier series
interface EChartsSeriesConfig {
  name: string
  type: string
  smooth?: boolean
  symbol?: string
  symbolSize?: number
  data: unknown[]
  lineStyle?: Record<string, unknown>
  itemStyle?: Record<string, unknown>
  label?: Record<string, unknown>
  emphasis?: Record<string, unknown>
  z?: number
  silent?: boolean
}

// ---------------------------------------------------------------------------
// Chart presets — each defines X-axis, Y-axis, title, and optional info pills
// ---------------------------------------------------------------------------

interface ChartPreset {
  label: string
  title: string
  xAxis: { label: string; unit: string; getValue: (p: ParetoPoint) => number }
  yAxis: {
    label: string
    unit: string
    getValue: (p: ParetoPoint) => number
    formatter?: (v: number) => string
  }
  infoPills?: (points: ParetoPoint[]) => { label: string; items: { hw: string; value: string }[] } | null
}

const CHART_PRESETS: Record<string, ChartPreset> = {
  throughputVsLatency: {
    label: 'Throughput vs E2E Latency',
    title: 'Token Throughput per GPU vs. End-to-end Latency',
    xAxis: { label: 'End-to-end Latency', unit: 'ms', getValue: (p) => p.ttftP50Ms },
    yAxis: {
      label: 'Token Throughput per GPU',
      unit: 'tok/s/gpu',
      getValue: (p) => p.throughputPerGpu,
      formatter: (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)) } },
  throughputVsInteractivity: {
    label: 'Throughput vs Interactivity',
    title: 'Token Throughput per GPU vs. Interactivity',
    xAxis: { label: 'Interactivity', unit: 'tok/s/user', getValue: (p) => p.tpotP50Ms > 0 ? 1000 / p.tpotP50Ms : 0 },
    yAxis: {
      label: 'Token Throughput per GPU',
      unit: 'tok/s/gpu',
      getValue: (p) => p.throughputPerGpu,
      formatter: (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)) } },
  throughputPerMw: {
    label: 'Throughput/MW vs Interactivity',
    title: 'Token Throughput per All in Utility MW vs. Interactivity',
    xAxis: { label: 'Interactivity', unit: 'tok/s/user', getValue: (p) => p.tpotP50Ms > 0 ? 1000 / p.tpotP50Ms : 0 },
    yAxis: {
      label: 'Token Throughput per All in Utility MW',
      unit: 'tok/s/MW',
      getValue: (p) => p.powerPerGpuKw > 0 ? p.throughputPerGpu / (p.powerPerGpuKw * 0.001) : 0,
      formatter: (v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)) },
    infoPills: (points) => {
      const hwPower = new Map<string, number>()
      for (const p of points) {
        const hw = getHardwareShort(p.hardware)
        if (!hwPower.has(hw)) hwPower.set(hw, p.powerPerGpuKw)
      }
      return {
        label: 'All in Power/GPU:',
        items: [...hwPower.entries()].map(([hw, kw]) => ({ hw, value: `${kw.toFixed(2)}kW` })) }
    } },
  costPerMTok: {
    label: 'Cost/MTok vs Interactivity',
    title: 'Cost per Million Tokens (Owning) vs. Interactivity',
    xAxis: { label: 'Interactivity', unit: 'tok/s/user', getValue: (p) => p.tpotP50Ms > 0 ? 1000 / p.tpotP50Ms : 0 },
    yAxis: {
      label: 'Cost per Million Tokens',
      unit: '$',
      getValue: (p) => p.throughputPerGpu > 0 ? (p.tcoPerGpuHr / (p.throughputPerGpu * SECONDS_PER_HOUR)) * 1_000_000 : 0,
      formatter: (v) => `$${v.toFixed(2)}` },
    infoPills: (points) => {
      const hwCost = new Map<string, number>()
      for (const p of points) {
        const hw = getHardwareShort(p.hardware)
        if (!hwCost.has(hw)) hwCost.set(hw, p.tcoPerGpuHr)
      }
      return {
        label: 'TCO $/GPU/hr:',
        items: [...hwCost.entries()].map(([hw, cost]) => ({ hw, value: cost.toFixed(2) })) }
    } },
  costVsLatency: {
    label: 'Cost/MTok vs E2E Latency',
    title: 'Cost per Million Tokens vs. End-to-end Latency',
    xAxis: { label: 'End-to-end Latency', unit: 'ms', getValue: (p) => p.ttftP50Ms },
    yAxis: {
      label: 'Cost per Million Tokens',
      unit: '$',
      getValue: (p) => p.throughputPerGpu > 0 ? (p.tcoPerGpuHr / (p.throughputPerGpu * SECONDS_PER_HOUR)) * 1_000_000 : 0,
      formatter: (v) => `$${v.toFixed(2)}` },
    infoPills: (points) => {
      const hwCost = new Map<string, number>()
      for (const p of points) {
        const hw = getHardwareShort(p.hardware)
        if (!hwCost.has(hw)) hwCost.set(hw, p.tcoPerGpuHr)
      }
      return {
        label: 'TCO $/GPU/hr:',
        items: [...hwCost.entries()].map(([hw, cost]) => ({ hw, value: cost.toFixed(2) })) }
    } },
  throughputPerDollar: {
    label: 'Throughput/$ vs Interactivity',
    title: 'Throughput per Dollar vs. Interactivity',
    xAxis: { label: 'Interactivity', unit: 'tok/s/user', getValue: (p) => p.tpotP50Ms > 0 ? 1000 / p.tpotP50Ms : 0 },
    yAxis: {
      label: 'Throughput per Dollar',
      unit: 'tok/s/$',
      getValue: (p) => p.tcoPerGpuHr > 0 ? p.throughputPerGpu / p.tcoPerGpuHr : 0,
      formatter: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)) },
    infoPills: (points) => {
      const hwCost = new Map<string, number>()
      for (const p of points) {
        const hw = getHardwareShort(p.hardware)
        if (!hwCost.has(hw)) hwCost.set(hw, p.tcoPerGpuHr)
      }
      return {
        label: 'TCO $/GPU/hr:',
        items: [...hwCost.entries()].map(([hw, cost]) => ({ hw, value: cost.toFixed(2) })) }
    } },
  p99VsThroughput: {
    label: 'p99 Latency vs Throughput',
    title: 'p99 Latency vs. Token Throughput per GPU',
    xAxis: {
      label: 'Token Throughput per GPU',
      unit: 'tok/s/gpu',
      getValue: (p) => p.throughputPerGpu },
    yAxis: {
      label: 'p99 Latency',
      unit: 'ms',
      getValue: (p) => p.p99LatencyMs,
      formatter: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}` } },
  tpotVsThroughput: {
    label: 'TPOT vs Throughput',
    title: 'Time per Output Token vs. Token Throughput per GPU',
    xAxis: {
      label: 'Token Throughput per GPU',
      unit: 'tok/s/gpu',
      getValue: (p) => p.throughputPerGpu },
    yAxis: {
      label: 'Time per Output Token (p50)',
      unit: 'ms/tok',
      getValue: (p) => p.tpotP50Ms,
      formatter: (v) => v.toFixed(1) } },
  gpuScaling: {
    label: 'GPU Scaling Efficiency',
    title: 'GPU Scaling: Throughput per GPU vs. GPU Count',
    xAxis: {
      label: 'GPU Count',
      unit: 'GPUs',
      getValue: (p) => p.gpuCount },
    yAxis: {
      label: 'Token Throughput per GPU',
      unit: 'tok/s/gpu',
      getValue: (p) => p.throughputPerGpu,
      formatter: (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)) } },
  throughputPerMwVsLatency: {
    label: 'Throughput/MW vs E2E Latency',
    title: 'Token Throughput per MW vs. End-to-end Latency',
    xAxis: { label: 'End-to-end Latency', unit: 'ms', getValue: (p) => p.ttftP50Ms },
    yAxis: {
      label: 'Token Throughput per All in Utility MW',
      unit: 'tok/s/MW',
      getValue: (p) => p.powerPerGpuKw > 0 ? p.throughputPerGpu / (p.powerPerGpuKw * 0.001) : 0,
      formatter: (v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)) },
    infoPills: (points) => {
      const hwPower = new Map<string, number>()
      for (const p of points) {
        const hw = getHardwareShort(p.hardware)
        if (!hwPower.has(hw)) hwPower.set(hw, p.powerPerGpuKw)
      }
      return {
        label: 'All in Power/GPU:',
        items: [...hwPower.entries()].map(([hw, kw]) => ({ hw, value: `${kw.toFixed(2)}kW` })) }
    } } }

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ParetoFrontierProps {
  config?: { chartType?: string }
}

function ParetoFrontierInternal({ config }: ParetoFrontierProps) {
  const { t } = useTranslation(['cards', 'common'])
  const chartRef = useRef<ReactEChartsType>(null)

  // ---- Data ----
  const { data: reports, isDemoFallback, isFailed, consecutiveFailures, isLoading, isRefreshing, lastRefresh } = useCachedBenchmarkReports()
  // Use hook data directly — it already returns cached live data or demo fallback.
  // Calling generateBenchmarkReports() here would bypass the warm cache (#3397).
  const effectiveReports = reports ?? []
  // Freshness tracking: lastRefresh → lastUpdated Date reported to CardWrapper via useReportCardDataState
  const lastUpdated = lastRefresh ? new Date(lastRefresh) : null
  useReportCardDataState({
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
    isLoading,
    isRefreshing,
    hasData: effectiveReports.length > 0,
    lastUpdated })

  // ---- All Pareto points ----
  const allPoints = extractParetoPoints(effectiveReports)

  // ---- Extract unique filter values ----
  const filterOptions = (() => {
    const models = [...new Set(allPoints.map(p => getModelShort(p.model)))]
    const seqLens = [...new Set(allPoints.map(p => p.seqLen))]
    const frameworks = [...new Set(allPoints.map(p => p.framework).filter(Boolean))]
    return { models, seqLens, frameworks }
  })()

  // ---- Filter state ----
  const initialChart = (() => {
    const ct = config?.chartType
    if (!ct) return 'throughputVsLatency'
    const found = Object.keys(CHART_PRESETS).find(k => ct.includes(k))
    return found ?? 'throughputVsLatency'
  })()

  const [modelFilter, setModelFilter] = useState('all')
  const [seqLenFilter, setSeqLenFilter] = useState('all')
  const [frameworkFilter, setFrameworkFilter] = useState('all')
  const [chartKey, setChartKey] = useState(initialChart)
  const [hiddenHw, setHiddenHw] = useState<Set<string>>(new Set())

  const preset = CHART_PRESETS[chartKey] ?? CHART_PRESETS.throughputVsLatency

  // ---- Toggles ----
  const [hideNonOptimal, setHideNonOptimal] = useState(false)
  const [hideLabels, setHideLabels] = useState(false)
  const [highContrast, setHighContrast] = useState(true)

  // ---- Filtered data ----
  const filtered = (() => {
    let pts = allPoints
    if (modelFilter !== 'all') pts = pts.filter(p => getModelShort(p.model) === modelFilter)
    if (seqLenFilter !== 'all') pts = pts.filter(p => p.seqLen === seqLenFilter)
    if (frameworkFilter !== 'all') pts = pts.filter(p => p.framework === frameworkFilter)
    return pts
  })()

  const frontier = computeParetoFrontier(filtered)
  const frontierUids = new Set(frontier.map(p => p.uid))

  const displayPoints = (() => {
    if (!hideNonOptimal) return filtered
    return filtered.filter(p => frontierUids.has(p.uid))
  })()

  // ---- Info pills for current chart preset ----
  const infoPills = (() => {
    if (!preset.infoPills) return null
    return preset.infoPills(displayPoints)
  })()

  // ---- Series grouped by hardware ----
  const seriesMap = useMemo(() => {
    const map = new Map<string, ParetoPoint[]>()
    for (const pt of displayPoints) {
      const hw = getHardwareShort(pt.hardware)
      if (!map.has(hw)) map.set(hw, [])
      map.get(hw)!.push(pt)
    }
    for (const pts of map.values()) {
      pts.sort((a, b) => preset.xAxis.getValue(a) - preset.xAxis.getValue(b))
    }
    return map
  }, [displayPoints, preset])

  // ---- Callbacks ----
  const toggleHw = (hw: string) => {
    setHiddenHw(prev => {
      const next = new Set(prev)
      if (next.has(hw)) next.delete(hw)
      else next.add(hw)
      return next
    })
  }

  const resetFilters = () => {
    setModelFilter('all')
    setSeqLenFilter('all')
    setFrameworkFilter('all')
    setHiddenHw(new Set())
  }

  const handleDownload = () => {
    const inst = chartRef.current?.getEchartsInstance()
    if (!inst) return
    // #6226: ECharts getDataURL can throw on a detached chart, and the
    // anchor.click() can be blocked by the browser. Both paths flow
    // through downloadDataUrl which captures any exception.
    try {
      const url = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
      downloadDataUrl(`pareto-${chartKey}.png`, url)
    } catch {
      // Failure is non-fatal — chart export is a nice-to-have, not
      // critical to the card. The card has no useToast plumbing in
      // this scope, so we silently swallow rather than surfacing a
      // toast that would require extra wiring.
    }
  }

  const handleResetZoom = () => {
    chartRef.current?.getEchartsInstance()?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 })
  }

  // ---- Chart subtitle ----
  const subtitle = (() => {
    const parts: string[] = []
    if (modelFilter !== 'all') parts.push(modelFilter)
    if (frameworkFilter !== 'all') parts.push(frameworkFilter)
    if (seqLenFilter !== 'all') parts.push(seqLenFilter)
    return parts.length > 0 ? parts.join(' \u2022 ') : t('paretoFrontier.allConfigurations')
  })()

  // ---- ECharts option ----
  const option = useMemo(() => {
    const allSeries: EChartsSeriesConfig[] = [...seriesMap.entries()]
      .filter(([hw]) => !hiddenHw.has(hw))
      .map(([hw, pts]) => {
        const color = HARDWARE_COLORS[hw] ?? '#6b7280'
        return {
          name: hw,
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: highContrast ? 10 : 7,
          data: pts.map(p => ({ value: [preset.xAxis.getValue(p), preset.yAxis.getValue(p)], point: p })),
          lineStyle: { color, width: highContrast ? 2 : 1.5, opacity: highContrast ? 0.85 : 0.55 },
          itemStyle: {
            color,
            borderColor: highContrast ? '#000' : 'rgba(0,0,0,0.15)',
            borderWidth: highContrast ? 1.5 : 0.5 },
          label: {
            show: !hideLabels,
            formatter: (p: EChartsFormatterParam) => {
              const pt = p.data?.point
              return pt && pt.gpuCount > 1 ? `${pt.gpuCount}` : ''
            },
            fontSize: CHART_AXIS_FONT_SIZE_SM,
            color: '#94a3b8',
            position: 'top',
            distance: 4 },
          emphasis: {
            itemStyle: { borderColor: '#000', borderWidth: 2, shadowBlur: 6, shadowColor: color },
            scale: 1.5 },
          z: 2 }
      })

    // Pareto frontier dashed line
    if (frontier.length > 1 && !hideNonOptimal) {
      const sorted = [...frontier].sort((a, b) => preset.xAxis.getValue(a) - preset.xAxis.getValue(b))
      allSeries.push({
        name: 'Pareto Frontier',
        type: 'line',
        smooth: true,
        data: sorted.map(p => [preset.xAxis.getValue(p), preset.yAxis.getValue(p)]),
        lineStyle: { color: '#ef4444', width: 2, type: 'dashed', opacity: 0.8 },
        itemStyle: { color: '#ef4444' },
        symbol: 'none',
        z: 10,
        silent: true })
    }

    return {
      backgroundColor: '#1a1d2e',
      grid: { top: 16, right: 16, bottom: 42, left: 70 },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15,23,42,0.97)',
        borderColor: '#334155',
        borderWidth: 1,
        padding: [12, 16],
        textStyle: { color: '#e2e8f0', fontSize: 11 },
        extraCssText: 'box-shadow:0 4px 12px rgba(0,0,0,0.3);',
        formatter: (params: EChartsFormatterParam) => {
          const pt = params.data?.point
          if (!pt) return ''
          const hw = getHardwareShort(pt.hardware)
          const model = getModelShort(pt.model)
          const c = HARDWARE_COLORS[hw] ?? '#6b7280'
          return (
            `<div style="font-weight:600;margin-bottom:${TOOLTIP_HEADER_MARGIN_PX};color:#f1f5f9">${model} ` +
            `<span style="color:#94a3b8">${hw}</span> ` +
            `<span style="background:${c}30;color:${c};padding:${TOOLTIP_BADGE_PAD_V_PX} ${TOOLTIP_BADGE_PAD_H_PX};border-radius:${TOOLTIP_BADGE_RADIUS_PX};font-size:10px">${pt.config}</span></div>` +
            `<div style="display:grid;grid-template-columns:auto auto;gap:${TOOLTIP_GRID_GAP_ROW_PX} ${TOOLTIP_GRID_GAP_COL_PX};font-size:11px">` +
            `<span style="color:#94a3b8">Throughput/GPU:</span><span style="font-family:monospace;color:#e2e8f0">${pt.throughputPerGpu.toFixed(0)} tok/s</span>` +
            `<span style="color:#94a3b8">TTFT p50:</span><span style="font-family:monospace;color:#e2e8f0">${pt.ttftP50Ms.toFixed(1)} ms</span>` +
            `<span style="color:#94a3b8">TPOT p50:</span><span style="font-family:monospace;color:#e2e8f0">${pt.tpotP50Ms.toFixed(2)} ms/tok</span>` +
            `<span style="color:#94a3b8">p99 Latency:</span><span style="font-family:monospace;color:#e2e8f0">${pt.p99LatencyMs.toFixed(0)} ms</span>` +
            `<span style="color:#94a3b8">GPUs:</span><span style="font-family:monospace;color:#e2e8f0">${pt.gpuCount}\u00d7</span>` +
            `<span style="color:#94a3b8">ISL/OSL:</span><span style="font-family:monospace;color:#e2e8f0">${pt.seqLen}</span>` +
            `<span style="color:#94a3b8">Power/GPU:</span><span style="font-family:monospace;color:#e2e8f0">${pt.powerPerGpuKw.toFixed(2)} kW</span>` +
            `<span style="color:#94a3b8">TCO/GPU/hr:</span><span style="font-family:monospace;color:#e2e8f0">$${pt.tcoPerGpuHr.toFixed(2)}</span>` +
            `</div>`
          )
        } },
      legend: { show: false },
      xAxis: {
        type: 'value',
        name: `${preset.xAxis.label} (${preset.xAxis.unit})`,
        nameLocation: 'middle',
        nameGap: 26,
        nameTextStyle: { color: '#94a3b8', fontSize: 11, fontWeight: 500 },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
        axisLabel: { color: '#64748b', fontSize: CHART_AXIS_FONT_SIZE } },
      yAxis: {
        type: 'value',
        name: `${preset.yAxis.label} (${preset.yAxis.unit})`,
        nameLocation: 'middle',
        nameGap: 58,
        nameTextStyle: { color: '#94a3b8', fontSize: 11, fontWeight: 500 },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
        axisLabel: {
          color: '#64748b',
          fontSize: CHART_AXIS_FONT_SIZE,
          formatter: preset.yAxis.formatter ?? ((v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)) } },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'weakFilter' },
        { type: 'inside', yAxisIndex: 0, filterMode: 'weakFilter' },
      ],
      series: allSeries }
  }, [seriesMap, frontier, hideNonOptimal, hideLabels, highContrast, hiddenHw, preset])

  // ---- Legend items (hardware only) ----
  const legendItems = [...seriesMap.keys()].map(hw => ({
      hw,
      color: HARDWARE_COLORS[hw] ?? '#6b7280' }))

  return (
    <div className="h-full flex flex-col pt-3 px-4 pb-2">
      {/* Dropdown filters row */}
      <div className="flex items-end gap-3 mb-2 shrink-0 flex-wrap">
        <FilterDropdown label={t('paretoFrontier.model')} value={modelFilter} onChange={setModelFilter} options={filterOptions.models} />
        <FilterDropdown label={t('paretoFrontier.islOsl')} value={seqLenFilter} onChange={setSeqLenFilter} options={filterOptions.seqLens} />
        <FilterDropdown label={t('paretoFrontier.framework')} value={frameworkFilter} onChange={setFrameworkFilter} options={filterOptions.frameworks} />
        <FilterDropdown
          label={t('paretoFrontier.yAxisMetric')}
          value={chartKey}
          onChange={setChartKey}
          options={Object.keys(CHART_PRESETS)}
          optionLabels={Object.fromEntries(Object.entries(CHART_PRESETS).map(([k, v]) => [k, v.label]))}
          noAllOption
        />
      </div>

      {/* Title + action buttons */}
      <div className="flex items-start justify-between mb-1 shrink-0">
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold text-foreground leading-tight truncate">{preset.title}</h3>
          <p className="text-2xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-3">
          <button
            onClick={handleDownload}
            className="p-1.5 rounded border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title={t('paretoFrontier.downloadPng')}
          >
            <Download size={12} />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-1.5 rounded border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title={t('paretoFrontier.resetZoom')}
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* Info pills (power or cost, depending on chart preset) */}
      {infoPills && (
        <div className="flex items-center gap-2 mb-1.5 shrink-0 flex-wrap">
          <span className="text-2xs text-muted-foreground font-medium">{infoPills.label}</span>
          {infoPills.items.map(({ hw, value }) => (
            <span
              key={hw}
              className="text-2xs px-2 py-0.5 rounded border border-border bg-secondary/50 text-foreground font-medium"
            >
              {hw}: {value}
            </span>
          ))}
        </div>
      )}

      {/* Chart area + right legend */}
      <div className="flex flex-1 min-h-0 gap-2">
        {/* ECharts chart */}
        <div className="flex-1 min-w-0 rounded overflow-hidden" style={{ minHeight: CHART_MIN_HEIGHT_PX }}>
          <LazyEChart
            ref={chartRef}
            option={option}
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'canvas' }}
            lazyUpdate
          />
        </div>

        {/* Right legend panel */}
        <div className="shrink-0 flex flex-col" style={{ width: LEGEND_PANEL_WIDTH_PX }}>
          {/* Hardware series list */}
          <div className="flex-1 overflow-y-auto space-y-px" style={{ scrollbarWidth: 'thin' }}>
            {legendItems.map(({ hw, color }) => {
              const hidden = hiddenHw.has(hw)
              return (
                <button
                  key={hw}
                  onClick={() => toggleHw(hw)}
                  className={`flex items-center gap-1.5 w-full text-left px-1 py-0.5 rounded text-[11px] hover:bg-secondary/60 transition-opacity ${
                    hidden ? 'opacity-25' : ''
                  }`}
                  title={`${hidden ? t('common:common.show') : t('common:common.hide')} ${hw}`}
                >
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-foreground truncate">{hw}</span>
                </button>
              )
            })}
            {frontier.length > 1 && !hideNonOptimal && (
              <div className="flex items-center gap-1.5 px-1 py-0.5 text-2xs">
                <span className="text-red-400">- -</span>
                <span className="text-muted-foreground/60">{t('paretoFrontier.paretoFrontier')}</span>
              </div>
            )}
          </div>

          {/* Reset filter link */}
          <button
            onClick={resetFilters}
            className="text-2xs text-muted-foreground hover:text-foreground px-1 py-0.5 text-left transition-colors"
          >
            {t('paretoFrontier.resetFilter')} &rarr;|
          </button>

          {/* Toggle controls */}
          <div className="border-t border-border/50 mt-1 pt-1.5 space-y-1 shrink-0">
            <Toggle label={t('paretoFrontier.hideNonOptimal')} active={hideNonOptimal} onChange={setHideNonOptimal} />
            <Toggle label={t('paretoFrontier.hideLabels')} active={hideLabels} onChange={setHideLabels} />
            <Toggle label={t('paretoFrontier.highContrast')} active={highContrast} onChange={setHighContrast} />
          </div>
        </div>
      </div>

      {/* Bottom hint */}
      <p className="text-center text-[9px] text-muted-foreground/50 mt-1 shrink-0">
        {t('paretoFrontier.scrollToPan')}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FilterDropdown — labeled select dropdown
// ---------------------------------------------------------------------------

function FilterDropdown({
  label,
  value,
  onChange,
  options,
  optionLabels,
  noAllOption }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  optionLabels?: Record<string, string>
  noAllOption?: boolean
}) {
  const { t } = useTranslation(['cards', 'common'])
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xs text-muted-foreground font-medium">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-secondary border border-border rounded px-2 py-1 text-[11px] text-foreground min-w-[100px]"
      >
        {!noAllOption && <option value="all">{t('common:common.all')}</option>}
        {options.map(o => (
          <option key={o} value={o}>{optionLabels?.[o] ?? o}</option>
        ))}
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toggle switch — small pill-style toggle
// ---------------------------------------------------------------------------

function Toggle({ label, active, onChange }: { label: string; active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!active)} className="flex flex-wrap items-center justify-between gap-y-2 w-full group">
      <span className="text-2xs text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
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

export function ParetoFrontier(props: ParetoFrontierProps) {
  return (
    <DynamicCardErrorBoundary cardId="ParetoFrontier">
      <ParetoFrontierInternal {...props} />
    </DynamicCardErrorBoundary>
  )
}

export default ParetoFrontier
