/**
 * ChartVisualization - Renders data as various chart types
 *
 * Supports: line, bar, donut, gauge, sparkline, area
 * Uses echarts-for-react for rendering.
 *
 * Per-chart-type renderers live under ./charts/ — this file is the
 * composition root that dispatches to the correct renderer based on
 * content.chartType.
 */

import type { CardContentChart, CardChartSeries } from '../../types'
import { LineChartRenderer } from './charts/LineChartRenderer'
import { AreaChartRenderer } from './charts/AreaChartRenderer'
import { BarChartRenderer } from './charts/BarChartRenderer'
import { DonutChartRenderer } from './charts/DonutChartRenderer'
import { GaugeChartRenderer } from './charts/GaugeChartRenderer'
import { SparklineRenderer } from './charts/SparklineRenderer'

export interface ChartVisualizationProps {
  /** Content configuration */
  content: CardContentChart
  /** Data to display */
  data: unknown[]
}

/**
 * ChartVisualization - Renders charts from config
 */
export function ChartVisualization({ content, data }: ChartVisualizationProps) {
  const {
    chartType,
    series: rawSeries,
    xAxis,
    yAxis,
    showLegend = true,
    height = 200 } = content

  // Derive series from yAxis if not explicitly provided
  const series: CardChartSeries[] = rawSeries ?? (
    Array.isArray(yAxis)
      ? yAxis.map(field => ({ field }))
      : yAxis && typeof yAxis === 'string'
        ? [{ field: yAxis }]
        : []
  )

  // Render the appropriate chart type
  switch (chartType) {
    case 'line':
      return (
        <LineChartRenderer
          data={data}
          series={series}
          xAxis={xAxis}
          yAxis={yAxis}
          showLegend={showLegend}
          height={height}
        />
      )

    case 'area':
      return (
        <AreaChartRenderer
          data={data}
          series={series}
          xAxis={xAxis}
          yAxis={yAxis}
          showLegend={showLegend}
          height={height}
        />
      )

    case 'bar':
      return (
        <BarChartRenderer
          data={data}
          series={series}
          xAxis={xAxis}
          yAxis={yAxis}
          showLegend={showLegend}
          height={height}
        />
      )

    case 'donut':
      return (
        <DonutChartRenderer
          data={data}
          series={series}
          showLegend={showLegend}
          height={height}
        />
      )

    case 'gauge':
      return (
        <GaugeChartRenderer
          data={data}
          series={series}
          height={height}
        />
      )

    case 'sparkline':
      return (
        <SparklineRenderer
          data={data}
          series={series}
          height={height}
        />
      )

    default:
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Unknown chart type: {chartType}
        </div>
      )
  }
}

export default ChartVisualization
