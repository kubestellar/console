/**
 * Premium Gauge Component
 *
 * High-definition circular gauge with glowing arcs and ambient lighting,
 * inspired by Home Assistant's dual gauge card. Features:
 * - Gradient arc with glow effect
 * - Inner ambient lighting
 * - Optional secondary arc
 * - Animated value transitions
 */
import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

interface GaugeConfig {
  value: number
  max: number
  color: string
  label?: string
  glowColor?: string
}

interface PremiumGaugeProps {
  primary: GaugeConfig
  secondary?: GaugeConfig
  title?: string
  subtitle?: string
  unit?: string
  size?: number
  startAngle?: number
  endAngle?: number
  showInnerGlow?: boolean
}

// Convert polar to cartesian coordinates
function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  }
}

// Create arc path
function createArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0

  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

// Get color based on value percentage for dynamic coloring
function getGradientColors(color: string) {
  const colorMap: Record<string, { start: string; end: string }> = {
    green: { start: '#22c55e', end: '#4ade80' },
    red: { start: '#ef4444', end: '#f87171' },
    amber: { start: '#f59e0b', end: '#fbbf24' },
    blue: { start: '#3b82f6', end: '#60a5fa' },
    purple: { start: '#9333ea', end: '#a855f7' },
    cyan: { start: '#06b6d4', end: '#22d3ee' },
  }
  return colorMap[color] || { start: color, end: color }
}

export function PremiumGauge({
  primary,
  secondary,
  title,
  subtitle,
  unit = '',
  size = 200,
  startAngle = -135,
  endAngle = 135,
  showInnerGlow = true,
}: PremiumGaugeProps) {
  const { t: _t } = useTranslation()
  const viewSize = 100
  const cx = viewSize / 2
  const cy = viewSize / 2
  const primaryRadius = 42
  const secondaryRadius = 35
  const strokeWidth = 6
  const trackStrokeWidth = 4

  const totalAngle = endAngle - startAngle

  // Calculate arc angles based on values
  const primaryAngle = useMemo(() => {
    const percentage = Math.min(primary.value / primary.max, 1)
    return startAngle + percentage * totalAngle
  }, [primary.value, primary.max, startAngle, totalAngle])

  const secondaryAngle = useMemo(() => {
    if (!secondary) return startAngle
    const percentage = Math.min(secondary.value / secondary.max, 1)
    return startAngle + percentage * totalAngle
  }, [secondary, startAngle, totalAngle])

  const primaryColors = getGradientColors(primary.color)
  const secondaryColors = secondary ? getGradientColors(secondary.color) : null

  const uniqueId = useMemo(() => Math.random().toString(36).substr(2, 9), [])

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${viewSize} ${viewSize}`}
        className="w-full h-full"
        style={{ filter: 'url(#gauge-shadow)' }}
      >
        <defs>
          {/* Glow filter */}
          <filter id={`glow-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Strong glow for arc */}
          <filter id={`arc-glow-${uniqueId}`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feFlood floodColor={primary.glowColor || primaryColors.start} floodOpacity="0.8" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Secondary arc glow */}
          {secondary && secondaryColors && (
            <filter id={`arc-glow-secondary-${uniqueId}`} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feFlood floodColor={secondary.glowColor || secondaryColors.start} floodOpacity="0.7" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          )}

          {/* Gradient for primary arc */}
          <linearGradient id={`primary-gradient-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={primaryColors.start} />
            <stop offset="100%" stopColor={primaryColors.end} />
          </linearGradient>

          {/* Gradient for secondary arc */}
          {secondaryColors && (
            <linearGradient id={`secondary-gradient-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={secondaryColors.start} />
              <stop offset="100%" stopColor={secondaryColors.end} />
            </linearGradient>
          )}

          {/* Inner glow radial gradient */}
          <radialGradient id={`inner-glow-${uniqueId}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={primary.glowColor || primaryColors.start} stopOpacity="0.3" />
            <stop offset="50%" stopColor={primary.glowColor || primaryColors.start} stopOpacity="0.1" />
            <stop offset="100%" stopColor={primary.glowColor || primaryColors.start} stopOpacity="0" />
          </radialGradient>

          {/* Drop shadow */}
          <filter id="gauge-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.3" />
          </filter>
        </defs>

        {/* Inner ambient glow */}
        {showInnerGlow && (
          <circle
            cx={cx}
            cy={cy}
            r={primaryRadius - 8}
            fill={`url(#inner-glow-${uniqueId})`}
          />
        )}

        {/* Track background - primary */}
        <path
          d={createArc(cx, cy, primaryRadius, startAngle, endAngle)}
          fill="none"
          stroke="#1e293b"
          strokeWidth={trackStrokeWidth}
          strokeLinecap="round"
          opacity={0.8}
        />

        {/* Track background - secondary */}
        {secondary && (
          <path
            d={createArc(cx, cy, secondaryRadius, startAngle, endAngle)}
            fill="none"
            stroke="#1e293b"
            strokeWidth={trackStrokeWidth - 1}
            strokeLinecap="round"
            opacity={0.6}
          />
        )}

        {/* Primary arc with glow */}
        <motion.path
          d={createArc(cx, cy, primaryRadius, startAngle, primaryAngle)}
          fill="none"
          stroke={`url(#primary-gradient-${uniqueId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          filter={`url(#arc-glow-${uniqueId})`}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />

        {/* Secondary arc with glow */}
        {secondary && secondaryColors && (
          <motion.path
            d={createArc(cx, cy, secondaryRadius, startAngle, secondaryAngle)}
            fill="none"
            stroke={`url(#secondary-gradient-${uniqueId})`}
            strokeWidth={strokeWidth - 1.5}
            strokeLinecap="round"
            filter={`url(#arc-glow-secondary-${uniqueId})`}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
          />
        )}

        {/* Center text area */}
        <g>
          {/* Primary value */}
          <text
            x={cx}
            y={secondary ? cy - 4 : cy}
            textAnchor="middle"
            dominantBaseline="middle"
            className="font-bold"
            fill="#ffffff"
            fontSize={secondary ? 12 : 14}
          >
            {primary.value.toFixed(1)}
            <tspan fontSize={secondary ? 6 : 7} fill="#94a3b8">{unit}</tspan>
          </text>

          {/* Primary label */}
          {primary.label && (
            <text
              x={cx}
              y={secondary ? cy - 14 : cy - 10}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#94a3b8"
              fontSize={5}
            >
              {primary.label}
            </text>
          )}

          {/* Secondary value */}
          {secondary && (
            <>
              <text
                x={cx}
                y={cy + 10}
                textAnchor="middle"
                dominantBaseline="middle"
                className="font-semibold"
                fill="#e2e8f0"
                fontSize={9}
              >
                {secondary.value.toFixed(1)}
                <tspan fontSize={5} fill="#64748b">{unit}</tspan>
              </text>
              {secondary.label && (
                <text
                  x={cx}
                  y={cy + 18}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#64748b"
                  fontSize={4}
                >
                  {secondary.label}
                </text>
              )}
            </>
          )}
        </g>

        {/* Title below gauge */}
        {title && (
          <text
            x={cx}
            y={viewSize - 5}
            textAnchor="middle"
            fill="#e2e8f0"
            fontSize={5}
            fontWeight="500"
          >
            {title}
          </text>
        )}
      </svg>

      {/* Subtitle below */}
      {subtitle && (
        <div className="text-center text-xs text-muted-foreground mt-1">
          {subtitle}
        </div>
      )}
    </div>
  )
}

export default PremiumGauge
