import { memo, useMemo } from 'react'
import { motion } from 'framer-motion'
import type { VisualizationProps } from './KVCacheMonitor.types'
import { getDisplayPodName, getHeatCellColors } from './KVCacheMonitor.utils'

export interface PremiumGaugeProps {
  label: string
  maxValue: number
  size?: number
  sublabel?: string
  value: number
}

export interface HeatCellProps {
  delay: number
  stat: VisualizationProps['stats'][number]
  t: VisualizationProps['t']
}

export const PremiumGauge = memo(function PremiumGauge({ label, maxValue, size = 140, sublabel, value }: PremiumGaugeProps) {
  const percentage = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0
  const viewSize = 100
  const cx = viewSize / 2
  const cy = viewSize / 2
  const primaryRadius = 40
  const strokeWidth = 8
  const trackStrokeWidth = 5
  const startAngle = -225
  const endAngle = 45
  const totalAngle = endAngle - startAngle
  const valueAngle = startAngle + (percentage / 100) * totalAngle

  const colors = useMemo(() => {
    if (percentage >= 90) return { end: '#f87171', glow: '#ef4444', start: '#ef4444' }
    if (percentage >= 75) return { end: '#fbbf24', glow: '#f59e0b', start: '#f59e0b' }
    if (percentage >= 50) return { end: '#facc15', glow: '#eab308', start: '#eab308' }
    return { end: '#4ade80', glow: '#22c55e', start: '#22c55e' }
  }, [percentage])

  const uniqueId = useMemo(() => `gauge-${Math.random().toString(36).slice(2, 11)}`, [])

  const createArc = (radius: number, start: number, end: number) => {
    const polarToCartesian = (angle: number, currentRadius: number) => {
      const radians = ((angle - 90) * Math.PI) / 180
      return {
        x: cx + currentRadius * Math.cos(radians),
        y: cy + currentRadius * Math.sin(radians),
      }
    }

    const startPoint = polarToCartesian(end, radius)
    const endPoint = polarToCartesian(start, radius)
    const largeArc = end - start > 180 ? 1 : 0

    return `M ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${largeArc} 0 ${endPoint.x} ${endPoint.y}`
  }

  return (
    <div className="flex flex-col items-center overflow-hidden" style={{ maxWidth: size + 20, width: size + 20 }}>
      <div className="relative" style={{ height: size, width: size }}>
        <svg viewBox={`0 0 ${viewSize} ${viewSize}`} className="h-full w-full">
          <defs>
            <filter id={`glow-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feFlood floodColor={colors.glow} floodOpacity="0.45" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <linearGradient id={`gradient-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={colors.start} />
              <stop offset="100%" stopColor={colors.end} />
            </linearGradient>

            <radialGradient id={`inner-glow-${uniqueId}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={colors.glow} stopOpacity="0.15" />
              <stop offset="60%" stopColor={colors.glow} stopOpacity="0.05" />
              <stop offset="100%" stopColor={colors.glow} stopOpacity="0" />
            </radialGradient>
          </defs>

          <circle cx={cx} cy={cy} r={primaryRadius - 6} fill={`url(#inner-glow-${uniqueId})`} />

          <path
            d={createArc(primaryRadius, startAngle, endAngle)}
            fill="none"
            opacity={0.9}
            stroke="#1e293b"
            strokeLinecap="round"
            strokeWidth={trackStrokeWidth}
          />

          <motion.path
            animate={{ pathLength: 1 }}
            d={createArc(primaryRadius, startAngle, valueAngle)}
            fill="none"
            filter={`url(#glow-${uniqueId})`}
            initial={{ pathLength: 0 }}
            stroke={`url(#gradient-${uniqueId})`}
            strokeLinecap="round"
            strokeWidth={strokeWidth}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />

          <text
            x={cx}
            y={cy - 2}
            dominantBaseline="middle"
            fill="#ffffff"
            fontSize="16"
            fontWeight="bold"
            style={{ textShadow: `0 0 6px ${colors.glow}` }}
            textAnchor="middle"
          >
            {Math.round(percentage)}%
          </text>
        </svg>
      </div>

      <span className="mt-1 w-full truncate text-center text-sm font-medium text-white">{label}</span>
      {sublabel && (
        <span className="w-full truncate text-center text-xs text-muted-foreground">{sublabel}</span>
      )}
    </div>
  )
})

export const HeatCell = memo(function HeatCell({ delay, stat, t }: HeatCellProps) {
  const colors = getHeatCellColors(stat.utilizationPercent)

  return (
    <motion.div
      animate={{ opacity: 0.85, scale: 1 }}
      className="group relative cursor-pointer rounded-md"
      initial={{ opacity: 0, scale: 0 }}
      style={{
        background: colors.bg,
        boxShadow: `0 0 12px ${colors.glow}, inset 0 0 8px rgba(255,255,255,0.1)`,
        height: '32px',
      }}
      transition={{ delay, stiffness: 200, type: 'spring' }}
      whileHover={{
        boxShadow: `0 0 20px ${colors.glow}, inset 0 0 12px rgba(255,255,255,0.2)`,
        opacity: 1,
        scale: 1.1,
      }}
    >
      <div className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-background/95 px-3 py-2 text-xs opacity-0 shadow-xl transition-opacity group-hover:opacity-100 backdrop-blur-xs">
        <div className="font-medium text-white">{getDisplayPodName(t, stat.podName)}</div>
        <div className="text-muted-foreground">{stat.utilizationPercent}% {t('common:common.used')}</div>
        <div className="text-2xs text-cyan-400">{stat.usedGB}/{stat.totalCapacityGB} GB</div>
      </div>
    </motion.div>
  )
