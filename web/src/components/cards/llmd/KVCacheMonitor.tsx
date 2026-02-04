/**
 * KVCache Monitor
 *
 * Real-time visualization of KV cache levels across pods
 * with animated gauges, heat maps, and trend indicators.
 */
import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Database, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { generateKVCacheStats, type KVCacheStats } from '../../../lib/llmd/mockData'

interface GaugeProps {
  value: number
  maxValue: number
  label: string
  sublabel?: string
  size?: 'sm' | 'md' | 'lg'
  showWarning?: boolean
}

function AnimatedGauge({ value, maxValue, label, sublabel, size = 'md', showWarning }: GaugeProps) {
  const percentage = Math.min((value / maxValue) * 100, 100)

  const sizes = {
    sm: { radius: 32, stroke: 6, fontSize: 12 },
    md: { radius: 48, stroke: 8, fontSize: 14 },
    lg: { radius: 64, stroke: 10, fontSize: 16 },
  }

  const { radius, stroke, fontSize } = sizes[size]
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  // Color based on utilization
  const getColor = (pct: number) => {
    if (pct >= 90) return '#ef4444' // Red
    if (pct >= 75) return '#f59e0b' // Amber
    if (pct >= 50) return '#eab308' // Yellow
    return '#22c55e' // Green
  }

  const color = getColor(percentage)
  const glowColor = `${color}66`

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: radius * 2 + stroke, height: radius * 2 + stroke }}>
        {/* Background circle */}
        <svg
          width={radius * 2 + stroke}
          height={radius * 2 + stroke}
          className="transform -rotate-90"
        >
          <circle
            cx={radius + stroke / 2}
            cy={radius + stroke / 2}
            r={radius}
            fill="none"
            stroke="#334155"
            strokeWidth={stroke}
          />

          {/* Animated progress arc */}
          <motion.circle
            cx={radius + stroke / 2}
            cy={radius + stroke / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: 'easeOut' }}
            style={{ filter: `drop-shadow(0 0 6px ${glowColor})` }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="font-bold text-white"
            style={{ fontSize }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {Math.round(percentage)}%
          </motion.span>
          {showWarning && percentage >= 85 && (
            <AlertTriangle size={12} className="text-amber-400 mt-0.5" />
          )}
        </div>
      </div>

      <span className="text-xs text-white mt-2 font-medium truncate max-w-full">{label}</span>
      {sublabel && (
        <span className="text-xs text-muted-foreground">{sublabel}</span>
      )}
    </div>
  )
}

interface CacheHeatMapProps {
  stats: KVCacheStats[]
}

