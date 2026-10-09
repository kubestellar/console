import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_TEXT_COLOR,
  CHART_TOOLTIP_LABEL_COLOR,
  CHART_DATAZOOM_BORDER,
  CHART_DATAZOOM_BG,
  CHART_DATAZOOM_FILLER,
  CHART_DATAZOOM_HANDLE,
  CHART_DATAZOOM_TEXT,
  CHART_DATAZOOM_DATA_LINE,
  CHART_DATAZOOM_DATA_AREA,
  CHART_TICK_COLOR,
  CHART_GRID_STROKE,
  CHART_TEXT_MUTED,
  CHART_AXIS_FONT_SIZE,
  CHART_BODY_FONT_SIZE,
  CHART_LEGEND_FONT_SIZE,
} from '../../lib/constants'
import { hexToRgba } from '../../lib/theme/chartColors'
import { TOOLTIP_INLINE_GAP_PX } from '../../lib/llmd/tooltipSpacing'
import type { DailyStats } from './IssueActivityChart.data'

const CHART_GRID_LEFT = 50
const CHART_GRID_RIGHT = 50
const CHART_GRID_TOP = 40
const CHART_GRID_BOTTOM = 80
/** Bar chart color for issues opened */
const COLOR_OPENED = '#4472C4'
/** Bar chart color for issues closed */
const COLOR_CLOSED = '#70AD47'
/** Line color for PRs merged */
const COLOR_PR_MERGED = '#ED7D31'
/** ECharts bar border radius for top corners */
const BAR_BORDER_RADIUS: [number, number, number, number] = [3, 3, 0, 0]
/** Slider height in pixels for the dataZoom slider control */
const DATA_ZOOM_SLIDER_HEIGHT_PX = 20
/** Slider bottom offset in pixels */
const DATA_ZOOM_SLIDER_BOTTOM_PX = 5
/** Opacity for area-fill behind the PR-merged line */
const PR_MERGED_AREA_ALPHA = 0.08
/** Font size for dataZoom text labels */
const DATAZOOM_FONT_SIZE = 10
/** Full zoom range start percentage */
export const ZOOM_RANGE_START = 0
/** Full zoom range end percentage */
export const ZOOM_RANGE_END = 100

