/**
 * ResourceUtilization -- Experiment comparison at selected QPS
 *
 * Horizontal grouped bar chart comparing all experiment variants.
 * Shows throughput, TTFT, TPOT, and p99 latency side by side.
 * Highlight best-in-class for each metric.
 */
import { useState, useMemo } from 'react'
import { LazyEChart } from '../../charts/LazyEChart'
import { BarChart3, Trophy } from 'lucide-react'
import { RefreshIndicator } from '../../ui/RefreshIndicator'
import { useReportCardDataState } from '../CardDataContext'
import { useCachedBenchmarkReports } from '../../../hooks/useBenchmarkData'
import { generateBenchmarkReports } from '../../../lib/llmd/benchmarkMockData'
import {
  groupByExperiment,
  getFilterOptions,
  CONFIG_TYPE_COLORS } from '../../../lib/llmd/benchmarkDataUtils'
import {
  TOOLTIP_HEADER_MARGIN_PX,
  TOOLTIP_TIGHT_GAP_PX } from '../../../lib/llmd/tooltipSpacing'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../../ui/StatusBadge'
import { CHART_MIN_HEIGHT_PX } from '../../../lib/constants/ui'

const GRID_LEFT_PX = 145
const GRID_RIGHT_PX = 20
const GRID_TOP_PX = 5
const GRID_BOTTOM_PX = 20

type MetricMode = 'throughput' | 'ttftP50Ms' | 'tpotP50Ms' | 'p99LatencyMs'

const MODES: { key: MetricMode; label: string; unit: string; higherBetter: boolean }[] = [
  { key: 'throughput', label: 'Throughput', unit: 'tok/s', higherBetter: true },
  { key: 'ttftP50Ms', label: 'TTFT p50', unit: 'ms', higherBetter: false },
  { key: 'tpotP50Ms', label: 'TPOT p50', unit: 'ms', higherBetter: false },
  { key: 'p99LatencyMs', label: 'p99 Latency', unit: 'ms', higherBetter: false },
]

interface BarEntry {
  name: string
  value: number
  config: string
  color: string
  isBest: boolean
  fullVariant: string
}