function CacheHeatMap({ stats }: CacheHeatMapProps) {
  const maxCells = 24 // 6x4 grid
  const cells = stats.slice(0, maxCells)

  const getHeatColor = (pct: number) => {
    if (pct >= 90) return 'bg-red-500'
    if (pct >= 75) return 'bg-amber-500'
    if (pct >= 50) return 'bg-yellow-500'
    if (pct >= 25) return 'bg-green-500'
    return 'bg-green-700'
  }

  return (
    <div className="grid grid-cols-6 gap-1">
      {cells.map((stat, i) => (
        <motion.div
          key={stat.podName}
          className={`h-6 rounded ${getHeatColor(stat.utilizationPercent)} relative group cursor-pointer`}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 0.8, scale: 1 }}
          transition={{ delay: i * 0.05 }}
          whileHover={{ opacity: 1, scale: 1.1 }}
        >
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <div className="text-white font-medium">{stat.podName}</div>
            <div className="text-muted-foreground">{stat.utilizationPercent}% used</div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

export function KVCacheMonitor() {
  const [stats, setStats] = useState<KVCacheStats[]>([])
  const [viewMode, setViewMode] = useState<'gauges' | 'heatmap'>('gauges')
  const [history, setHistory] = useState<number[]>([])

  // Update stats periodically
  useEffect(() => {
    const updateStats = () => {
      const newStats = generateKVCacheStats()
      setStats(newStats)

      // Track average utilization history
      const avg = newStats.reduce((sum, s) => sum + s.utilizationPercent, 0) / newStats.length
      setHistory(prev => [...prev.slice(-20), avg])
    }

    updateStats()
    const interval = setInterval(updateStats, 3000)
    return () => clearInterval(interval)
  }, [])

  // Calculate aggregate metrics
  const aggregateMetrics = useMemo(() => {
    if (stats.length === 0) return { avgUtil: 0, totalUsed: 0, totalCapacity: 0, avgHitRate: 0 }

    return {
      avgUtil: Math.round(stats.reduce((sum, s) => sum + s.utilizationPercent, 0) / stats.length),
      totalUsed: stats.reduce((sum, s) => sum + s.usedGB, 0),
      totalCapacity: stats.reduce((sum, s) => sum + s.totalCapacityGB, 0),
      avgHitRate: Math.round(stats.reduce((sum, s) => sum + s.hitRate, 0) / stats.length * 100),
    }
  }, [stats])

  // Trend indicator
  const trend = useMemo(() => {
    if (history.length < 2) return 0
    return history[history.length - 1] - history[history.length - 2]
  }, [history])

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Database size={18} className="text-cyan-400" />
          <span className="font-medium text-white">KV Cache Monitor</span>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex bg-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('gauges')}
              className={`px-2 py-1 text-xs rounded ${
                viewMode === 'gauges'
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'text-muted-foreground hover:text-white'
              }`}
            >
              Gauges
            </button>
            <button
              onClick={() => setViewMode('heatmap')}
              className={`px-2 py-1 text-xs rounded ${
                viewMode === 'heatmap'
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'text-muted-foreground hover:text-white'
              }`}
            >
              Heatmap
            </button>
          </div>

          {/* Demo badge */}
          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded">
            Demo
          </span>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="bg-slate-800/50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-white flex items-center justify-center gap-1">
            {aggregateMetrics.avgUtil}%
            {trend > 2 && <TrendingUp size={14} className="text-red-400" />}
            {trend < -2 && <TrendingDown size={14} className="text-green-400" />}
          </div>
          <div className="text-xs text-muted-foreground">Avg Util</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-white">
            {aggregateMetrics.totalUsed.toFixed(0)}
            <span className="text-xs text-muted-foreground">/{aggregateMetrics.totalCapacity}GB</span>
          </div>
          <div className="text-xs text-muted-foreground">Used</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-green-400">{aggregateMetrics.avgHitRate}%</div>
          <div className="text-xs text-muted-foreground">Hit Rate</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-white">{stats.length}</div>
          <div className="text-xs text-muted-foreground">Pods</div>
        </div>
      </div>

      {/* Main visualization */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'gauges' ? (
          <div className="grid grid-cols-3 gap-4 h-full place-items-center">
            {stats.slice(0, 6).map((stat) => (
              <AnimatedGauge
                key={stat.podName}
                value={stat.utilizationPercent}
                maxValue={100}
                label={stat.podName.replace('vllm-', '').slice(0, 12)}
                sublabel={`${stat.usedGB}/${stat.totalCapacityGB}GB`}
                size="md"
                showWarning
              />
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col">
            <CacheHeatMap stats={stats} />

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 mt-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-green-700" />
                <span className="text-muted-foreground">&lt;25%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-green-500" />
                <span className="text-muted-foreground">25-50%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-yellow-500" />
                <span className="text-muted-foreground">50-75%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-amber-500" />
                <span className="text-muted-foreground">75-90%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-red-500" />
                <span className="text-muted-foreground">&gt;90%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Trend sparkline */}
      <div className="mt-4 h-8">
        <svg width="100%" height="100%" viewBox="0 0 100 20" preserveAspectRatio="none">
          <defs>
            <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </linearGradient>
          </defs>

          {history.length > 1 && (
            <>
              {/* Area fill */}
              <path
                d={`M 0 20 ${history.map((v, i) =>
                  `L ${(i / (history.length - 1)) * 100} ${20 - (v / 100) * 20}`
                ).join(' ')} L 100 20 Z`}
                fill="url(#sparklineGradient)"
              />

              {/* Line */}
              <path
                d={`M ${history.map((v, i) =>
                  `${(i / (history.length - 1)) * 100} ${20 - (v / 100) * 20}`
                ).join(' L ')}`}
                fill="none"
                stroke="#06b6d4"
                strokeWidth="1"
                style={{ filter: 'drop-shadow(0 0 2px #06b6d4)' }}
              />
            </>
          )}
        </svg>
      </div>
    </div>
  )
}

export default KVCacheMonitor