/** Builds the ECharts option for the issue/PR activity chart. */
export function useIssueActivityChartOption(stats: DailyStats[] | undefined) {
  const { t } = useTranslation('cards')
  return useMemo(() => {
    const dates = (stats || []).map(s => s.date)
    const opened = (stats || []).map(s => s.opened)
    const closed = (stats || []).map(s => s.closed)
    const prsMerged = (stats || []).map(s => s.prsMerged)

    return {
      backgroundColor: 'transparent',
      grid: { left: CHART_GRID_LEFT, right: CHART_GRID_RIGHT, top: CHART_GRID_TOP, bottom: CHART_GRID_BOTTOM, containLabel: false },
      legend: {
        data: [
          t('issueActivityChart.opened', 'Opened'),
          t('issueActivityChart.closed', 'Closed'),
          t('issueActivityChart.prsMerged', 'PRs Merged'),
        ],
        top: 8,
        textStyle: { color: CHART_TEXT_MUTED, fontSize: CHART_LEGEND_FONT_SIZE },
        itemWidth: 14,
        itemHeight: 10,
      },
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow-sm' as const },
        backgroundColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).backgroundColor as string,
        borderColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).borderColor as string,
        textStyle: { color: CHART_TOOLTIP_TEXT_COLOR, fontSize: CHART_BODY_FONT_SIZE },
        formatter: (
          params: Array<{ seriesName: string; value: number; color: string; axisValueLabel: string }>
        ) => {
          if (!Array.isArray(params) || params.length === 0) return ''
          const rawDate = params[0].axisValueLabel
          const d = new Date(rawDate + 'T00:00:00')
          const dow = d.toLocaleDateString('en-US', { weekday: 'long' })
          const fullDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          const dateLabel = `<span style="color:${CHART_TOOLTIP_LABEL_COLOR};font-weight:600">${dow}, ${fullDate}</span>`
          const lines = params.map(
            p =>
              `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};margin-right:${TOOLTIP_INLINE_GAP_PX}px;"></span>${p.seriesName}: <b>${p.value}</b>`
          )
          return `${dateLabel}<br/>${lines.join('<br/>')}`
        },
      },
      xAxis: {
        type: 'category' as const,
        data: dates,
        axisLabel: {
          color: CHART_TICK_COLOR,
          fontSize: CHART_AXIS_FONT_SIZE,
          rotate: 45,
          formatter: (val: string) => {
            // Show "Mon Mar 15" so users can see day-of-week seasonality
            const d = new Date(val + 'T00:00:00')
            const dow = d.toLocaleDateString('en-US', { weekday: 'short' })
            const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            return `${dow} ${date}`
          },
          // Show ~15 labels max regardless of date range
          interval: Math.max(0, Math.floor(dates.length / 15) - 1),
        },
        axisLine: { lineStyle: { color: CHART_GRID_STROKE } },
        axisTick: { show: false },
      },
      yAxis: [
        {
          type: 'value' as const,
          name: t('issueActivityChart.issues', 'Issues'),
          nameTextStyle: { color: CHART_TICK_COLOR, fontSize: CHART_AXIS_FONT_SIZE },
          axisLabel: { color: CHART_TICK_COLOR, fontSize: CHART_AXIS_FONT_SIZE },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: CHART_GRID_STROKE, type: 'dashed' as const } },
          minInterval: 1,
        },
        {
          type: 'value' as const,
          name: t('issueActivityChart.prs', 'PRs'),
          nameTextStyle: { color: CHART_TICK_COLOR, fontSize: CHART_AXIS_FONT_SIZE },
          axisLabel: { color: CHART_TICK_COLOR, fontSize: CHART_AXIS_FONT_SIZE },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          minInterval: 1,
        },
      ],
      series: [
        {
          name: t('issueActivityChart.opened', 'Opened'),
          type: 'bar',
          data: opened,
          itemStyle: { color: COLOR_OPENED, borderRadius: BAR_BORDER_RADIUS },
          barMaxWidth: 12,
        },
        {
          name: t('issueActivityChart.closed', 'Closed'),
          type: 'bar',
          data: closed,
          itemStyle: { color: COLOR_CLOSED, borderRadius: BAR_BORDER_RADIUS },
          barMaxWidth: 12,
        },
        {
          name: t('issueActivityChart.prsMerged', 'PRs Merged'),
          type: 'line',
          yAxisIndex: 1,
          data: prsMerged,
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { color: COLOR_PR_MERGED, width: 2 },
          itemStyle: { color: COLOR_PR_MERGED },
          areaStyle: { color: hexToRgba(COLOR_PR_MERGED, PR_MERGED_AREA_ALPHA) },
        },
      ],
      dataZoom: [
        {
          type: 'inside' as const,
          start: ZOOM_RANGE_START,
          end: ZOOM_RANGE_END,
        },
        {
          type: 'slider' as const,
          start: ZOOM_RANGE_START,
          end: ZOOM_RANGE_END,
          height: DATA_ZOOM_SLIDER_HEIGHT_PX,
          bottom: DATA_ZOOM_SLIDER_BOTTOM_PX,
          borderColor: CHART_DATAZOOM_BORDER,
          backgroundColor: CHART_DATAZOOM_BG,
          fillerColor: CHART_DATAZOOM_FILLER,
          handleStyle: { color: CHART_DATAZOOM_HANDLE },
          textStyle: { color: CHART_DATAZOOM_TEXT, fontSize: DATAZOOM_FONT_SIZE },
          dataBackground: {
            lineStyle: { color: CHART_DATAZOOM_DATA_LINE },
            areaStyle: { color: CHART_DATAZOOM_DATA_AREA },
          },
        },
      ],
    }
  }, [stats, t])
}