export function ResourceUtilization() {
  const { t } = useTranslation()
  const { data: liveReports, isDemoFallback, isFailed, consecutiveFailures, isLoading, isRefreshing, lastRefresh } = useCachedBenchmarkReports()
  const effectiveReports = isDemoFallback ? generateBenchmarkReports() : (liveReports ?? [])
  useReportCardDataState({
    isDemoData: isDemoFallback, isFailed, consecutiveFailures, isLoading, isRefreshing,
    hasData: effectiveReports.length > 0 })

  const filterOpts = getFilterOptions(effectiveReports)
  const [mode, setMode] = useState<MetricMode>('throughput')
  const [category, setCategory] = useState<string>('all')
  const groups = groupByExperiment(effectiveReports, {
    category: category !== 'all' ? category : undefined })

  // Get available QPS values and default to highest
  const qpsValues = (() => {
    const vals = new Set<number>()
    groups.forEach(g => g.points.forEach(p => vals.add(p.qps)))
    return [...vals].sort((a, b) => a - b)
  })()

  const [qpsFilter, setQpsFilter] = useState<number>(0)
  const effectiveQps = qpsFilter || (qpsValues.length > 0 ? qpsValues[qpsValues.length - 1] : 0)

  const modeInfo = MODES.find(m => m.key === mode)!

  const { data, bestVariant, bestValue } = useMemo(() => {
    const entries: BarEntry[] = []

    for (const g of groups) {
      const pt = g.points.find(p => p.qps === effectiveQps)
      if (!pt) continue
      const val = mode === 'throughput' ? pt.throughput : pt[mode]
      entries.push({
        name: g.shortVariant,
        value: val,
        config: g.config,
        color: g.color,
        isBest: false,
        fullVariant: `${g.category} / ${g.shortVariant}` })
    }

    // Mark best
    if (entries.length > 0) {
      const sorted = [...entries].sort((a, b) =>
        modeInfo.higherBetter ? b.value - a.value : a.value - b.value
      )
      sorted[0].isBest = true
    }

    const best = entries.find(e => e.isBest)

    return {
      data: entries.sort((a, b) =>
        modeInfo.higherBetter ? b.value - a.value : a.value - b.value
      ),
      bestVariant: best?.name ?? '',
      bestValue: best?.value ?? 0 }
  }, [groups, effectiveQps, mode, modeInfo.higherBetter])

  const chartOption = useMemo(() => {
    if (data.length === 0) return {}
    return {
      backgroundColor: 'transparent',
      grid: { left: GRID_LEFT_PX, right: GRID_RIGHT_PX, top: GRID_TOP_PX, bottom: GRID_BOTTOM_PX },
      xAxis: {
        type: 'value' as const,
        axisLabel: {
          color: '#71717a',
          fontSize: 10,
          formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)),
        },
        axisLine: { lineStyle: { color: '#71717a' } },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#334155', opacity: 0.3 } },
      },
      yAxis: {
        type: 'category' as const,
        data: data.map(d => d.name),
        axisLabel: {
          color: (value: string) => {
            const entry = data.find(d => d.name === value)
            return entry?.isBest ? '#fbbf24' : '#a1a1aa'
          },
          fontSize: 10,
          fontWeight: ((value: string) => {
            const entry = data.find(d => d.name === value)
            return entry?.isBest ? 600 : 400
          }) as unknown as number,
          formatter: (value: string) => {
            const entry = data.find(d => d.name === value)
            return entry?.isBest ? `\u2605 ${value}` : value
          },
        },
        axisLine: { lineStyle: { color: '#71717a' } },
        axisTick: { show: false },
      },
      tooltip: {
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: 'rgba(100,116,139,0.3)',
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params: { data: { entry: BarEntry } }) => {
          const e = params.data?.entry
          if (!e) return ''
          return `<div style="font-weight:500;margin-bottom:${TOOLTIP_HEADER_MARGIN_PX}px">${e.fullVariant}</div>` +
            `<div>Value: <span style="font-family:monospace">${e.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>` +
            `${e.isBest ? ' \u2B50' : ''}</div>` +
            `<div style="color:#a1a1aa;margin-top:${TOOLTIP_TIGHT_GAP_PX}px">Type: <span style="color:${CONFIG_TYPE_COLORS[e.config as keyof typeof CONFIG_TYPE_COLORS]}">${e.config}</span></div>`
        },
      },
      series: [{
        type: 'bar',
        barSize: 16,
        data: data.map(entry => ({
          value: entry.value,
          entry,
          itemStyle: {
            color: entry.color,
            opacity: entry.isBest ? 1 : 0.7,
            borderColor: entry.isBest ? '#fbbf24' : 'transparent',
            borderWidth: entry.isBest ? 2 : 0,
            borderRadius: [0, 4, 4, 0],
          },
        })),
      }],
    }
  }, [data])

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-green-400" />
          <span className="text-sm font-medium text-white">Experiment Comparison</span>
          <RefreshIndicator
            isRefreshing={isRefreshing}
            lastUpdated={lastRefresh ? new Date(lastRefresh) : null}
            size="xs"
            showLabel={true}
          />
          {bestVariant && (
            <StatusBadge color="green" size="xs" rounded="full">
              <Trophy size={10} />
              Best: {bestVariant} ({bestValue.toLocaleString(undefined, { maximumFractionDigits: 1 })} {modeInfo.unit})
            </StatusBadge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="bg-secondary border border-border rounded px-2 py-1 text-[11px] text-white"
          >
            <option value="all">{t('selectors.allCategories')}</option>
            {filterOpts.categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={qpsFilter}
            onChange={e => setQpsFilter(Number(e.target.value))}
            className="bg-secondary border border-border rounded px-2 py-1 text-[11px] text-white"
          >
            <option value={0}>Peak QPS ({effectiveQps})</option>
            {qpsValues.map(q => <option key={q} value={q}>QPS {q}</option>)}
          </select>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 mb-3 bg-secondary/80 rounded-lg p-0.5 w-fit">
        {MODES.map(m => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
              mode === m.key ? 'bg-green-500/20 text-green-400' : 'text-muted-foreground hover:text-white'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0" style={{ minHeight: CHART_MIN_HEIGHT_PX }}>
        {data.length > 0 ? (
          <LazyEChart
            option={chartOption}
            style={{ height: '100%', width: '100%' }}
            notMerge={true}
            opts={{ renderer: 'svg' }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No data for QPS {effectiveQps}
          </div>
        )}
      </div>

      {/* Config type legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-2xs">
        {Object.entries(CONFIG_TYPE_COLORS).map(([cfg, color]) => (
          <div key={cfg} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: color }} />
            <span className="text-muted-foreground">{cfg}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ResourceUtilization
