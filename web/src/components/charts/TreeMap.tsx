import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  CHART_AXIS_FONT_SIZE,
  CHART_BODY_FONT_SIZE,
  CHART_TEXT_WHITE,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_TEXT_COLOR,
} from '../../lib/constants'

interface TreeMapItem {
  name: string
  value: number
  color?: string
  children?: TreeMapItem[]
  [key: string]: unknown
}

interface TreeMapProps {
  data: TreeMapItem[]
  height?: number
  colorScale?: string[]
  title?: string
  showLabels?: boolean
  formatValue?: (value: number) => string
}

const DEFAULT_COLORS = [
  '#9333ea',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#ec4899',
]

export function TreeMap({
  data,
  height = 200,
  colorScale = DEFAULT_COLORS,
  title,
  showLabels = true,
  formatValue = (v) => v.toString(),
}: TreeMapProps) {
  const option = useMemo(() => {
    const coloredData = data.map((item, index) => ({
      name: item.name,
      value: item.value,
      itemStyle: { color: item.color || colorScale[index % colorScale.length], borderColor: '#1a1a2e', borderWidth: 2, borderRadius: 4 },
    }))

    return {
      backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).backgroundColor as string,
        borderColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).borderColor as string,
        textStyle: { color: CHART_TOOLTIP_TEXT_COLOR, fontSize: CHART_BODY_FONT_SIZE },
        formatter: (params: { name: string; value: number }) =>
          `${params.name}: ${formatValue(params.value)}`,
      },
      series: [{
        type: 'treemap',
        data: coloredData,
        width: '100%',
        height: '100%',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        label: {
          show: showLabels,
          formatter: (params: { name: string; value: number }) => {
            const name = params.name.length > 15 ? params.name.slice(0, 12) + '...' : params.name
            return `{name|${name}}\n{value|${formatValue(params.value)}}`
          },
          rich: {
            name: { color: CHART_TEXT_WHITE, fontSize: CHART_BODY_FONT_SIZE, fontWeight: 500, lineHeight: 18 },
            value: { color: CHART_TEXT_WHITE, fontSize: CHART_AXIS_FONT_SIZE, opacity: 0.7, lineHeight: 14 },
          },
          minMargin: 4,
        },
        itemStyle: { borderColor: '#1a1a2e', borderWidth: 2, gapWidth: 2 },
        levels: [{
          itemStyle: { borderColor: '#1a1a2e', borderWidth: 2, gapWidth: 2 },
        }],
      }],
    }
  }, [data, colorScale, showLabels, formatValue])

  return (
    <div className="w-full">
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      )}
      <div style={{ minHeight: height, width: '100%' }}>
        <ReactECharts
          option={option}
          style={{ height, width: '100%' }}
          notMerge={true}
          opts={{ renderer: 'svg' }}
        />
      </div>
    </div>
  )
}

// Nested tree map for hierarchical data
interface NestedTreeMapProps {
  data: TreeMapItem
  height?: number
  colorScale?: string[]
  title?: string
  formatValue?: (value: number) => string
}

export function NestedTreeMap({
  data,
  height = 250,
  colorScale = DEFAULT_COLORS,
  title,
  formatValue = (v) => v.toString(),
}: NestedTreeMapProps) {
  const option = useMemo(() => {
    function assignColors(items: TreeMapItem[], depth = 0): Array<{ name: string; value: number; children?: Array<unknown>; itemStyle: { color: string; borderColor: string; borderWidth: number } }> {
      return items.map((item, index) => ({
        name: item.name,
        value: item.value,
        itemStyle: { color: item.color || colorScale[(depth * 3 + index) % colorScale.length], borderColor: '#1a1a2e', borderWidth: 2 },
        ...(item.children ? { children: assignColors(item.children, depth + 1) } : {}),
      }))
    }

    const coloredChildren = data.children ? assignColors(data.children) : []

    return {
      backgroundColor: 'transparent',
      tooltip: {
        backgroundColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).backgroundColor as string,
        borderColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).borderColor as string,
        textStyle: { color: CHART_TOOLTIP_TEXT_COLOR, fontSize: CHART_BODY_FONT_SIZE },
        formatter: (params: { name: string; value: number }) =>
          `${params.name}: ${formatValue(params.value)}`,
      },
      series: [{
        type: 'treemap',
        data: coloredChildren,
        width: '100%',
        height: '100%',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        label: {
          show: true,
          formatter: (params: { name: string; value: number }) => {
            const name = params.name.length > 15 ? params.name.slice(0, 12) + '...' : params.name
            return `{name|${name}}\n{value|${formatValue(params.value)}}`
          },
          rich: {
            name: { color: CHART_TEXT_WHITE, fontSize: CHART_BODY_FONT_SIZE, fontWeight: 500, lineHeight: 18 },
            value: { color: CHART_TEXT_WHITE, fontSize: CHART_AXIS_FONT_SIZE, opacity: 0.7, lineHeight: 14 },
          },
        },
        itemStyle: { borderColor: '#1a1a2e', borderWidth: 2, gapWidth: 2 },
      }],
    }
  }, [data, colorScale, formatValue])

  return (
    <div className="w-full">
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      )}
      <div style={{ minHeight: height, width: '100%' }}>
        <ReactECharts
          option={option}
          style={{ height, width: '100%' }}
          notMerge={true}
          opts={{ renderer: 'svg' }}
        />
      </div>
    </div>
  )
}
