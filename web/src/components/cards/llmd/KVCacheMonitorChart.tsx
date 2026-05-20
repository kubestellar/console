import { memo, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { HorseshoeGauge } from './shared/HorseshoeGauge'
import type { SummaryStatsProps, VisualizationProps } from './KVCacheMonitor.types'
import {
  getDisplayPodName,
  getGaugeGridClass,
  getGaugeSize,
  getHeatCellColors,
  getHorseshoeGridClass,
  getHorseshoeSize,
  HEATMAP_LEGEND,
  KVCACHE_MONITOR_DIV_STYLE_1,
  KVCACHE_MONITOR_DIV_STYLE_2,
} from './KVCacheMonitor.utils'

interface PremiumGaugeProps {
  label: string
  maxValue: number
  size?: number
  sublabel?: string
  value: number
}

interface HeatCellProps {
  delay: number
  stat: VisualizationProps['stats'][number]
  t: VisualizationProps['t']
}

interface InfoSparklineProps {
  color: string
  data: number[]
  height?: number
  width?: number
}

interface TrendSparklineProps {
  history: number[]
}

const PremiumGauge = memo(function PremiumGauge({ label, maxValue, size = 140, sublabel, value }: PremiumGaugeProps) {
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

const HeatCell = memo(function HeatCell({ delay, stat, t }: HeatCellProps) {
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
})

export const InfoSparkline = memo(function InfoSparkline({ color, data, height = 30, width = 100 }: InfoSparklineProps) {
  const validData = (data || []).filter(value => Number.isFinite(value))
  if (validData.length < 2) {
    return <div className="rounded bg-secondary/30" style={{ height, width }} />
  }

  const max = Math.max(...validData, 1)
  const min = Math.min(...validData, 0)
  const range = max - min || 1
  const points = validData
    .map((value, index) => {
      const x = (index / (validData.length - 1)) * width
      const y = height - ((value - min) / range) * (height - 4) - 2
      return `${x},${y}`
    })
    .join(' ')
  const areaPath = `M 0,${height} L ${points} L ${width},${height} Z`
  const gradientId = `info-sparkline-${color.replace('#', '')}`
  const lastValue = validData[validData.length - 1]
  const lastY = height - ((lastValue - min) / range) * (height - 4) - 2

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <polyline fill="none" points={points} stroke={color} strokeWidth="1.5" />
      <circle cx={width} cy={lastY} r="2.5" fill={color} />
    </svg>
  )
})

export const SummaryStats = memo(function SummaryStats({ aggregateMetrics, podCount, t, trend }: SummaryStatsProps) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 @md:grid-cols-4">
      <div className="rounded-lg border border-border/50 bg-secondary/60 p-2 text-center backdrop-blur-xs">
        <div className="flex items-center justify-center gap-1 text-lg font-bold text-white">
          {aggregateMetrics.avgUtil}%
          {trend > 2 && <TrendingUp size={14} className="text-red-400" />}
          {trend < -2 && <TrendingDown size={14} className="text-green-400" />}
        </div>
        <div className="text-xs text-muted-foreground">{t('llmd.avgUtil')}</div>
      </div>
      <div className="rounded-lg border border-border/50 bg-secondary/60 p-2 text-center backdrop-blur-xs">
        <div className="text-lg font-bold text-white">
          {aggregateMetrics.totalUsed.toFixed(0)}
          <span className="text-xs text-muted-foreground">/{aggregateMetrics.totalCapacity}GB</span>
        </div>
        <div className="text-xs text-muted-foreground">{t('common:common.used')}</div>
      </div>
      <div className="rounded-lg border border-border/50 bg-secondary/60 p-2 text-center backdrop-blur-xs">
        <div className="text-lg font-bold text-green-400" style={KVCACHE_MONITOR_DIV_STYLE_1}>
          {aggregateMetrics.avgHitRate}%
        </div>
        <div className="text-xs text-muted-foreground">{t('llmd.hitRate')}</div>
      </div>
      <div className="rounded-lg border border-border/50 bg-secondary/60 p-2 text-center backdrop-blur-xs">
        <div className="text-lg font-bold text-cyan-400" style={KVCACHE_MONITOR_DIV_STYLE_2}>
          {podCount}
        </div>
        <div className="text-xs text-muted-foreground">{t('common:common.pods')}</div>
      </div>
    </div>
  )
})

export const TrendSparkline = memo(function TrendSparkline({ history }: TrendSparklineProps) {
  const safeHistory = history || []
  const hasTrendData = safeHistory.length > 1 && safeHistory.every(value => Number.isFinite(value))

  const areaPath = hasTrendData
    ? `M 0 24 ${safeHistory.map((value, index) => `L ${(index / (safeHistory.length - 1)) * 100} ${24 - ((value || 0) / 100) * 22}`).join(' ')} L 100 24 Z`
    : ''
  const linePath = hasTrendData
    ? `M ${safeHistory.map((value, index) => `${(index / (safeHistory.length - 1)) * 100} ${24 - ((value || 0) / 100) * 22}`).join(' L ')}`
    : ''
  const lastValue = hasTrendData ? safeHistory[safeHistory.length - 1] || 0 : 0

  return (
    <div className="relative mt-4 h-10">
      <svg width="100%" height="100%" viewBox="0 0 100 24" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
          </linearGradient>
          <filter id="sparkline-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feFlood floodColor="#06b6d4" floodOpacity="0.8" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {hasTrendData && (
          <>
            <path d={areaPath} fill="url(#sparklineGradient)" />
            <path d={linePath} fill="none" filter="url(#sparkline-glow)" stroke="#06b6d4" strokeWidth="1.5" />
            <circle cx={100} cy={24 - (lastValue / 100) * 22} r="2" fill="#06b6d4" filter="url(#sparkline-glow)" />
          </>
        )}
      </svg>
    </div>
  )
})

