import { useMemo } from 'react'
import {
  CHART_GRID_STROKE,
  CHART_AXIS_STROKE,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TICK_COLOR,
  CHART_AXIS_FONT_SIZE,
  CHART_BODY_FONT_SIZE,
  CHART_TEXT_MUTED } from '../../lib/constants'
import { getChartColor, getChartColorRgba } from '../../lib/chartColors'
import type { GPUDataPoint } from './GPUUsageTrend.constants'

/** Builds the ECharts option for the GPU usage trend stacked step chart. */
export function useGPUUsageTrendChartOption(history: GPUDataPoint[]) {
  return useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 40, right: 5, top: 5, bottom: 40 },
    xAxis: {
      type: 'category' as const,
      data: history.map(d => d.time),
      axisLabel: { color: CHART_TICK_COLOR, fontSize: CHART_AXIS_FONT_SIZE },
      axisLine: { lineStyle: { color: CHART_AXIS_STROKE } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      minInterval: 1,
      axisLabel: { color: CHART_TICK_COLOR, fontSize: CHART_AXIS_FONT_SIZE },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: CHART_GRID_STROKE, type: 'dashed' as const } },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).backgroundColor as string,
      borderColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).borderColor as string,
      textStyle: { color: CHART_TICK_COLOR, fontSize: CHART_BODY_FONT_SIZE },
      formatter: (params: Array<{ seriesName: string; value: number; color: string }>) => {
        let html = ''
        for (const p of (params || [])) {
          const label = p.seriesName === 'allocated' ? 'In Use' : 'Free'
          html += `<div><span style="color:${p.color}">\u25CF</span> ${label}: ${p.value} GPUs</div>`
        }
        return html
      },
    },
    legend: {
      data: ['In Use', 'Free'],
      bottom: 0,
      textStyle: { color: CHART_TEXT_MUTED, fontSize: CHART_AXIS_FONT_SIZE },
      icon: 'rect',
    },
    series: [
      {
        name: 'allocated',
        type: 'line',
        stack: 'total',
        step: 'end' as const,
        data: history.map(d => d.allocated),
        lineStyle: { color: getChartColor(1), width: 2 },
        itemStyle: { color: getChartColor(1) },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: getChartColorRgba(1, 0.6) }, { offset: 1, color: getChartColorRgba(1, 0.1) }] },
        },
        showSymbol: false,
      },
      {
        name: 'free',
        type: 'line',
        stack: 'total',
        step: 'end' as const,
        data: history.map(d => d.free),
        lineStyle: { color: getChartColor(3), width: 2 },
        itemStyle: { color: getChartColor(3) },
        areaStyle: {
          color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: getChartColorRgba(3, 0.6) }, { offset: 1, color: getChartColorRgba(3, 0.1) }] },
        },
        showSymbol: false,
      },
    ],
  }), [history])
}
