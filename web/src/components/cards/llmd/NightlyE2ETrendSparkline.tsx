import { useTranslation } from 'react-i18next'
import type { NightlyRun } from '../../../lib/llmd/nightlyE2EDemoData'
import {
  TREND_CHART_AXIS_COLOR,
  TREND_CHART_AXIS_STROKE_WIDTH,
  TREND_CHART_AXIS_TICK_LENGTH,
  TREND_CHART_GRID_COLOR,
  TREND_CHART_GRID_STROKE_WIDTH,
  TREND_CHART_HEIGHT,
  TREND_CHART_LABEL_COLOR,
  TREND_CHART_LABEL_FONT_SIZE,
  TREND_CHART_LATEST_POINT_RADIUS,
  TREND_CHART_LINE_STROKE_WIDTH,
  TREND_CHART_MUTED_LABEL_COLOR,
  TREND_CHART_PADDING_BOTTOM,
  TREND_CHART_PADDING_LEFT,
  TREND_CHART_PADDING_RIGHT,
  TREND_CHART_PADDING_TOP,
  TREND_CHART_POINT_RADIUS,
  TREND_CHART_POINT_STROKE_COLOR,
  TREND_CHART_POINT_STROKE_WIDTH,
  TREND_CHART_WIDTH,
  TREND_CHART_X_LABEL_FONT_SIZE,
} from './nightlyE2E.constants'

