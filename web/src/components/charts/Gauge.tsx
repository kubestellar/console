interface GaugeProps {
  value: number
  max?: number
  label?: string
  unit?: string
  size?: 'sm' | 'md' | 'lg'
  thresholds?: {
    warning: number
    critical: number
  }
}

export function Gauge({
  value,
  max = 100,
  label,
  unit = '%',
  size = 'md',
  thresholds = { warning: 70, critical: 90 },
}: GaugeProps) {
  const percentage = Math.min((value / max) * 100, 100)
  const rotation = (percentage / 100) * 180 - 90 // -90 to 90 degrees

  const getColor = () => {
    if (percentage >= thresholds.critical) return { stroke: '#ef4444', text: 'text-red-400' }
    if (percentage >= thresholds.warning) return { stroke: '#eab308', text: 'text-yellow-400' }
    return { stroke: '#22c55e', text: 'text-green-400' }
  }

  const color = getColor()

  const sizes = {
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
        {/* Value display */}
        <div className="absolute inset-0 flex items-end justify-center pb-1">
          <span className={`font-bold ${s.fontSize} ${color.text}`}>
            {Math.round(value)}
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