export const KVCacheMonitorVisualization = memo(function KVCacheMonitorVisualization({
  gaugeRefs,
  isExpanded,
  onGaugeClick,
  selectedPod,
  stats,
  t,
  viewMode,
}: VisualizationProps) {
  const safeStats = stats || []

  return (
    <AnimatePresence mode="wait">
      {viewMode === 'gauges' ? (
        <motion.div
          key="gauges"
          animate={{ opacity: 1, y: 0 }}
          className={`h-full overflow-auto ${getGaugeGridClass(safeStats.length, isExpanded)}`}
          exit={{ opacity: 0, y: -10 }}
          initial={{ opacity: 0, y: 10 }}
        >
          {safeStats.slice(0, isExpanded ? 20 : 12).map(stat => {
            const gaugeSize = getGaugeSize(safeStats.length, isExpanded)
            return (
              <button
                key={stat.podName}
                ref={element => {
                  gaugeRefs.current[stat.podName] = element
                }}
                aria-label={t('llmd.openPodDetails', 'Show details for {{podName}}', { podName: stat.podName })}
                aria-pressed={selectedPod === stat.podName}
                className={`cursor-pointer transition-transform hover:scale-105 ${selectedPod === stat.podName ? 'rounded-full ring-2 ring-cyan-500/50' : ''}`}
                onClick={() => onGaugeClick(stat.podName, gaugeRefs.current[stat.podName])}
                type="button"
              >
                <PremiumGauge
                  label={getDisplayPodName(t, stat.podName, gaugeSize < 100 ? 8 : 12)}
                  maxValue={100}
                  size={gaugeSize}
                  sublabel={gaugeSize >= 100 ? `${stat.usedGB}/${stat.totalCapacityGB}GB` : undefined}
                  value={stat.utilizationPercent}
                />
              </button>
            )
          })}
        </motion.div>
      ) : viewMode === 'horseshoe' ? (
        <motion.div
          key="horseshoe"
          animate={{ opacity: 1, y: 0 }}
          className={`grid h-full place-items-center overflow-auto ${getHorseshoeGridClass(safeStats.length, isExpanded)}`}
          exit={{ opacity: 0, y: -10 }}
          initial={{ opacity: 0, y: 10 }}
        >
          {safeStats.slice(0, isExpanded ? 16 : 8).map(stat => {
            const gaugeSize = getHorseshoeSize(safeStats.length, isExpanded)
            return (
              <button
                key={stat.podName}
                ref={element => {
                  gaugeRefs.current[stat.podName] = element
                }}
                aria-label={t('llmd.openPodDetails', 'Show details for {{podName}}', { podName: stat.podName })}
                aria-pressed={selectedPod === stat.podName}
                className={`cursor-pointer transition-transform hover:scale-105 ${selectedPod === stat.podName ? 'rounded-lg ring-2 ring-cyan-500/50' : ''}`}
                onClick={() => onGaugeClick(stat.podName, gaugeRefs.current[stat.podName])}
                type="button"
              >
                <HorseshoeGauge
                  label={getDisplayPodName(t, stat.podName, gaugeSize < 140 ? 8 : 12)}
                  maxValue={100}
                  secondaryLeft={gaugeSize >= 140 ? { label: t('common:common.used'), value: `${stat.usedGB.toFixed(1)}` } : undefined}
                  secondaryRight={gaugeSize >= 140 ? { label: t('common:common.free', 'Free'), value: `${(stat.totalCapacityGB - stat.usedGB).toFixed(1)}` } : undefined}
                  size={gaugeSize}
                  sublabel={gaugeSize >= 140 ? `${stat.totalCapacityGB}GB` : undefined}
                  value={stat.utilizationPercent}
                />
              </button>
            )
          })}
        </motion.div>
      ) : (
        <motion.div
          key="heatmap"
          animate={{ opacity: 1, y: 0 }}
          className="flex h-full flex-col"
          exit={{ opacity: 0, y: -10 }}
          initial={{ opacity: 0, y: 10 }}
        >
          <div className="grid grid-cols-6 gap-2">
            {safeStats.slice(0, 24).map((stat, index) => (
              <HeatCell key={stat.podName} delay={index * 0.03} stat={stat} t={t} />
            ))}
          </div>

          <div className="mt-4 flex items-center justify-center gap-4 text-xs">
            {HEATMAP_LEGEND.map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}80` }} />
                <span className="text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
})
