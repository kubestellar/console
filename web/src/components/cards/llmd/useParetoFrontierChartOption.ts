/**
 * useParetoFrontierChartOption — builds the ECharts option for ParetoFrontier.
 *
 * Produces one smooth line series per visible hardware type plus an optional
 * dashed Pareto frontier series, along with tooltip and axis configuration
 * derived from the active chart preset.
 */
import { useMemo } from 'react'
import {
  HARDWARE_COLORS,
  getHardwareShort,
  getModelShort,
  type ParetoPoint } from '../../../lib/llmd/benchmarkMockData'
import { CHART_AXIS_FONT_SIZE, CHART_AXIS_FONT_SIZE_SM } from '../../../lib/constants/ui'
import {
  TOOLTIP_SWATCH_SIZE_PX,
  TOOLTIP_BADGE_PAD_V_PX,
  TOOLTIP_GRID_GAP_ROW_PX,
  TOOLTIP_GRID_GAP_COL_PX,
  TOOLTIP_BADGE_RADIUS_PX,
} from '../../../lib/llmd/tooltipSpacing'
import type { ChartPreset, EChartsFormatterParam, EChartsSeriesConfig } from './ParetoFrontier.presets'

/** Header bottom margin — larger than the shared 4px token for visual weight */
const TOOLTIP_HEADER_MARGIN_PX = 8

export interface ParetoFrontierChartOptionParams {
  seriesMap: Map<string, ParetoPoint[]>
  frontier: ParetoPoint[]
  hideNonOptimal: boolean
  hideLabels: boolean
  highContrast: boolean
  hiddenHw: Set<string>
  preset: ChartPreset
}

export function useParetoFrontierChartOption({
  seriesMap,
  frontier,
  hideNonOptimal,
  hideLabels,
  highContrast,
  hiddenHw,
  preset }: ParetoFrontierChartOptionParams) {
  return useMemo(() => {
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
            `<div style="font-weight:600;margin-bottom:${TOOLTIP_HEADER_MARGIN_PX}px;color:#f1f5f9">${model} ` +
            `<span style="color:#94a3b8">${hw}</span> ` +
            `<span style="background:${c}30;color:${c};padding:${TOOLTIP_BADGE_PAD_V_PX}px ${TOOLTIP_SWATCH_SIZE_PX}px;border-radius:${TOOLTIP_BADGE_RADIUS_PX}px;font-size:10px">${pt.config}</span></div>` +
            `<div style="display:grid;grid-template-columns:auto auto;gap:${TOOLTIP_GRID_GAP_ROW_PX}px ${TOOLTIP_GRID_GAP_COL_PX}px;font-size:11px">` +
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
        axisLabel: { color: '#94a3b8', fontSize: CHART_AXIS_FONT_SIZE } },
      yAxis: {
        type: 'value',
        name: `${preset.yAxis.label} (${preset.yAxis.unit})`,
        nameLocation: 'middle',
        nameGap: 58,
        nameTextStyle: { color: '#94a3b8', fontSize: 11, fontWeight: 500 },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
        axisLabel: {
          color: '#94a3b8',
          fontSize: CHART_AXIS_FONT_SIZE,
          formatter: preset.yAxis.formatter ?? ((v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)) } },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'weakFilter' },
        { type: 'inside', yAxisIndex: 0, filterMode: 'weakFilter' },
      ],
      series: allSeries }
  }, [seriesMap, frontier, hideNonOptimal, hideLabels, highContrast, hiddenHw, preset])
}
