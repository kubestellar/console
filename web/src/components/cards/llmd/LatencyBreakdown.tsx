/**
 * LatencyBreakdown -- Latency metrics under increasing load
 *
 * Line chart: X = QPS (queries/sec), Y = latency (ms).
 * Tabs for TTFT p50, TPOT p50, p99 Request Latency, ITL.
 * Shows how latency degrades as load increases.
 */
import { useState, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { Clock, AlertTriangle } from 'lucide-react'
import { useReportCardDataState } from '../CardDataContext'
import { useCachedBenchmarkReports } from '../../../hooks/useBenchmarkData'
import { DynamicCardErrorBoundary } from '../DynamicCardErrorBoundary'
import {
  groupByExperiment,
  getFilterOptions,
  type ScalingPoint } from '../../../lib/llmd/benchmarkDataUtils'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../../ui/StatusBadge'

type MetricTab = 'ttftP50Ms' | 'tpotP50Ms' | 'p99LatencyMs' | 'itlP50Ms' | 'requestLatencyMs'

const TABS: { key: MetricTab; label: string; unit: string; sla?: number }[] = [
  { key: 'ttftP50Ms', label: 'TTFT p50', unit: 'ms', sla: 100 },
  { key: 'tpotP50Ms', label: 'TPOT p50', unit: 'ms' },
  { key: 'p99LatencyMs', label: 'p99 Latency', unit: 'ms', sla: 5000 },
  { key: 'itlP50Ms', label: 'ITL p50', unit: 'ms' },
  { key: 'requestLatencyMs', label: 'Request p50', unit: 'ms' },
]

interface ChartRow {
  qps: number
  [lineKey: string]: number | undefined
}

function LatencyBreakdownInternal() {
  const { t } = useTranslation()
  const { data: reports, isDemoFallback, isFailed, consecutiveFailures, isLoading, isRefreshing, lastRefresh } = useCachedBenchmarkReports()
  const effectiveReports = reports ?? []
  const lastUpdated = lastRefresh ? new Date(lastRefresh) : null
  useReportCardDataState({
    isDemoData: isDemoFallback, isFailed, consecutiveFailures, isLoading, isRefreshing,
    hasData: effectiveReports.length > 0,
    lastUpdated })

  const filterOpts = getFilterOptions(effectiveReports)
  const [tab, setTab] = useState<MetricTab>('ttftP50Ms')
  const [category, setCategory] = useState<string>('all')
  const [islFilter, setIslFilter] = useState<number>(0)
  const [oslFilter, setOslFilter] = useState<number>(0)

  const tabInfo = TABS.find(t => t.key === tab)!

  const groups = groupByExperiment(effectiveReports, {
    category: category !== 'all' ? category : undefined,
    isl: islFilter || undefined,
    osl: oslFilter || undefined })

  const { chartData, maxLatency } = useMemo(() => {
    const qpsSet = new Set<number>()
    groups.forEach(g => g.points.forEach(p => qpsSet.add(p.qps)))
    const allQps = [...qpsSet].sort((a, b) => a - b)

    let maxLat = 0
    const data: ChartRow[] = allQps.map(qps => {
      const row: ChartRow = { qps }
      for (const g of groups) {
        const pt = g.points.find(p => p.qps === qps)
        const val = pt?.[tab as keyof ScalingPoint] as number | undefined
        row[g.shortVariant] = val
        if (val && val > maxLat) maxLat = val
      }
      return row
    })
    return { chartData: data, maxLatency: maxLat }
  }, [groups, tab])

  // Find worst offender at max QPS
  const degradationWarning = (() => {
    if (groups.length === 0) return null
    let worstIncrease = 0
    let worstVariant = ''
    for (const g of groups) {
      if (g.points.length < 2) continue
      const first = g.points[0]?.[tab as keyof ScalingPoint] as number
      const last = g.points[g.points.length - 1]?.[tab as keyof ScalingPoint] as number
      if (first > 0) {
        const increase = ((last / first) - 1) * 100
        if (increase > worstIncrease) {
          worstIncrease = increase
          worstVariant = g.shortVariant
        }
      }
    }
    return worstIncrease > 50 ? { variant: worstVariant, increase: worstIncrease } : null
  })()

  const chartOption = useMemo(() => {
    if (chartData.length === 0) return {}

    const seriesData = groups.flatMap(g => [
      {
        name: g.shortVariant,
        type: 'line' as const,
        smooth: true,
        data: chartData.map(d => d[g.shortVariant] ?? null),
        lineStyle: { color: g.color, width: 2.5 },
        itemStyle: { color: g.color },
        symbolSize: 6,
        connectNulls: true,
        z: 2,
      },
      {
        name: `${g.shortVariant}_area`,
        type: 'line' as const,
        smooth: true,
        data: chartData.map(d => d[g.shortVariant] ?? null),
        lineStyle: { width: 0 },
        itemStyle: { color: g.color },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: g.color + '26' }, { offset: 1, color: g.color + '00' }] },
        },
        showSymbol: false,
        connectNulls: true,
        silent: true,
        z: 1,
      },
    ])

    return {
      backgroundColor: 'transparent',
      grid: { left: 55, right: 20, top: 10, bottom: 45 },
      xAxis: {
        type: 'category' as const,
        data: chartData.map(d => d.qps),
        name: 'QPS (queries/sec)',
        nameLocation: 'middle' as const,
        nameGap: 30,
        nameTextStyle: { color: '#71717a', fontSize: 10 },
        axisLabel: { color: '#71717a', fontSize: 10 },
        axisLine: { lineStyle: { color: '#71717a' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        name: tabInfo.unit,
        nameLocation: 'middle' as const,
        nameGap: 40,
        nameTextStyle: { color: '#71717a', fontSize: 10 },
        axisLabel: { color: '#71717a', fontSize: 10 },
        axisLine: { lineStyle: { color: '#71717a' } },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#334155', opacity: 0.5, type: 'dashed' as const } },
      },
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: 'rgba(100,116,139,0.3)',
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params: Array<{ seriesName: string; value: number | null; color: string }>) => {
          const qps = chartData[(params[0] as unknown as { dataIndex: number }).dataIndex]?.qps ?? ''
          const items = (params || [])
            .filter(p => !p.seriesName.endsWith('_area') && p.value !== null && p.value !== undefined)
            .sort((a, b) => (a.value ?? 0) - (b.value ?? 0))
          let html = `<div style="font-weight:500;margin-bottom:4px">QPS: ${qps}</div>`
          for (const p of items) {
            html += `<div style="display:flex;align-items:center;gap:6px;padding:1px 0"><div style="width:8px;height:8px;border-radius:50%;background:${p.color}"></div><span>${p.seriesName}</span><span style="font-family:monospace;margin-left:auto">${(p.value ?? 0).toFixed(1)} ${tabInfo.unit}</span></div>`
          }
          return html
        },
      },
      series: [
        ...seriesData,
        ...(tabInfo.sla && maxLatency > tabInfo.sla * 0.5 ? [{
          type: 'line' as const,
          markLine: {
            silent: true,
            symbol: 'none',
            data: [{
              yAxis: tabInfo.sla,
              label: { formatter: `SLA: ${tabInfo.sla}ms`, position: 'end' as const, color: '#ef4444', fontSize: 9 },
              lineStyle: { color: '#ef4444', type: 'dashed' as const, opacity: 0.6 },
            }],
          },
          data: [],
        }] : []),
      ],
    }
  }, [chartData, groups, tabInfo, maxLatency])

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-yellow-400" />
          <span className="text-sm font-medium text-white">Latency Under Load</span>
          {degradationWarning && (
            <StatusBadge color="red" size="xs" rounded="full">
              <AlertTriangle size={10} />
              {degradationWarning.variant}: +{degradationWarning.increase.toFixed(0)}% at peak
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
            value={islFilter}
            onChange={e => setIslFilter(Number(e.target.value))}
            className="bg-secondary border border-border rounded px-2 py-1 text-[11px] text-white"
          >
            <option value={0}>All ISL</option>
            {filterOpts.islValues.map(v => <option key={v} value={v}>ISL {v}</option>)}
          </select>
          <select
            value={oslFilter}
            onChange={e => setOslFilter(Number(e.target.value))}
            className="bg-secondary border border-border rounded px-2 py-1 text-[11px] text-white"
          >
            <option value={0}>All OSL</option>
            {filterOpts.oslValues.map(v => <option key={v} value={v}>OSL {v}</option>)}
          </select>
        </div>
      </div>

      {/* Metric tabs */}
      <div className="flex gap-1 mb-3 bg-secondary/80 rounded-lg p-0.5 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
              tab === t.key ? 'bg-yellow-500/20 text-yellow-400' : 'text-muted-foreground hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0" style={{ minHeight: 200 }}>
        {chartData.length > 0 ? (
          <ReactECharts
            option={chartOption}
            style={{ height: '100%', width: '100%' }}
            notMerge={true}
            opts={{ renderer: 'svg' }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No data available for selected filters
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-2xs">
        {groups.map((g, i) => (
          <div key={g.shortVariant || `group-${i}`} className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: g.color }} />
            <span className="text-muted-foreground">{g.shortVariant}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LatencyBreakdown() {
  return (
    <DynamicCardErrorBoundary cardId="LatencyBreakdown">
      <LatencyBreakdownInternal />
    </DynamicCardErrorBoundary>
  )
}

export default LatencyBreakdown
