/**
 * Horseshoe Gauge Component
 *
 * Inspired by Home Assistant HACS RAM Usage card style
 * Upright horseshoe: closed at top, open at bottom
 */
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'

interface HorseshoeGaugeProps {
  value: number
  maxValue?: number
  label: string
  sublabel?: string
  secondaryLeft?: { value: string; label: string }
  secondaryRight?: { value: string; label: string }
  size?: number
}

// Color based on percentage (green -> yellow -> orange -> red)
const getColor = (pct: number) => {
  if (pct >= 90) return '#ef4444' // red
  if (pct >= 70) return '#f59e0b' // amber/orange
  if (pct >= 50) return '#eab308' // yellow
  return '#22c55e' // green
}

export function HorseshoeGauge({
  value,
  maxValue = 100,
  label,
  sublabel,
  secondaryLeft,
  secondaryRight,
  size = 180,
}: HorseshoeGaugeProps) {
  const { t: _t } = useTranslation()
  const percentage = Math.min((value / maxValue) * 100, 100)
  const color = getColor(percentage)
  const uniqueId = useMemo(() => `horseshoe-${Math.random().toString(36).substr(2, 9)}`, [])

  const viewSize = 100
  const cx = viewSize / 2
  const cy = viewSize / 2
  const radius = 42
  const strokeWidth = 5

  // Horseshoe arc - upright orientation (open at bottom)
  // In SVG/standard coords: 0° = right, 90° = down, 180° = left, 270° = up
  // We want arc from bottom-left to bottom-right, going through the top
  // Start at 135° (bottom-left), end at 45° (bottom-right), going counterclockwise through top
  const startAngle = 135  // bottom-left of opening
  const endAngle = 45     // bottom-right of opening
  const totalSweep = 270  // degrees (going the long way around through top)

  // Calculate value angle (how far the colored arc extends from start)
  // Going clockwise from startAngle, so we ADD to the angle
  const valueSweep = (percentage / 100) * totalSweep
  const valueEndAngle = startAngle + valueSweep // going clockwise

  // Convert angle to SVG coordinates
  // Standard: 0° = right, 90° = down, 180° = left, 270° = up
  const toCartesian = (angleDeg: number, r: number) => {
    const rad = (angleDeg * Math.PI) / 180
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad)
    }
  }

  // Create arc path - draws clockwise for upright horseshoe
  const createArc = (r: number, fromAngle: number, toAngle: number, sweep: number) => {
    const start = toCartesian(fromAngle, r)
    const end = toCartesian(toAngle, r)
    const largeArc = sweep > 180 ? 1 : 0
    // sweep-flag=1 means clockwise (to go the long way from bottom-left to bottom-right through top)
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`
  }

  return (
    <div className="flex flex-col items-center">
      {/* Label ABOVE the gauge */}
      <span className="text-sm text-white font-medium mb-1 truncate max-w-full">{label}</span>

      <div className="relative" style={{ width: size, height: size * 0.85 }}>
        <svg viewBox={`0 0 ${viewSize} ${viewSize}`} className="w-full h-full">
          <defs>
            <filter id={`glow-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feFlood floodColor={color} floodOpacity="0.4" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Track background arc (full 270°) */}
          <path
            d={createArc(radius, startAngle, endAngle, totalSweep)}
            fill="none"
            stroke="#374151"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Value arc (colored portion) */}
          {percentage > 0 && (
            <motion.path
              d={createArc(radius, startAngle, valueEndAngle, valueSweep)}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              filter={`url(#glow-${uniqueId})`}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          )}

          {/* Center content */}
          <g>
            {/* Main percentage */}
            <text
              x={cx}
              y={cy - 6}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#ffffff"
              fontSize="22"
              fontWeight="bold"
              fontFamily="system-ui, sans-serif"
            >
              {Math.round(percentage)}
              <tspan fontSize="12" fill="#9ca3af">%</tspan>
            </text>

            {/* Divider line */}
            {(secondaryLeft || secondaryRight) && (
              <line
                x1={cx - 22}
                y1={cy + 8}
                x2={cx + 22}
                y2={cy + 8}
                stroke="#4b5563"
                strokeWidth="1"
              />
            )}

            {/* IN USE value - left side with GB */}
            {secondaryLeft && (
              <g>
                <text
                  x={cx - 13}
                  y={cy + 20}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="8"
                  fontWeight="600"
                  fontFamily="system-ui, sans-serif"
                >
                  {secondaryLeft.value}
                  <tspan fontSize="5" fill="#9ca3af"> GB</tspan>
                </text>
                <text
                  x={cx - 13}
                  y={cy + 28}
                  textAnchor="middle"
                  fill="#6b7280"
                  fontSize="5"
                >
                  ({secondaryLeft.label})
                </text>
              </g>
            )}

            {/* FREE value - right side with GB */}
            {secondaryRight && (
              <g>
                <text
                  x={cx + 13}
                  y={cy + 20}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="8"
                  fontWeight="600"
                  fontFamily="system-ui, sans-serif"
                >
                  {secondaryRight.value}
                  <tspan fontSize="5" fill="#9ca3af"> GB</tspan>
                </text>
                <text
                  x={cx + 13}
                  y={cy + 28}
                  textAnchor="middle"
                  fill="#6b7280"
                  fontSize="5"
                >
                  ({secondaryRight.label})
                </text>
              </g>
            )}
          </g>
        </svg>
      </div>

      {/* Sublabel below gauge */}
      {sublabel && (
        <span className="text-xs text-muted-foreground -mt-1">{sublabel}</span>
      )}
    </div>
  )
}

export default HorseshoeGauge
