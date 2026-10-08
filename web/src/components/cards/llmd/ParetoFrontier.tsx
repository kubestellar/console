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
import { CHART_MIN_HEIGHT_PX } from '../../../lib/constants/ui'
import { CHART_PRESETS, resolveInitialChartKey } from './ParetoFrontier.presets'
import { FilterDropdown, Toggle } from './ParetoFrontier.controls'
import { useParetoFrontierChartOption } from './useParetoFrontierChartOption'

const THIN_SCROLLBAR_STYLE = { scrollbarWidth: 'thin' } as const

const LEGEND_PANEL_WIDTH_PX = 130

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
  const initialChart = resolveInitialChartKey(config?.chartType)

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
  const option = useParetoFrontierChartOption({
    seriesMap,
    frontier,
    hideNonOptimal,
    hideLabels,
    highContrast,
    hiddenHw,
    preset })

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
          <div className="flex-1 overflow-y-auto space-y-px" style={THIN_SCROLLBAR_STYLE}>
            {legendItems.map(({ hw, color }) => {
              const hidden = hiddenHw.has(hw)
              return (
                <button
                  key={hw}
                  onClick={() => toggleHw(hw)}
                  className={`flex items-center gap-1.5 w-full text-left px-1 py-0.5 rounded text-xs hover:bg-secondary/60 transition-opacity ${
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

export function ParetoFrontier(props: ParetoFrontierProps) {
  return (
    <DynamicCardErrorBoundary cardId="ParetoFrontier">
      <ParetoFrontierInternal {...props} />
    </DynamicCardErrorBoundary>
  )
}

export default ParetoFrontier
