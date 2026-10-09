import { memo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TrendingDown, TrendingUp } from 'lucide-react'
import type { KVCacheStats } from '../../../lib/llmd/mockData'
import { HorseshoeGauge } from './shared/HorseshoeGauge'
import type { SummaryStatsProps, VisualizationProps } from './KVCacheMonitor.types'
import {
  getDisplayPodName,
  getGaugeGridClass,
  getGaugeSize,
  getHorseshoeGridClass,
  getHorseshoeSize,
  HEATMAP_LEGEND,
  KVCACHE_MONITOR_DIV_STYLE_1,
  KVCACHE_MONITOR_DIV_STYLE_2,
} from './KVCacheMonitor.utils'
import { PremiumGauge, HeatCell } from './KVCacheMonitorGauges'

interface InfoSparklineProps {
  color: string
  data: number[]
  height?: number
  width?: number
}

interface TrendSparklineProps {
  history: number[]
}

const DEMO_VISUALIZATION_STATS: KVCacheStats[] = [
  {
    cluster: 'demo-cluster',
    evictionRate: 0.01,
    hitRate: 0.94,
    lastUpdated: new Date('2026-05-26T00:00:00Z'),
    namespace: 'llm-d',
    podName: 'Prefill (3)',
    totalCapacityGB: 240,
    usedGB: 164.4,
    utilizationPercent: 69,
  },
  {
    cluster: 'demo-cluster',
    evictionRate: 0.02,
    hitRate: 0.96,
    lastUpdated: new Date('2026-05-26T00:00:00Z'),
    namespace: 'llm-d',
    podName: 'Decode (4)',
    totalCapacityGB: 320,
    usedGB: 176,
    utilizationPercent: 55,
  },
  {
    cluster: 'demo-cluster',
    evictionRate: 0.015,
    hitRate: 0.9,
    lastUpdated: new Date('2026-05-26T00:00:00Z'),
    namespace: 'llm-d',
    podName: 'Unified (2)',
    totalCapacityGB: 96,
    usedGB: 57.6,
    utilizationPercent: 60,
  },
]

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
  isDemoData,
  isExpanded,
  onGaugeClick,
  selectedPod,
  stats,
  t,
  viewMode,
}: VisualizationProps) {
  const safeStats = (stats || []).length > 0 ? stats : isDemoData ? DEMO_VISUALIZATION_STATS : []

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
