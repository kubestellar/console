/**
 * ThroughputComparison -- Throughput scaling under increasing load
 *
 * Line chart: X = QPS (queries/sec), Y = output throughput (tok/s).
 * One line per experiment variant. Shows how throughput scales with load.
 * Filter by experiment category, ISL/OSL, and model.
 */
import { useState, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { Zap, TrendingUp } from 'lucide-react'
import { useReportCardDataState } from '../CardDataContext'
import { useCachedBenchmarkReports } from '../../../hooks/useBenchmarkData'
import {
  generateBenchmarkReports } from '../../../lib/llmd/benchmarkMockData'
import {
  groupByExperiment,
  getFilterOptions,
  type ExperimentGroup } from '../../../lib/llmd/benchmarkDataUtils'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../../ui/StatusBadge'

interface ChartRow {
  qps: number
  [lineKey: string]: number | undefined
}

export function ThroughputComparison() {
  const { t } = useTranslation()
  const { data: liveReports, isDemoFallback, isFailed, consecutiveFailures, isLoading, isRefreshing } = useCachedBenchmarkReports()
  const effectiveReports = isDemoFallback ? generateBenchmarkReports() : (liveReports ?? [])
  useReportCardDataState({
    isDemoData: isDemoFallback, isFailed, consecutiveFailures, isLoading, isRefreshing,
    hasData: effectiveReports.length > 0 })

  const filterOpts = getFilterOptions(effectiveReports)
  const [category, setCategory] = useState<string>('all')
  const [islFilter, setIslFilter] = useState<number>(0)
  const [oslFilter, setOslFilter] = useState<number>(0)

  const groups = groupByExperiment(effectiveReports, {
    category: category !== 'all' ? category : undefined,
    isl: islFilter || undefined,
    osl: oslFilter || undefined })

  // Build chart data: one row per QPS, columns per experiment
  const { chartData } = useMemo(() => {
    const qpsSet = new Set<number>()
    groups.forEach(g => g.points.forEach(p => qpsSet.add(p.qps)))
    const allQps = [...qpsSet].sort((a, b) => a - b)

    const keys = groups.map(g => g.shortVariant)
    const data: ChartRow[] = allQps.map(qps => {
      const row: ChartRow = { qps }
      for (const g of groups) {
        const pt = g.points.find(p => p.qps === qps)
        row[g.shortVariant] = pt?.throughput
      }
      return row
    })
    return { chartData: data, lineKeys: keys }
  }, [groups])

  // Peak throughput summary
  const peakInfo = (() => {
    let best: ExperimentGroup | null = null
    let bestVal = 0
    for (const g of groups) {
      const peak = Math.max(...g.points.map(p => p.throughput))
      if (peak > bestVal) { bestVal = peak; best = g }
    }
    return best ? { variant: best.shortVariant, value: bestVal } : null
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
            colorStops: [{ offset: 0, color: g.color + '33' }, { offset: 1, color: g.color + '00' }] },
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
        name: 'tok/s',
        nameLocation: 'middle' as const,
        nameGap: 40,
        nameTextStyle: { color: '#71717a', fontSize: 10 },
        axisLabel: {
          color: '#71717a',
          fontSize: 10,
          formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v),
        },
        axisLine: { lineStyle: { color: '#71717a' } },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#334155', opacity: 0.5, type: 'dashed' as const } },
      },
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: 'rgba(100,116,139,0.3)',
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params: Array<{ seriesName: string; value: number | null; color: string; dataIndex: number }>) => {
          const qps = chartData[params[0]?.dataIndex]?.qps ?? ''
          const items = (params || [])
            .filter(p => !p.seriesName.endsWith('_area') && p.value !== null && p.value !== undefined)
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
          let html = `<div style="font-weight:500;margin-bottom:4px">QPS: ${qps}</div>`
          for (const p of items) {
            html += `<div style="display:flex;align-items:center;gap:6px;padding:1px 0"><div style="width:8px;height:8px;border-radius:50%;background:${p.color}"></div><span>${p.seriesName}</span><span style="font-family:monospace;margin-left:auto">${(p.value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>`
          }
          return html
        },
      },
      series: seriesData,
    }
  }, [chartData, groups])

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-blue-400" />
          <span className="text-sm font-medium text-white">Throughput Scaling</span>
          {peakInfo && (
            <StatusBadge color="blue" size="xs" rounded="full">
              <TrendingUp size={10} />
              Peak: {peakInfo.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} tok/s
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

export default ThroughputComparison
