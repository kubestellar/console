import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChartVisualization } from '../ChartVisualization'
import type { CardContentChart } from '../../../types'

// ---------------------------------------------------------------------------
// Mock echarts-for-react — capture the option prop for assertion
// ---------------------------------------------------------------------------

let lastOption: Record<string, unknown> | null = null

vi.mock('echarts-for-react', () => ({
  __esModule: true,
  default: (props: { option: Record<string, unknown>; style?: React.CSSProperties }) => {
    lastOption = props.option
    return <div data-testid="echarts-mock" style={props.style} />
  },
}))

vi.mock('../../../../constants', () => ({
  CHART_TOOLTIP_CONTENT_STYLE_GRAY: {
    backgroundColor: '#1f2937',
    borderColor: '#374151',
    borderRadius: '6px',
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIME_SERIES_DATA = [
  { time: 'Jan', cpu: 40, memory: 60 },
  { time: 'Feb', cpu: 55, memory: 70 },
  { time: 'Mar', cpu: 30, memory: 50 },
]

const DONUT_DATA = [
  { name: 'Running', value: 12 },
  { name: 'Pending', value: 3 },
  { name: 'Failed', value: 1 },
]

const GAUGE_DATA = [{ utilization: 75 }]

function renderChart(content: CardContentChart, data: unknown[] = TIME_SERIES_DATA) {
  lastOption = null
  return render(<ChartVisualization content={content} data={data} />)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChartVisualization', () => {
  // -------------------------------------------------------------------------
  // Line chart
  // -------------------------------------------------------------------------
  describe('line chart', () => {
    it('renders a line chart with series config', () => {
      renderChart({
        type: 'chart',
        chartType: 'line',
        series: [{ field: 'cpu', label: 'CPU' }],
        xAxis: 'time',
      })

      expect(screen.getByTestId('echarts-mock')).toBeInTheDocument()
      expect(lastOption).not.toBeNull()

      // Series should be type 'line'
      const series = lastOption!.series as Array<Record<string, unknown>>
      expect(series).toHaveLength(1)
      expect(series[0].type).toBe('line')
      expect(series[0].name).toBe('CPU')
    })

    it('derives series from yAxis string when series is absent', () => {
      renderChart({
        type: 'chart',
        chartType: 'line',
        xAxis: 'time',
        yAxis: 'cpu',
      })

      const series = lastOption!.series as Array<Record<string, unknown>>
      expect(series).toHaveLength(1)
      expect(series[0].name).toBe('cpu')
    })

    it('derives series from yAxis array', () => {
      renderChart({
        type: 'chart',
        chartType: 'line',
        xAxis: 'time',
        yAxis: ['cpu', 'memory'],
      })

      const series = lastOption!.series as Array<Record<string, unknown>>
      expect(series).toHaveLength(2)
      expect(series[0].name).toBe('cpu')
      expect(series[1].name).toBe('memory')
    })

    it('applies dashed line style', () => {
      renderChart({
        type: 'chart',
        chartType: 'line',
        series: [{ field: 'cpu', style: 'dashed' }],
        xAxis: 'time',
      })

      const series = lastOption!.series as Array<Record<string, unknown>>
      const lineStyle = series[0].lineStyle as Record<string, unknown>
      expect(lineStyle.type).toBe('dashed')
    })

    it('applies dotted line style', () => {
      renderChart({
        type: 'chart',
        chartType: 'line',
        series: [{ field: 'cpu', style: 'dotted' }],
        xAxis: 'time',
      })

      const series = lastOption!.series as Array<Record<string, unknown>>
      const lineStyle = series[0].lineStyle as Record<string, unknown>
      expect(lineStyle.type).toBe('dotted')
    })

    it('hides legend when showLegend is false', () => {
      renderChart({
        type: 'chart',
        chartType: 'line',
        series: [{ field: 'cpu' }],
        xAxis: 'time',
        showLegend: false,
      })

      expect(lastOption!.legend).toBeUndefined()
    })

    it('uses custom series color', () => {
      const CUSTOM_COLOR = '#ff0000'
      renderChart({
        type: 'chart',
        chartType: 'line',
        series: [{ field: 'cpu', color: CUSTOM_COLOR }],
        xAxis: 'time',
      })

      const series = lastOption!.series as Array<Record<string, unknown>>
      const lineStyle = series[0].lineStyle as Record<string, unknown>
      expect(lineStyle.color).toBe(CUSTOM_COLOR)
    })

    it('maps x-axis data from xAxis field', () => {
      renderChart({
        type: 'chart',
        chartType: 'line',
        series: [{ field: 'cpu' }],
        xAxis: 'time',
      })

      const xAxis = lastOption!.xAxis as Record<string, unknown>
      expect(xAxis.data).toEqual(['Jan', 'Feb', 'Mar'])
    })

    it('defaults x-axis field to "time" when not provided', () => {
      renderChart({
        type: 'chart',
        chartType: 'line',
        series: [{ field: 'cpu' }],
      })

      const xAxis = lastOption!.xAxis as Record<string, unknown>
      // Should use 'time' field by default
      expect(xAxis.data).toEqual(['Jan', 'Feb', 'Mar'])
    })

    it('accepts full CardAxisConfig for xAxis', () => {
      renderChart({
        type: 'chart',
        chartType: 'line',
        series: [{ field: 'cpu' }],
        xAxis: { field: 'time', label: 'Month' },
      })

      const xAxis = lastOption!.xAxis as Record<string, unknown>
      expect(xAxis.data).toEqual(['Jan', 'Feb', 'Mar'])
    })

    it('sets yAxis label from CardAxisConfig', () => {
      renderChart({
        type: 'chart',
        chartType: 'line',
        series: [{ field: 'cpu' }],
        xAxis: 'time',
        yAxis: { field: 'cpu', label: 'Percentage' },
      })

      const yAxis = lastOption!.yAxis as Record<string, unknown>
      expect(yAxis.name).toBe('Percentage')
    })
  })

  // -------------------------------------------------------------------------
  // Area chart
  // -------------------------------------------------------------------------
  describe('area chart', () => {
    it('renders an area chart with areaStyle', () => {
      renderChart({
        type: 'chart',
        chartType: 'area',
        series: [{ field: 'cpu', label: 'CPU' }],
        xAxis: 'time',
      })

      expect(screen.getByTestId('echarts-mock')).toBeInTheDocument()
      const series = lastOption!.series as Array<Record<string, unknown>>
      expect(series).toHaveLength(1)
      // Area charts use type 'line' with areaStyle
      expect(series[0].type).toBe('line')
      expect(series[0].areaStyle).toBeDefined()
      const areaStyle = series[0].areaStyle as Record<string, unknown>
      expect(areaStyle.opacity).toBe(0.3)
    })

    it('maps multiple series with colors', () => {
      renderChart({
        type: 'chart',
        chartType: 'area',
        series: [
          { field: 'cpu', color: '#ff0000' },
          { field: 'memory', color: '#00ff00' },
        ],
        xAxis: 'time',
      })

      const series = lastOption!.series as Array<Record<string, unknown>>
      expect(series).toHaveLength(2)
      const area0 = series[0].areaStyle as Record<string, unknown>
      const area1 = series[1].areaStyle as Record<string, unknown>
      expect(area0.color).toBe('#ff0000')
      expect(area1.color).toBe('#00ff00')
    })
  })

  // -------------------------------------------------------------------------
  // Bar chart
  // -------------------------------------------------------------------------
  describe('bar chart', () => {
    it('renders a bar chart', () => {
      const barData = [
        { name: 'A', count: 10 },
        { name: 'B', count: 20 },
      ]
      renderChart(
        {
          type: 'chart',
          chartType: 'bar',
          series: [{ field: 'count' }],
          xAxis: 'name',
        },
        barData,
      )

      expect(screen.getByTestId('echarts-mock')).toBeInTheDocument()
      const series = lastOption!.series as Array<Record<string, unknown>>
      expect(series[0].type).toBe('bar')
      expect(series[0].data).toEqual([10, 20])
    })

    it('defaults x-axis to "name" field for bar charts', () => {
      const barData = [
        { name: 'X', val: 5 },
        { name: 'Y', val: 8 },
      ]
      renderChart(
        {
          type: 'chart',
          chartType: 'bar',
          series: [{ field: 'val' }],
        },
        barData,
      )

      const xAxis = lastOption!.xAxis as Record<string, unknown>
      expect(xAxis.data).toEqual(['X', 'Y'])
    })

    it('applies rounded border radius to bar items', () => {
      renderChart(
        {
          type: 'chart',
          chartType: 'bar',
          series: [{ field: 'count' }],
        },
        [{ name: 'A', count: 10 }],
      )

      const series = lastOption!.series as Array<Record<string, unknown>>
      const itemStyle = series[0].itemStyle as Record<string, unknown>
      expect(itemStyle.borderRadius).toEqual([4, 4, 0, 0])
    })
  })

  // -------------------------------------------------------------------------
  // Donut chart
  // -------------------------------------------------------------------------
  describe('donut chart', () => {
    it('renders a donut chart from data with name/value fields', () => {
      renderChart(
        {
          type: 'chart',
          chartType: 'donut',
          series: [{ field: 'value', primary: true }],
        },
        DONUT_DATA,
      )

      expect(screen.getByTestId('echarts-mock')).toBeInTheDocument()
      const series = lastOption!.series as Array<Record<string, unknown>>
      expect(series).toHaveLength(1)
      expect(series[0].type).toBe('pie')

      const pieData = series[0].data as Array<{ name: string; value: number }>
      expect(pieData).toHaveLength(3)
      expect(pieData[0].name).toBe('Running')
      expect(pieData[0].value).toBe(12)
    })

    it('uses label field when name is absent', () => {
      const labelData = [
        { label: 'Active', value: 5 },
        { label: 'Idle', value: 3 },
      ]
      renderChart(
        {
          type: 'chart',
          chartType: 'donut',
          series: [{ field: 'value' }],
        },
        labelData,
      )

      const series = lastOption!.series as Array<Record<string, unknown>>
      const pieData = series[0].data as Array<{ name: string }>
      expect(pieData[0].name).toBe('Active')
      expect(pieData[1].name).toBe('Idle')
    })

    it('falls back to "Item N" when no name or label', () => {
      const noNameData = [{ value: 10 }, { value: 20 }]
      renderChart(
        {
          type: 'chart',
          chartType: 'donut',
          series: [{ field: 'value' }],
        },
        noNameData,
      )

      const series = lastOption!.series as Array<Record<string, unknown>>
      const pieData = series[0].data as Array<{ name: string }>
      expect(pieData[0].name).toBe('Item 1')
      expect(pieData[1].name).toBe('Item 2')
    })

    it('renders with empty series array', () => {
      renderChart(
        {
          type: 'chart',
          chartType: 'donut',
          series: [],
        },
        DONUT_DATA,
      )

      // Should still render (data passed through directly)
      expect(screen.getByTestId('echarts-mock')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Gauge chart
  // -------------------------------------------------------------------------
  describe('gauge chart', () => {
    it('renders a gauge with value percentage', () => {
      renderChart(
        {
          type: 'chart',
          chartType: 'gauge',
          series: [{ field: 'utilization' }],
        },
        GAUGE_DATA,
      )

      expect(screen.getByTestId('echarts-mock')).toBeInTheDocument()
      // The gauge displays the percentage as text
      expect(screen.getByText('75%')).toBeInTheDocument()
    })

    it('clamps value above 100 to 100', () => {
      renderChart(
        {
          type: 'chart',
          chartType: 'gauge',
          series: [{ field: 'utilization' }],
        },
        [{ utilization: 150 }],
      )

      // The displayed text shows the raw value rounded, but the chart data is clamped
      expect(screen.getByText('150%')).toBeInTheDocument()
      const series = lastOption!.series as Array<Record<string, unknown>>
      const pieData = series[0].data as Array<{ value: number }>
      // Clamped: value portion should be 100
      expect(pieData[0].value).toBe(100)
    })

    it('clamps value below 0 to 0', () => {
      renderChart(
        {
          type: 'chart',
          chartType: 'gauge',
          series: [{ field: 'utilization' }],
        },
        [{ utilization: -10 }],
      )

      const series = lastOption!.series as Array<Record<string, unknown>>
      const pieData = series[0].data as Array<{ value: number }>
      expect(pieData[0].value).toBe(0)
    })

    it('uses green color for low values', () => {
      renderChart(
        {
          type: 'chart',
          chartType: 'gauge',
          series: [{ field: 'utilization' }],
        },
        [{ utilization: 50 }],
      )

      const series = lastOption!.series as Array<Record<string, unknown>>
      const pieData = series[0].data as Array<{ value: number; itemStyle: { color: string } }>
      expect(pieData[0].itemStyle.color).toBe('#22c55e')
    })

    it('uses amber color for medium values (70-89)', () => {
      renderChart(
        {
          type: 'chart',
          chartType: 'gauge',
          series: [{ field: 'utilization' }],
        },
        [{ utilization: 80 }],
      )

      const series = lastOption!.series as Array<Record<string, unknown>>
      const pieData = series[0].data as Array<{ value: number; itemStyle: { color: string } }>
      expect(pieData[0].itemStyle.color).toBe('#f59e0b')
    })

    it('uses red color for high values (>=90)', () => {
      renderChart(
        {
          type: 'chart',
          chartType: 'gauge',
          series: [{ field: 'utilization' }],
        },
        [{ utilization: 95 }],
      )

      const series = lastOption!.series as Array<Record<string, unknown>>
      const pieData = series[0].data as Array<{ value: number; itemStyle: { color: string } }>
      expect(pieData[0].itemStyle.color).toBe('#ef4444')
    })

    it('handles empty data gracefully', () => {
      renderChart(
        {
          type: 'chart',
          chartType: 'gauge',
          series: [{ field: 'utilization' }],
        },
        [],
      )

      expect(screen.getByText('0%')).toBeInTheDocument()
    })

    it('handles empty series gracefully', () => {
      renderChart(
        {
          type: 'chart',
          chartType: 'gauge',
          series: [],
        },
        GAUGE_DATA,
      )

      expect(screen.getByText('0%')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Sparkline
  // -------------------------------------------------------------------------
  describe('sparkline', () => {
    it('renders a minimal sparkline chart', () => {
      renderChart(
        {
          type: 'chart',
          chartType: 'sparkline',
          series: [{ field: 'cpu' }],
        },
        TIME_SERIES_DATA,
      )

      expect(screen.getByTestId('echarts-mock')).toBeInTheDocument()
      const series = lastOption!.series as Array<Record<string, unknown>>
      expect(series).toHaveLength(1)
      expect(series[0].type).toBe('line')
      expect(series[0].data).toEqual([40, 55, 30])
    })

    it('hides axes in sparkline', () => {
      renderChart(
        {
          type: 'chart',
          chartType: 'sparkline',
          series: [{ field: 'cpu' }],
        },
        TIME_SERIES_DATA,
      )

      const yAxis = lastOption!.yAxis as Record<string, unknown>
      expect(yAxis.show).toBe(false)

      const xAxis = lastOption!.xAxis as Record<string, unknown>
      expect(xAxis.show).toBe(false)
    })

    it('shows message when no series configured', () => {
      renderChart(
        {
          type: 'chart',
          chartType: 'sparkline',
          series: [],
        },
        TIME_SERIES_DATA,
      )

      expect(screen.getByText('No series configured')).toBeInTheDocument()
    })

    it('uses custom color for sparkline', () => {
      const SPARK_COLOR = '#abcdef'
      renderChart(
        {
          type: 'chart',
          chartType: 'sparkline',
          series: [{ field: 'cpu', color: SPARK_COLOR }],
        },
        TIME_SERIES_DATA,
      )

      const series = lastOption!.series as Array<Record<string, unknown>>
      const lineStyle = series[0].lineStyle as Record<string, unknown>
      expect(lineStyle.color).toBe(SPARK_COLOR)
    })
  })

  // -------------------------------------------------------------------------
  // Unknown chart type
  // -------------------------------------------------------------------------
  describe('unknown chart type', () => {
    it('renders an error message for unknown chart type', () => {
      renderChart({
        type: 'chart',
        chartType: 'radar' as CardContentChart['chartType'],
      })

      expect(screen.getByText(/Unknown chart type: radar/)).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Custom height
  // -------------------------------------------------------------------------
  describe('height', () => {
    it('applies custom height to the container', () => {
      const CUSTOM_HEIGHT = 400
      const { container } = renderChart({
        type: 'chart',
        chartType: 'line',
        series: [{ field: 'cpu' }],
        height: CUSTOM_HEIGHT,
      })

      const wrapper = container.firstChild as HTMLElement
      expect(wrapper.style.height).toBe(`${CUSTOM_HEIGHT}px`)
    })

    it('uses default height of 200 when not specified', () => {
      const DEFAULT_HEIGHT = 200
      const { container } = renderChart({
        type: 'chart',
        chartType: 'line',
        series: [{ field: 'cpu' }],
      })

      const wrapper = container.firstChild as HTMLElement
      expect(wrapper.style.height).toBe(`${DEFAULT_HEIGHT}px`)
    })
  })

  // -------------------------------------------------------------------------
  // Tooltip config
  // -------------------------------------------------------------------------
  describe('tooltip', () => {
    it('includes tooltip config from constants', () => {
      renderChart({
        type: 'chart',
        chartType: 'line',
        series: [{ field: 'cpu' }],
      })

      const tooltip = lastOption!.tooltip as Record<string, unknown>
      expect(tooltip.backgroundColor).toBe('#1f2937')
      expect(tooltip.borderColor).toBe('#374151')
    })
  })
})
