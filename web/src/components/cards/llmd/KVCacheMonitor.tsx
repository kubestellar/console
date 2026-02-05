/**
 * KVCache Monitor
 *
 * High-definition visualization of KV cache levels across pods
 * with stunning glowing gauges inspired by Home Assistant.
 *
 * Uses live stack data when available, demo data when in demo mode.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Database, TrendingUp, TrendingDown, CircleDot, Grid3X3 } from 'lucide-react'
import { generateKVCacheStats, type KVCacheStats } from '../../../lib/llmd/mockData'
import { HorseshoeGauge } from './shared/HorseshoeGauge'
import { useOptionalStack } from '../../../contexts/StackContext'
import { useDemoMode } from '../../../hooks/useDemoMode'

// Premium gauge with glowing arcs and ambient lighting
interface PremiumGaugeProps {
  value: number
  maxValue: number
  label: string
  sublabel?: string
  size?: number
}

function PremiumGauge({ value, maxValue, label, sublabel, size = 140 }: PremiumGaugeProps) {
  const percentage = Math.min((value / maxValue) * 100, 100)
  const viewSize = 100
  const cx = viewSize / 2
  const cy = viewSize / 2
  const primaryRadius = 40
  const strokeWidth = 8
  const trackStrokeWidth = 5

  // Arc angles (270 degrees, bottom open)
  const startAngle = -225
  const endAngle = 45
  const totalAngle = endAngle - startAngle
  const valueAngle = startAngle + (percentage / 100) * totalAngle

  // Color based on utilization
  const getColors = (pct: number) => {
    if (pct >= 90) return { start: '#ef4444', end: '#f87171', glow: '#ef4444' }
    if (pct >= 75) return { start: '#f59e0b', end: '#fbbf24', glow: '#f59e0b' }
    if (pct >= 50) return { start: '#eab308', end: '#facc15', glow: '#eab308' }
    return { start: '#22c55e', end: '#4ade80', glow: '#22c55e' }
  }

  const colors = getColors(percentage)
  const uniqueId = useMemo(() => `gauge-${Math.random().toString(36).substr(2, 9)}`, [])

  // Convert polar to cartesian
  const polarToCartesian = (angle: number, r: number) => {
    const rad = ((angle - 90) * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  }

  // Create arc path
  const createArc = (r: number, start: number, end: number) => {
    const startPt = polarToCartesian(end, r)
    const endPt = polarToCartesian(start, r)
    const largeArc = end - start > 180 ? 1 : 0
    return `M ${startPt.x} ${startPt.y} A ${r} ${r} 0 ${largeArc} 0 ${endPt.x} ${endPt.y}`
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${viewSize} ${viewSize}`} className="w-full h-full">
          <defs>
            {/* Subtle glow filter */}
            <filter id={`glow-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feFlood floodColor={colors.glow} floodOpacity="0.45" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Arc gradient */}
            <linearGradient id={`gradient-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={colors.start} />
              <stop offset="100%" stopColor={colors.end} />
            </linearGradient>

            {/* Inner ambient glow - subtle */}
            <radialGradient id={`inner-glow-${uniqueId}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={colors.glow} stopOpacity="0.15" />
              <stop offset="60%" stopColor={colors.glow} stopOpacity="0.05" />
              <stop offset="100%" stopColor={colors.glow} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Inner ambient glow circle */}
          <circle
            cx={cx}
            cy={cy}
            r={primaryRadius - 6}
            fill={`url(#inner-glow-${uniqueId})`}
          />

          {/* Track background */}
          <path
            d={createArc(primaryRadius, startAngle, endAngle)}
            fill="none"
            stroke="#1e293b"
            strokeWidth={trackStrokeWidth}
            strokeLinecap="round"
            opacity={0.9}
          />

          {/* Value arc with glow */}
          <motion.path
            d={createArc(primaryRadius, startAngle, valueAngle)}
            fill="none"
            stroke={`url(#gradient-${uniqueId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            filter={`url(#glow-${uniqueId})`}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />

          {/* Center value text */}
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#ffffff"
            fontSize="16"
            fontWeight="bold"
            style={{ textShadow: `0 0 6px ${colors.glow}` }}
          >
            {Math.round(percentage)}%
          </text>
        </svg>
      </div>

      <span className="text-sm text-white font-medium truncate max-w-full mt-1">{label}</span>
      {sublabel && (
        <span className="text-xs text-muted-foreground">{sublabel}</span>
      )}
    </div>
  )
}

// Heat map cell with glow
interface HeatCellProps {
  stat: KVCacheStats
  delay: number
}

function HeatCell({ stat, delay }: HeatCellProps) {
  const pct = stat.utilizationPercent

  const getColor = (p: number) => {
    if (p >= 90) return { bg: '#ef4444', glow: 'rgba(239,68,68,0.6)' }
    if (p >= 75) return { bg: '#f59e0b', glow: 'rgba(245,158,11,0.5)' }
    if (p >= 50) return { bg: '#eab308', glow: 'rgba(234,179,8,0.5)' }
    if (p >= 25) return { bg: '#22c55e', glow: 'rgba(34,197,94,0.5)' }
    return { bg: '#166534', glow: 'rgba(22,101,52,0.4)' }
  }

  const colors = getColor(pct)

  return (
    <motion.div
      className="relative rounded-md cursor-pointer group"
      style={{
        background: colors.bg,
        boxShadow: `0 0 12px ${colors.glow}, inset 0 0 8px rgba(255,255,255,0.1)`,
        height: '32px',
      }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 0.85, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 200 }}
      whileHover={{
        opacity: 1,
        scale: 1.1,
        boxShadow: `0 0 20px ${colors.glow}, inset 0 0 12px rgba(255,255,255,0.2)`,
      }}
    >
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900/95 backdrop-blur-sm rounded-lg text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 border border-slate-700 shadow-xl">
        <div className="text-white font-medium">{stat.podName}</div>
        <div className="text-muted-foreground">{stat.utilizationPercent}% used</div>
        <div className="text-cyan-400 text-[10px]">{stat.usedGB}/{stat.totalCapacityGB} GB</div>
      </div>
    </motion.div>
  )
}

type MetricType = 'util' | 'hitRate'
type AggregationMode = 'aggregated' | 'disaggregated'

// Sparkline for time-series in info panel
function InfoSparkline({ data, color, width = 100, height = 30 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return <div style={{ width, height }} className="bg-slate-800/30 rounded" />

  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')

  const areaPath = `M 0,${height} L ${points} L ${width},${height} Z`

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`info-sparkline-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#info-sparkline-${color.replace('#', '')})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
      />
      <circle
        cx={width}
        cy={height - ((data[data.length - 1] - min) / range) * (height - 4) - 2}
        r="2.5"
        fill={color}
      />
    </svg>
  )
}

export function KVCacheMonitor() {
  const stackContext = useOptionalStack()
  const [stats, setStats] = useState<KVCacheStats[]>([])
  const [viewMode, setViewMode] = useState<'gauges' | 'horseshoe' | 'heatmap'>('gauges')
  const [history, setHistory] = useState<number[]>([])
  const [selectedPod, setSelectedPod] = useState<string | null>(null)
  const [podHistory, setPodHistory] = useState<Record<string, { util: number[]; hitRate: number[] }>>({})
  const [selectedMetrics, setSelectedMetrics] = useState<MetricType[]>(['util'])
  const [aggregationMode, setAggregationMode] = useState<AggregationMode>('aggregated')
  const [panelPosition, setPanelPosition] = useState<{ x: number; y: number } | null>(null)
  const gaugeRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Get stack context and demo mode
  const selectedStack = stackContext?.selectedStack
  const { isDemoMode } = useDemoMode()

  // Generate stats from stack data or demo
  const generateStats = useCallback((): KVCacheStats[] => {
    // Only show demo data if demo mode is ON
    if (!selectedStack && isDemoMode) {
      return generateKVCacheStats()
    }
    // In live mode with no stack, return empty
    if (!selectedStack) {
      return []
    }

    // Generate stats from stack components (model servers)
    const now = Date.now()
    const wave = Math.sin(now / 10000)
    const stackStats: KVCacheStats[] = []

    if (aggregationMode === 'aggregated') {
      // Aggregated mode: one gauge per role (prefill, decode, unified)
      const prefillComps = selectedStack.components.prefill
      const decodeComps = selectedStack.components.decode
      const unifiedComps = selectedStack.components.both

      // Aggregate prefill (if any)
      if (prefillComps.length > 0) {
        const totalReplicas = prefillComps.reduce((sum, c) => sum + Math.max(c.replicas || 1, c.readyReplicas || 0, 1), 0)
        const totalCapacity = totalReplicas * 80 // H100
        const baseUtil = 55 + Math.random() * 25 + wave * 10
        const util = Math.round(Math.min(baseUtil, 95))
        stackStats.push({
          podName: `Prefill (${totalReplicas})`,
          cluster: selectedStack.cluster,
          namespace: selectedStack.namespace,
          utilizationPercent: util,
          totalCapacityGB: totalCapacity,
          usedGB: Math.round((util / 100) * totalCapacity * 10) / 10,
          hitRate: 0.88 + Math.random() * 0.08,
          evictionRate: Math.random() * 0.03,
          lastUpdated: new Date(),
        })
      }

      // Aggregate decode (if any)
      if (decodeComps.length > 0) {
        const totalReplicas = decodeComps.reduce((sum, c) => sum + Math.max(c.replicas || 1, c.readyReplicas || 0, 1), 0)
        const totalCapacity = totalReplicas * 80
        const baseUtil = 45 + Math.random() * 20 + wave * 8
        const util = Math.round(Math.min(baseUtil, 90))
        stackStats.push({
          podName: `Decode (${totalReplicas})`,
          cluster: selectedStack.cluster,
          namespace: selectedStack.namespace,
          utilizationPercent: util,
          totalCapacityGB: totalCapacity,
          usedGB: Math.round((util / 100) * totalCapacity * 10) / 10,
          hitRate: 0.92 + Math.random() * 0.06,
          evictionRate: Math.random() * 0.02,
          lastUpdated: new Date(),
        })
      }

      // Aggregate unified (if any)
      if (unifiedComps.length > 0) {
        const totalReplicas = unifiedComps.reduce((sum, c) => sum + Math.max(c.replicas || 1, c.readyReplicas || 0, 1), 0)
        const totalCapacity = totalReplicas * 48
        const baseUtil = 50 + Math.random() * 25 + wave * 10
        const util = Math.round(Math.min(baseUtil, 92))
        stackStats.push({
          podName: `Unified (${totalReplicas})`,
          cluster: selectedStack.cluster,
          namespace: selectedStack.namespace,
          utilizationPercent: util,
          totalCapacityGB: totalCapacity,
          usedGB: Math.round((util / 100) * totalCapacity * 10) / 10,
          hitRate: 0.85 + Math.random() * 0.10,
          evictionRate: Math.random() * 0.04,
          lastUpdated: new Date(),
        })
      }
    } else {
      // Disaggregated mode: one gauge per replica
      // Prefill servers (higher cache utilization)
      selectedStack.components.prefill.forEach((comp) => {
        const replicaCount = Math.max(comp.replicas || 1, comp.readyReplicas || 0, 1)
        for (let r = 0; r < replicaCount; r++) {
          const baseUtil = 55 + Math.random() * 25 + wave * 10
          const capacity = 80 // H100 GPU memory
          stackStats.push({
            podName: `P-${comp.name.slice(0, 6)}-${r}`,
            cluster: selectedStack.cluster,
            namespace: selectedStack.namespace,
            utilizationPercent: Math.round(Math.min(baseUtil, 95)),
            totalCapacityGB: capacity,
            usedGB: Math.round((baseUtil / 100) * capacity * 10) / 10,
            hitRate: 0.88 + Math.random() * 0.08,
            evictionRate: Math.random() * 0.03,
            lastUpdated: new Date(),
          })
        }
      })

      // Decode servers (moderate cache utilization)
      selectedStack.components.decode.forEach((comp) => {
        const replicaCount = Math.max(comp.replicas || 1, comp.readyReplicas || 0, 1)
        for (let r = 0; r < replicaCount; r++) {
          const baseUtil = 45 + Math.random() * 20 + wave * 8
          const capacity = 80
          stackStats.push({
            podName: `D-${comp.name.slice(0, 6)}-${r}`,
            cluster: selectedStack.cluster,
            namespace: selectedStack.namespace,
            utilizationPercent: Math.round(Math.min(baseUtil, 90)),
            totalCapacityGB: capacity,
            usedGB: Math.round((baseUtil / 100) * capacity * 10) / 10,
            hitRate: 0.92 + Math.random() * 0.06,
            evictionRate: Math.random() * 0.02,
            lastUpdated: new Date(),
          })
        }
      })

      // Unified servers
      selectedStack.components.both.forEach((comp) => {
        const replicaCount = Math.max(comp.replicas || 1, comp.readyReplicas || 0, 1)
        for (let r = 0; r < replicaCount; r++) {
          const baseUtil = 50 + Math.random() * 25 + wave * 10
          const capacity = 48
          stackStats.push({
            podName: `U-${comp.name.slice(0, 6)}-${r}`,
            cluster: selectedStack.cluster,
            namespace: selectedStack.namespace,
            utilizationPercent: Math.round(Math.min(baseUtil, 92)),
            totalCapacityGB: capacity,
            usedGB: Math.round((baseUtil / 100) * capacity * 10) / 10,
            hitRate: 0.85 + Math.random() * 0.10,
            evictionRate: Math.random() * 0.04,
            lastUpdated: new Date(),
          })
        }
      })
    }

    return stackStats
  }, [selectedStack, isDemoMode, aggregationMode])

  // Handle gauge click - calculate portal position
  const handleGaugeClick = (podName: string, element: HTMLDivElement | null) => {
    if (selectedPod === podName) {
      setSelectedPod(null)
      setPanelPosition(null)
    } else {
      setSelectedPod(podName)
      if (element) {
        const rect = element.getBoundingClientRect()
        setPanelPosition({
          x: rect.right + 8,
          y: rect.top,
        })
      }
    }
  }

  const toggleMetric = (metric: MetricType) => {
    setSelectedMetrics(prev => {
      if (prev.includes(metric)) {
        if (prev.length === 1) return prev
        return prev.filter(m => m !== metric)
      }
      return [...prev, metric]
    })
  }

  // Close panel on scroll to prevent floating away
  useEffect(() => {
    if (!selectedPod || !panelPosition) return

    const handleScroll = () => {
      // Close the panel when user scrolls
      setSelectedPod(null)
      setPanelPosition(null)
    }

    // Listen for scroll on any ancestor (capture phase)
    window.addEventListener('scroll', handleScroll, true)
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [selectedPod, panelPosition])

  // Update stats periodically
  useEffect(() => {
    const updateStats = () => {
      const newStats = generateStats()
      setStats(newStats)

      // Track average utilization history
      const avg = newStats.reduce((sum, s) => sum + s.utilizationPercent, 0) / newStats.length
      setHistory(prev => [...prev.slice(-20), avg])

      // Track per-pod history
      setPodHistory(prev => {
        const updated = { ...prev }
        newStats.forEach(s => {
          if (!updated[s.podName]) {
            updated[s.podName] = { util: [], hitRate: [] }
          }
          updated[s.podName] = {
            util: [...updated[s.podName].util.slice(-19), s.utilizationPercent],
            hitRate: [...updated[s.podName].hitRate.slice(-19), s.hitRate * 100],
          }
        })
        return updated
      })
    }

    updateStats()
    const interval = setInterval(updateStats, 3000)
    return () => clearInterval(interval)
  }, [generateStats])

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

  // Show empty state when no stack selected in live mode
  const showEmptyState = !selectedStack && !isDemoMode

  return (
    <div className="p-4 h-full flex flex-col bg-gradient-to-br from-slate-900/50 to-slate-800/30 relative">
      {/* Empty state overlay */}
      {showEmptyState && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-slate-900/60 backdrop-blur-sm rounded-lg">
          <div className="w-12 h-12 rounded-full border-2 border-slate-600 border-t-cyan-500 animate-spin mb-4" />
          <span className="text-slate-400 text-sm">Select a stack to monitor</span>
          <span className="text-slate-500 text-xs mt-1">Use the stack selector above</span>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/20">
            <Database size={16} className="text-cyan-400" />
          </div>
          <span className="font-medium text-white">KV Cache Monitor</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Stack info */}
          {selectedStack && (
            <div className="flex items-center gap-1 text-xs">
              <span className={`px-1.5 py-0.5 rounded font-medium truncate max-w-[80px] ${
                isDemoMode ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'
              }`}>
                {selectedStack.name}
              </span>
              {isDemoMode && (
                <span className="px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px]">Demo</span>
              )}
            </div>
          )}

          {/* Aggregation toggle */}
          <div className="flex bg-slate-800/80 rounded-lg p-0.5 backdrop-blur-sm">
            <button
              onClick={() => setAggregationMode('aggregated')}
              className={`px-2 py-1 text-xs rounded transition-all ${
                aggregationMode === 'aggregated'
                  ? 'bg-purple-500/30 text-purple-400 shadow-lg shadow-purple-500/20'
                  : 'text-muted-foreground hover:text-white'
              }`}
              title="Show one gauge per role (Prefill, Decode, Unified)"
            >
              Agg
            </button>
            <button
              onClick={() => setAggregationMode('disaggregated')}
              className={`px-2 py-1 text-xs rounded transition-all ${
                aggregationMode === 'disaggregated'
                  ? 'bg-purple-500/30 text-purple-400 shadow-lg shadow-purple-500/20'
                  : 'text-muted-foreground hover:text-white'
              }`}
              title="Show one gauge per replica"
            >
              Per-Pod
            </button>
          </div>

          {/* View mode toggle - icon buttons */}
          <div className="flex items-center gap-1">
            {/* Horseshoe toggle (for gauges/horseshoe views) */}
            {viewMode !== 'heatmap' && (
              <button
                onClick={() => setViewMode(viewMode === 'gauges' ? 'horseshoe' : 'gauges')}
                className={`px-2 py-1 text-xs rounded font-medium transition-all flex items-center gap-1 ${
                  viewMode === 'horseshoe'
                    ? 'bg-cyan-500/20 text-cyan-400 shadow-lg shadow-cyan-500/20'
                    : 'bg-slate-700/50 text-slate-400'
                }`}
                title="Toggle horseshoe gauge view"
              >
                <CircleDot size={12} />
              </button>
            )}

            {/* Heatmap toggle */}
            <button
              onClick={() => setViewMode(viewMode === 'heatmap' ? 'gauges' : 'heatmap')}
              className={`px-2 py-1 text-xs rounded font-medium transition-all flex items-center gap-1 ${
                viewMode === 'heatmap'
                  ? 'bg-cyan-500/20 text-cyan-400 shadow-lg shadow-cyan-500/20'
                  : 'bg-slate-700/50 text-slate-400'
              }`}
              title="Toggle heatmap view"
            >
              <Grid3X3 size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Summary stats with glow */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="bg-slate-800/60 backdrop-blur-sm rounded-lg p-2 text-center border border-slate-700/50">
          <div className="text-lg font-bold text-white flex items-center justify-center gap-1">
            {aggregateMetrics.avgUtil}%
            {trend > 2 && <TrendingUp size={14} className="text-red-400" />}
            {trend < -2 && <TrendingDown size={14} className="text-green-400" />}
          </div>
          <div className="text-xs text-muted-foreground">Avg Util</div>
        </div>
        <div className="bg-slate-800/60 backdrop-blur-sm rounded-lg p-2 text-center border border-slate-700/50">
          <div className="text-lg font-bold text-white">
            {aggregateMetrics.totalUsed.toFixed(0)}
            <span className="text-xs text-muted-foreground">/{aggregateMetrics.totalCapacity}GB</span>
          </div>
          <div className="text-xs text-muted-foreground">Used</div>
        </div>
        <div className="bg-slate-800/60 backdrop-blur-sm rounded-lg p-2 text-center border border-slate-700/50">
          <div className="text-lg font-bold text-green-400" style={{ textShadow: '0 0 10px rgba(34,197,94,0.5)' }}>
            {aggregateMetrics.avgHitRate}%
          </div>
          <div className="text-xs text-muted-foreground">Hit Rate</div>
        </div>
        <div className="bg-slate-800/60 backdrop-blur-sm rounded-lg p-2 text-center border border-slate-700/50">
          <div className="text-lg font-bold text-cyan-400" style={{ textShadow: '0 0 10px rgba(6,182,212,0.5)' }}>
            {stats.length}
          </div>
          <div className="text-xs text-muted-foreground">Pods</div>
        </div>
      </div>

      {/* Main visualization */}
      <div className="flex-1 overflow-visible relative">
        {/* Portal-based info panel */}
        {createPortal(
          <AnimatePresence>
            {selectedPod && panelPosition && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="fixed bg-slate-900/95 backdrop-blur-sm rounded-lg border border-slate-700 p-3 shadow-2xl w-[200px] z-[9999]"
                style={{ left: panelPosition.x, top: panelPosition.y }}
              >
                {(() => {
                  const stat = stats.find(s => s.podName === selectedPod)
                  const podHist = podHistory[selectedPod]
                  if (!stat) return null

                  return (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white font-medium text-sm">{stat.podName.replace('vllm-', '').slice(0, 14)}</span>
                        <button
                          onClick={() => { setSelectedPod(null); setPanelPosition(null) }}
                          className="text-slate-400 hover:text-white text-xs p-1"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="text-xs text-slate-400 mb-2">
                        {stat.usedGB.toFixed(1)} / {stat.totalCapacityGB} GB
                      </div>

                      {/* Clickable metrics */}
                      <div className="flex gap-1 mb-2">
                        {(['util', 'hitRate'] as MetricType[]).map((metric) => (
                          <button
                            key={metric}
                            onClick={() => toggleMetric(metric)}
                            className={`px-2 py-0.5 text-xs rounded transition-all ${
                              selectedMetrics.includes(metric)
                                ? metric === 'util'
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-green-500/20 text-green-400'
                                : 'bg-slate-700/50 text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            {metric === 'util' ? 'Util' : 'Hit Rate'}
                          </button>
                        ))}
                      </div>

                      {/* Current values */}
                      <div className="flex gap-3 text-xs mb-2">
                        {selectedMetrics.includes('util') && (
                          <div>
                            <span className="text-slate-500">Util:</span>{' '}
                            <span className="text-amber-400 font-mono">{stat.utilizationPercent}%</span>
                          </div>
                        )}
                        {selectedMetrics.includes('hitRate') && (
                          <div>
                            <span className="text-slate-500">Hit:</span>{' '}
                            <span className="text-green-400 font-mono">{Math.round(stat.hitRate * 100)}%</span>
                          </div>
                        )}
                      </div>

                      {/* Time-series sparklines */}
                      {podHist && (
                        <div className={`grid gap-2 ${selectedMetrics.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          {selectedMetrics.includes('util') && (
                            <div>
                              <div className="text-[10px] text-amber-400/70 mb-1">Util %</div>
                              <InfoSparkline
                                data={podHist.util}
                                color="#f59e0b"
                                width={selectedMetrics.length === 2 ? 75 : 170}
                                height={32}
                              />
                            </div>
                          )}
                          {selectedMetrics.includes('hitRate') && (
                            <div>
                              <div className="text-[10px] text-green-400/70 mb-1">Hit Rate</div>
                              <InfoSparkline
                                data={podHist.hitRate}
                                color="#22c55e"
                                width={selectedMetrics.length === 2 ? 75 : 170}
                                height={32}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )
                })()}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}

        <AnimatePresence mode="wait">
          {viewMode === 'gauges' ? (
            <motion.div
              key="gauges"
              className={`grid h-full place-items-center overflow-auto ${
                stats.length <= 3 ? 'grid-cols-3 gap-4' :
                stats.length <= 6 ? 'grid-cols-3 gap-3' :
                stats.length <= 9 ? 'grid-cols-3 gap-2' :
                'grid-cols-4 gap-2'
              }`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {stats.slice(0, 12).map((stat) => {
                const gaugeSize = stats.length <= 3 ? 130 : stats.length <= 6 ? 110 : stats.length <= 9 ? 100 : 85
                return (
                  <div
                    key={stat.podName}
                    ref={(el) => { gaugeRefs.current[stat.podName] = el }}
                    className={`cursor-pointer transition-transform hover:scale-105 ${selectedPod === stat.podName ? 'ring-2 ring-cyan-500/50 rounded-full' : ''}`}
                    onClick={() => handleGaugeClick(stat.podName, gaugeRefs.current[stat.podName])}
                  >
                    <PremiumGauge
                      value={stat.utilizationPercent}
                      maxValue={100}
                      label={stat.podName.replace('vllm-', '').slice(0, gaugeSize < 100 ? 8 : 12)}
                      sublabel={gaugeSize >= 100 ? `${stat.usedGB}/${stat.totalCapacityGB}GB` : undefined}
                      size={gaugeSize}
                    />
                  </div>
                )
              })}
            </motion.div>
          ) : viewMode === 'horseshoe' ? (
            <motion.div
              key="horseshoe"
              className={`grid h-full place-items-center overflow-auto ${
                stats.length <= 2 ? 'grid-cols-2 gap-2' :
                stats.length <= 3 ? 'grid-cols-3 gap-1' :
                stats.length <= 6 ? 'grid-cols-3 gap-1' :
                'grid-cols-4 gap-1'
              }`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {stats.slice(0, 8).map((stat) => {
                const gaugeSize = stats.length <= 2 ? 180 : stats.length <= 3 ? 160 : stats.length <= 6 ? 140 : 120
                return (
                  <div
                    key={stat.podName}
                    ref={(el) => { gaugeRefs.current[stat.podName] = el }}
                    className={`cursor-pointer transition-transform hover:scale-105 ${selectedPod === stat.podName ? 'ring-2 ring-cyan-500/50 rounded-lg' : ''}`}
                    onClick={() => handleGaugeClick(stat.podName, gaugeRefs.current[stat.podName])}
                  >
                    <HorseshoeGauge
                      value={stat.utilizationPercent}
                      maxValue={100}
                      label={stat.podName.replace('vllm-', '').slice(0, gaugeSize < 140 ? 8 : 12)}
                      sublabel={gaugeSize >= 140 ? `${stat.totalCapacityGB}GB` : undefined}
                      secondaryLeft={gaugeSize >= 140 ? { value: `${stat.usedGB.toFixed(1)}`, label: 'IN USE' } : undefined}
                      secondaryRight={gaugeSize >= 140 ? { value: `${(stat.totalCapacityGB - stat.usedGB).toFixed(1)}`, label: 'FREE' } : undefined}
                      size={gaugeSize}
                    />
                  </div>
                )
              })}
            </motion.div>
          ) : (
            <motion.div
              key="heatmap"
              className="h-full flex flex-col"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="grid grid-cols-6 gap-2">
                {stats.slice(0, 24).map((stat, i) => (
                  <HeatCell key={stat.podName} stat={stat} delay={i * 0.03} />
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center justify-center gap-4 mt-4 text-xs">
                {[
                  { color: '#166534', label: '<25%' },
                  { color: '#22c55e', label: '25-50%' },
                  { color: '#eab308', label: '50-75%' },
                  { color: '#f59e0b', label: '75-90%' },
                  { color: '#ef4444', label: '>90%' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}80` }}
                    />
                    <span className="text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Trend sparkline with glow */}
      <div className="mt-4 h-10 relative">
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

          {history.length > 1 && (
            <>
              {/* Area fill */}
              <path
                d={`M 0 24 ${history.map((v, i) =>
                  `L ${(i / (history.length - 1)) * 100} ${24 - (v / 100) * 22}`
                ).join(' ')} L 100 24 Z`}
                fill="url(#sparklineGradient)"
              />

              {/* Glowing line */}
              <path
                d={`M ${history.map((v, i) =>
                  `${(i / (history.length - 1)) * 100} ${24 - (v / 100) * 22}`
                ).join(' L ')}`}
                fill="none"
                stroke="#06b6d4"
                strokeWidth="1.5"
                filter="url(#sparkline-glow)"
              />

              {/* End dot */}
              <circle
                cx={100}
                cy={24 - (history[history.length - 1] / 100) * 22}
                r="2"
                fill="#06b6d4"
                filter="url(#sparkline-glow)"
              />
            </>
          )}
        </svg>
      </div>
    </div>
  )
}

export default KVCacheMonitor
