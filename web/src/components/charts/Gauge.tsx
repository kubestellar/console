/** Status colors — Tailwind equivalents used in SVG strokes */
const GAUGE_SUCCESS_COLOR = '#22c55e'   // green-500   // ai-quality-ignore
const GAUGE_WARNING_COLOR = '#eab308'   // yellow-500  // ai-quality-ignore
const GAUGE_CRITICAL_COLOR = '#ef4444'  // red-500     // ai-quality-ignore

interface GaugeProps {
  value: number
  max?: number
  label?: string
  unit?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  thresholds?: {
    warning: number
    critical: number
  }
  /** When true, high values are good (green) and low values are bad (red) - useful for health/readiness displays */
  invertColors?: boolean
}

export function Gauge({
  value,
  max = 100,
  label,
  unit = '%',
  size = 'md',
  thresholds = { warning: 70, critical: 90 },
  invertColors = false,
}: GaugeProps) {
  // Guard against NaN/undefined values that can occur with incomplete API data
  const safeValue = Number.isFinite(value) ? value : 0
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100
  const percentage = Math.min((safeValue / safeMax) * 100, 100)
  const rotation = (percentage / 100) * 180 - 90 // -90 to 90 degrees

  const getColor = () => {
    if (invertColors) {
      // Inverted: high is good (green), low is bad (red)
      // For health displays: 100% = green, 50% = yellow, 0% = red
      if (percentage >= 100) return { stroke: GAUGE_SUCCESS_COLOR, text: 'text-green-400' }
      if (percentage >= 50) return { stroke: GAUGE_WARNING_COLOR, text: 'text-yellow-400' }
      return { stroke: GAUGE_CRITICAL_COLOR, text: 'text-red-400' }
    }
    // Normal: high is bad (red), low is good (green)
    if (percentage >= thresholds.critical) return { stroke: GAUGE_CRITICAL_COLOR, text: 'text-red-400' }
    if (percentage >= thresholds.warning) return { stroke: GAUGE_WARNING_COLOR, text: 'text-yellow-400' }
    return { stroke: GAUGE_SUCCESS_COLOR, text: 'text-green-400' }
  }

  const color = getColor()

  const sizes = {
    xs: { width: 48, strokeWidth: 4, fontSize: 'text-sm' },
    sm: { width: 80, strokeWidth: 6, fontSize: 'text-lg' },
    md: { width: 120, strokeWidth: 8, fontSize: 'text-2xl' },
    lg: { width: 160, strokeWidth: 10, fontSize: 'text-3xl' },
  }

  const s = sizes[size]
  const radius = (s.width - s.strokeWidth) / 2

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: s.width, height: s.width / 2 + 10 }}>
        <svg
          width={s.width}
          height={s.width / 2 + 10}
          viewBox={`0 0 ${s.width} ${s.width / 2 + 10}`}
        >
          {/* Background arc */}
          <path
            d={describeArc(s.width / 2, s.width / 2, radius, -90, 90)}
            fill="none"
            stroke="currentColor"
            strokeWidth={s.strokeWidth}
            className="text-secondary"
            strokeLinecap="round"
          />
          {/* Value arc */}
          <path
            d={describeArc(s.width / 2, s.width / 2, radius, -90, rotation)}
            fill="none"
            stroke={color.stroke}
            strokeWidth={s.strokeWidth}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 6px ${color.stroke}40)`,
            }}
          />
        </svg>
        {/* Value display.
         * When the unit is a percent sign, display the computed percentage
         * (value/max*100). Otherwise display the raw value (e.g. "3" GPUs).
         * Fixes #6117/#6119 where a 1/1 Healthy ReplicaSet rendered "1%"
         * instead of "100%" because the raw value was shown with a "%" unit. */}
        <div className="absolute inset-0 flex items-end justify-center pb-1">
          <span className={`font-bold ${s.fontSize} ${color.text}`}>
            {unit === '%' ? Math.round(percentage) : Math.round(safeValue)}
            <span className="text-sm text-muted-foreground">{unit}</span>
          </span>
        </div>
      </div>
      {label && (
        <span className="text-sm text-muted-foreground mt-1">{label}</span>
      )}
    </div>
  )
}

// Helper function to create arc path
function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(x, y, radius, endAngle)
  const end = polarToCartesian(x, y, radius, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  }
}