export function TrendSparkline({ runs }: { runs: NightlyRun[] }) {
  const { t } = useTranslation(['cards', 'common'])
  // Build data points: 1 = success, 0 = failure/cancelled, 0.5 = in_progress
  // Newest on left, oldest on right (matches run history dots)
  const points = runs.map(r => {
    if (r.status === 'in_progress') return 0.5
    return r.conclusion === 'success' ? 1 : 0
  })

  if (points.length < 2) return null

  const chartWidth = TREND_CHART_WIDTH - TREND_CHART_PADDING_LEFT - TREND_CHART_PADDING_RIGHT
  const chartHeight = TREND_CHART_HEIGHT - TREND_CHART_PADDING_TOP - TREND_CHART_PADDING_BOTTOM
  const chartBottom = TREND_CHART_PADDING_TOP + chartHeight
  const yAxisLevels = [
    { label: t('cards:llmd.pass'), value: 1 },
    { label: t('common:common.running'), value: 0.5 },
    { label: t('cards:llmd.fail'), value: 0 },
  ]

  // Build SVG path + area
  const xStep = chartWidth / (points.length - 1)
  const pathPoints = points.map((value, index) => ({
    x: TREND_CHART_PADDING_LEFT + index * xStep,
    y: TREND_CHART_PADDING_TOP + (1 - value) * chartHeight,
  }))

  // Smooth curve using cardinal spline approximation
  let linePath = `M ${pathPoints[0].x} ${pathPoints[0].y}`
  for (let index = 1; index < pathPoints.length; index++) {
    const previousPoint = pathPoints[index - 1]
    const currentPoint = pathPoints[index]
    const controlPointX = (previousPoint.x + currentPoint.x) / 2
    linePath += ` C ${controlPointX} ${previousPoint.y}, ${controlPointX} ${currentPoint.y}, ${currentPoint.x} ${currentPoint.y}`
  }

  const areaPath = `${linePath} L ${pathPoints[pathPoints.length - 1].x} ${chartBottom} L ${pathPoints[0].x} ${chartBottom} Z`

  const latest = points[0]
  const gradientId = `sparkGrad-${latest}`
  const strokeColor = latest >= 1 ? '#34d399' : latest > 0 ? '#fbbf24' : '#f87171'
  const fillOpacity = 0.15

  return (
    <div className="bg-secondary/60 border border-border/50 rounded-lg p-2">
      <div className="text-2xs text-muted-foreground uppercase tracking-wider mb-1">{t('cards:llmd.passFailTrend')}</div>
      <svg width="100%" height={TREND_CHART_HEIGHT} viewBox={`0 0 ${TREND_CHART_WIDTH} ${TREND_CHART_HEIGHT}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity={fillOpacity} />
            <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
          </linearGradient>
        </defs>

        {yAxisLevels.map(({ label, value }) => {
          const y = TREND_CHART_PADDING_TOP + (1 - value) * chartHeight
          return (
            <g key={label}>
              <line
                x1={TREND_CHART_PADDING_LEFT}
                y1={y}
                x2={TREND_CHART_WIDTH - TREND_CHART_PADDING_RIGHT}
                y2={y}
                stroke={TREND_CHART_GRID_COLOR}
                strokeWidth={TREND_CHART_GRID_STROKE_WIDTH}
                strokeOpacity={0.45}
                strokeDasharray="3 3"
              />
              <line
                x1={TREND_CHART_PADDING_LEFT - TREND_CHART_AXIS_TICK_LENGTH}
                y1={y}
                x2={TREND_CHART_PADDING_LEFT}
                y2={y}
                stroke={TREND_CHART_AXIS_COLOR}
                strokeWidth={TREND_CHART_AXIS_STROKE_WIDTH}
                strokeOpacity={0.9}
              />
              <text
                x={TREND_CHART_PADDING_LEFT - TREND_CHART_AXIS_TICK_LENGTH - 2}
                y={y + TREND_CHART_LABEL_FONT_SIZE / 2 - 1}
                textAnchor="end"
                fontSize={TREND_CHART_LABEL_FONT_SIZE}
                fill={TREND_CHART_LABEL_COLOR}
                fillOpacity={0.92}
              >
                {label}
              </text>
            </g>
          )
        })}

        <line
          x1={TREND_CHART_PADDING_LEFT}
          y1={TREND_CHART_PADDING_TOP}
          x2={TREND_CHART_PADDING_LEFT}
          y2={chartBottom}
          stroke={TREND_CHART_AXIS_COLOR}
          strokeWidth={TREND_CHART_AXIS_STROKE_WIDTH}
          strokeOpacity={0.9}
        />
        <line
          x1={TREND_CHART_PADDING_LEFT}
          y1={chartBottom}
          x2={TREND_CHART_WIDTH - TREND_CHART_PADDING_RIGHT}
          y2={chartBottom}
          stroke={TREND_CHART_AXIS_COLOR}
          strokeWidth={TREND_CHART_AXIS_STROKE_WIDTH}
          strokeOpacity={0.9}
        />
        <line
          x1={TREND_CHART_PADDING_LEFT}
          y1={chartBottom}
          x2={TREND_CHART_PADDING_LEFT}
          y2={chartBottom + TREND_CHART_AXIS_TICK_LENGTH}
          stroke={TREND_CHART_AXIS_COLOR}
          strokeWidth={TREND_CHART_AXIS_STROKE_WIDTH}
          strokeOpacity={0.9}
        />
        <line
          x1={TREND_CHART_WIDTH - TREND_CHART_PADDING_RIGHT}
          y1={chartBottom}
          x2={TREND_CHART_WIDTH - TREND_CHART_PADDING_RIGHT}
          y2={chartBottom + TREND_CHART_AXIS_TICK_LENGTH}
          stroke={TREND_CHART_AXIS_COLOR}
          strokeWidth={TREND_CHART_AXIS_STROKE_WIDTH}
          strokeOpacity={0.9}
        />
        <text
          x={TREND_CHART_PADDING_LEFT}
          y={TREND_CHART_HEIGHT - 3}
          textAnchor="start"
          fontSize={TREND_CHART_X_LABEL_FONT_SIZE}
          fill={TREND_CHART_MUTED_LABEL_COLOR}
          fillOpacity={0.95}
        >
          {t('common:common.newest')}
        </text>
        <text
          x={TREND_CHART_WIDTH - TREND_CHART_PADDING_RIGHT}
          y={TREND_CHART_HEIGHT - 3}
          textAnchor="end"
          fontSize={TREND_CHART_X_LABEL_FONT_SIZE}
          fill={TREND_CHART_MUTED_LABEL_COLOR}
          fillOpacity={0.95}
        >
          {t('common:common.oldest')}
        </text>

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={TREND_CHART_LINE_STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {pathPoints.map((point, index) => {
          const value = points[index]
          const dotColor = value >= 1 ? '#34d399' : value > 0 ? '#fbbf24' : '#f87171'
          return (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r={index === 0 ? TREND_CHART_LATEST_POINT_RADIUS : TREND_CHART_POINT_RADIUS}
              fill={dotColor}
              stroke={TREND_CHART_POINT_STROKE_COLOR}
              strokeWidth={TREND_CHART_POINT_STROKE_WIDTH}
            />
          )
        })}
      </svg>
    </div>
  )
}
