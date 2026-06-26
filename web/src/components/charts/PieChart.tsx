import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { CHART_TOOLTIP_CONTENT_STYLE, CHART_TOOLTIP_TEXT_COLOR, CHART_TOOLTIP_LABEL_COLOR, CHART_BODY_FONT_SIZE } from '../../lib/constants'

interface DataItem {
  name: string
  value: number
  color: string
  [key: string]: string | number
}

interface PieChartProps {
  data: DataItem[]
  size?: number
  innerRadius?: number
  showLegend?: boolean
  title?: string
  centerLabel?: string
  centerValue?: string | number
}

export function PieChart({
  data,
  size = 150,
  innerRadius = 0,
  showLegend = true,
  title,
  centerLabel,
  centerValue,
}: PieChartProps) {
  const isDonut = innerRadius > 0

  const option = useMemo(() => {
    /** Outer radius as percentage string for echarts */
    const outerRadiusPct = `${Math.round(((size / 2 - 5) / (size / 2)) * 100)}%`
    const innerRadiusPct = innerRadius > 0 ? `${Math.round((innerRadius / (size / 2)) * 100)}%` : '0%'

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).backgroundColor as string,
        borderColor: (CHART_TOOLTIP_CONTENT_STYLE as Record<string, unknown>).borderColor as string,
        textStyle: { color: CHART_TOOLTIP_TEXT_COLOR, fontSize: CHART_BODY_FONT_SIZE },
        formatter: (params: { name: string; value: number; percent: number }) =>
          `<span style="color:${CHART_TOOLTIP_LABEL_COLOR};font-weight:500">${params.name}</span><br/><span style="color:${CHART_TOOLTIP_TEXT_COLOR}">${params.value} (${params.percent}%)</span>`,
      },
      series: [{
        type: 'pie',
        radius: [innerRadiusPct, outerRadiusPct],
        center: ['50%', '50%'],
        padAngle: 2,
        data: data.map(d => ({
          value: d.value,
          name: d.name,
          itemStyle: { color: d.color },
        })),
        label: { show: false },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' },
        },
      }],
    }
  }, [data, size, innerRadius])

  return (
    <div className="w-full">
      {title && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
      )}
      <div className="flex items-center gap-4">
        <div className="relative" style={{ width: size, height: size, minWidth: size, minHeight: size }}>
          <ReactECharts
            option={option}
            style={{ height: size, width: size }}
            notMerge={true}
            opts={{ renderer: 'svg' }}
          />
          {isDonut && (centerLabel || centerValue) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              {centerValue && (
                <span className="text-2xl font-bold text-foreground">{centerValue}</span>
              )}
              {centerLabel && (
                <span className="text-xs text-muted-foreground">{centerLabel}</span>
              )}
            </div>
          )}
        </div>
        {showLegend && (
          <div className="flex-1 space-y-2">
            {data.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-muted-foreground">{item.name}</span>
                </div>
                <span className="text-sm font-medium text-foreground">{item.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Donut chart shorthand
interface DonutChartProps extends Omit<PieChartProps, 'innerRadius'> {
  thickness?: number
}

export function DonutChart({ thickness = 20, size = 150, ...props }: DonutChartProps) {
  const innerRadius = size / 2 - thickness - 5
  return <PieChart {...props} size={size} innerRadius={Math.max(innerRadius, 20)} />
}
