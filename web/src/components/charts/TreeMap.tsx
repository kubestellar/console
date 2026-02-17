import { Treemap, ResponsiveContainer, Tooltip } from 'recharts'
import { CHART_TOOLTIP_BG } from '../../lib/constants'

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

// Custom content renderer for tree map cells
interface CustomContentProps {
  x?: number
  y?: number
  width?: number
  height?: number
  name?: string
  value?: number
  color?: string
  showLabels?: boolean
  formatValue?: (value: number) => string
}

function CustomContent({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  name,
  value,
  color,
  showLabels = true,
  formatValue = (v) => v.toString(),
}: CustomContentProps) {
  const showText = width > 40 && height > 30

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        stroke="#1a1a2e"
        strokeWidth={2}
        rx={4}
        style={{
          transition: 'all 0.2s ease',
        }}
      />
      {showLabels && showText && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - 6}
            textAnchor="middle"
            fill="#fff"
            fontSize={12}
            fontWeight={500}
          >
            {name && name.length > 15 ? name.slice(0, 12) + '...' : name}
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + 10}
            textAnchor="middle"
            fill="#fff"
            fontSize={10}
            opacity={0.7}
          >
            {value !== undefined ? formatValue(value) : ''}
          </text>
        </>
      )}
    </g>
  )
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
  // Add colors to data if not present
  const coloredData = data.map((item, index) => ({
    ...item,
    color: item.color || colorScale[index % colorScale.length],
  }))

  return (
    <div className="w-full">
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      )}
      <div style={{ minHeight: height, width: '100%' }}>
      <ResponsiveContainer width="100%" height={height} minHeight={height}>
        <Treemap
          data={coloredData}
          dataKey="value"
          aspectRatio={4 / 3}
          stroke="#1a1a2e"
          fill="#9333ea"
          content={<CustomContent showLabels={showLabels} formatValue={formatValue} />}
        >
          <Tooltip
            contentStyle={{
              backgroundColor: CHART_TOOLTIP_BG,
              border: '1px solid #333',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            formatter={(value) => [formatValue(value as number), 'Value']}
          />
        </Treemap>
      </ResponsiveContainer>
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
  // Assign colors to children recursively
  function assignColors(items: TreeMapItem[], depth = 0): TreeMapItem[] {
    return items.map((item, index) => ({
      ...item,
      color: item.color || colorScale[(depth * 3 + index) % colorScale.length],
      children: item.children ? assignColors(item.children, depth + 1) : undefined,
    }))
  }

  const coloredData = {
    ...data,
    children: data.children ? assignColors(data.children) : [],
  }

  return (
    <div className="w-full">
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      )}
      <div style={{ minHeight: height, width: '100%' }}>
      <ResponsiveContainer width="100%" height={height} minHeight={height}>
        <Treemap
          data={[coloredData]}
          dataKey="value"
          aspectRatio={4 / 3}
          stroke="#1a1a2e"
          content={<CustomContent showLabels={true} formatValue={formatValue} />}
        >
          <Tooltip
            contentStyle={{
              backgroundColor: CHART_TOOLTIP_BG,
              border: '1px solid #333',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            formatter={(value) => [formatValue(value as number), 'Value']}
          />
        </Treemap>
      </ResponsiveContainer>
      </div>
    </div>
  )
}
