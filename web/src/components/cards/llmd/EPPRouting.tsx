/**
 * EPP Routing Visualization
 *
 * Premium Sankey-style diagram showing request distribution through EPP
 * with glowing nodes, animated flow particles, and routing percentages.
 */
import { useState, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, ArrowRight, CircleDot } from 'lucide-react'
import { Acronym } from './shared/PortalTooltip'

type MetricType = 'load' | 'rps'
type ViewMode = 'default' | 'horseshoe'

// Node styling constants
const NODE_RADIUS = 6
const STROKE_WIDTH = 1.2
const TRACK_WIDTH = 0.8
const PARTICLE_RADIUS = 0.6

interface FlowNode {
  id: string
  label: string
  x: number
  y: number
  type: 'source' | 'router' | 'prefill' | 'decode'
  color: string
  load?: number
}

interface FlowLink {
  source: string
  target: string
  value: number
  percentage: number
  type: 'prefill' | 'decode' | 'kv-transfer'
}

// Node layout - spread across viewBox
const NODES: FlowNode[] = [
  { id: 'requests', label: 'Requests', x: 12, y: 50, type: 'source', color: '#3b82f6', load: 0 },
  { id: 'epp', label: 'EPP', x: 38, y: 50, type: 'router', color: '#f59e0b', load: 65 },
  { id: 'prefill-0', label: 'Prefill-0', x: 65, y: 15, type: 'prefill', color: '#9333ea', load: 72 },
  { id: 'prefill-1', label: 'Prefill-1', x: 65, y: 38, type: 'prefill', color: '#9333ea', load: 58 },
  { id: 'prefill-2', label: 'Prefill-2', x: 65, y: 62, type: 'prefill', color: '#9333ea', load: 45 },
  { id: 'decode-0', label: 'Decode-0', x: 65, y: 85, type: 'decode', color: '#22c55e', load: 80 },
  { id: 'decode-1', label: 'Decode-1', x: 90, y: 50, type: 'decode', color: '#22c55e', load: 67 },
]

// Get color based on load percentage
const getLoadColors = (load: number) => {
  if (load >= 90) return { start: '#ef4444', end: '#f87171', glow: '#ef4444' }
  if (load >= 70) return { start: '#f59e0b', end: '#fbbf24', glow: '#f59e0b' }
  if (load >= 50) return { start: '#eab308', end: '#facc15', glow: '#eab308' }
  return { start: '#22c55e', end: '#4ade80', glow: '#22c55e' }
}

// Mini sparkline for time-series data
function Sparkline({ data, color, width = 80, height = 24 }: { data: number[]; color: string; width?: number; height?: number }) {
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
        <linearGradient id={`sparkline-fill-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#sparkline-fill-${color.replace('#', '')})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        style={{ filter: `drop-shadow(0 0 2px ${color})` }}
      />
      <circle
        cx={width}
        cy={height - ((data[data.length - 1] - min) / range) * (height - 4) - 2}
        r="2"
        fill={color}
        style={{ filter: `drop-shadow(0 0 2px ${color})` }}
      />
    </svg>
  )
}

// Premium node with glowing arc gauge
interface PremiumNodeProps {
  node: FlowNode
  uniqueId: string
  isSelected?: boolean
  onClick?: () => void
}

function PremiumNode({ node, uniqueId, isSelected, onClick }: PremiumNodeProps) {
  const load = node.load || 0
  const loadColors = getLoadColors(load)

  // Arc calculation (270 degrees, bottom open)
  const startAngle = -225
  const endAngle = 45
  const totalAngle = endAngle - startAngle
  const valueAngle = startAngle + (load / 100) * totalAngle

  const polarToCartesian = (angle: number, r: number) => {
    const rad = ((angle - 90) * Math.PI) / 180
    return { x: node.x + r * Math.cos(rad), y: node.y + r * Math.sin(rad) }
  }

  const createArc = (r: number, start: number, end: number) => {
    const s = polarToCartesian(end, r)
    const e = polarToCartesian(start, r)
    const large = end - start > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`
  }

  const filterIdGlow = `epp-glow-${uniqueId}-${node.id}`
  const gradientId = `epp-gradient-${uniqueId}-${node.id}`
  const innerGlowId = `epp-inner-glow-${uniqueId}-${node.id}`
  const centerGradientId = `epp-center-${uniqueId}-${node.id}`

  return (
    <motion.g
      className="cursor-pointer"
      onClick={onClick}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <defs>
        {/* Glow filter - subtle */}
        <filter id={filterIdGlow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.35" result="blur" />
          <feFlood floodColor={loadColors.glow} floodOpacity="0.5" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Arc gradient */}
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={loadColors.start} />
          <stop offset="100%" stopColor={loadColors.end} />
        </linearGradient>

        {/* Inner ambient glow - subtle */}
        <radialGradient id={innerGlowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={loadColors.glow} stopOpacity="0.2" />
          <stop offset="60%" stopColor={loadColors.glow} stopOpacity="0.08" />
          <stop offset="100%" stopColor={loadColors.glow} stopOpacity="0" />
        </radialGradient>

        {/* Dark center gradient for depth */}
        <radialGradient id={centerGradientId} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </radialGradient>
      </defs>

      {/* Selection highlight ring */}
      {isSelected && (
        <motion.circle
          cx={node.x}
          cy={node.y}
          r={NODE_RADIUS + 1}
          fill="none"
          stroke="#ffffff"
          strokeWidth="0.3"
          opacity={0.6}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      {/* Outer glow ring */}
      <circle
        cx={node.x}
        cy={node.y}
        r={NODE_RADIUS + 0.3}
        fill="none"
        stroke={loadColors.glow}
        strokeWidth="0.2"
        opacity={0.3}
        style={{ filter: `blur(0.5px)` }}
      />

      {/* Track background (270 degree arc) */}
      <path
        d={createArc(NODE_RADIUS, startAngle, endAngle)}
        fill="none"
        stroke="#1e293b"
        strokeWidth={TRACK_WIDTH}
        strokeLinecap="round"
        opacity={0.9}
      />

      {/* Load arc with glow */}
      {load > 0 && (
        <motion.path
          d={createArc(NODE_RADIUS, startAngle, valueAngle)}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          filter={`url(#${filterIdGlow})`}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      )}

      {/* Dark center fill with gradient for depth */}
      <circle
        cx={node.x}
        cy={node.y}
        r={NODE_RADIUS - 1.5}
        fill={`url(#${centerGradientId})`}
      />

      {/* Inner ambient glow overlay */}
      <circle
        cx={node.x}
        cy={node.y}
        r={NODE_RADIUS - 1.5}
        fill={`url(#${innerGlowId})`}
      />

      {/* Load percentage inside gauge */}
      {load > 0 && (
        <text
          x={node.x}
          y={node.y + 0.5}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#ffffff"
          fontSize="2.8"
          fontWeight="700"
          style={{ textShadow: `0 0 3px ${loadColors.glow}` }}
        >
          {load}%
        </text>
      )}

      {/* Node label below */}
      <text
        x={node.x}
        y={node.y + NODE_RADIUS + 3}
        textAnchor="middle"
        fill="#e5e5e5"
        fontSize="2.5"
        fontWeight="600"
      >
        {node.label}
      </text>
    </motion.g>
  )
}

// Flow particle component - follows quadratic bezier curve
interface FlowParticleProps {
  link: FlowLink
  delay: number
}

function FlowParticle({ link, delay }: FlowParticleProps) {
  const sourceNode = NODES.find(n => n.id === link.source)
  const targetNode = NODES.find(n => n.id === link.target)

  if (!sourceNode || !targetNode) return null

  const color = link.type === 'prefill' ? '#9333ea' : link.type === 'decode' ? '#22c55e' : '#06b6d4'

  // Calculate control point for quadratic bezier (same as path)
  const midX = (sourceNode.x + targetNode.x) / 2
  const midY = (sourceNode.y + targetNode.y) / 2
  const curve = Math.abs(sourceNode.y - targetNode.y) > 20 ? 8 : 3
  const controlX = midX
  const controlY = midY - curve

  // Generate points along the quadratic bezier curve
  const numPoints = 20
  const curvePoints: { x: number; y: number }[] = []
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints
    // Quadratic bezier: B(t) = (1-t)²P0 + 2(1-t)t*P1 + t²P2
    const x = Math.pow(1 - t, 2) * sourceNode.x + 2 * (1 - t) * t * controlX + Math.pow(t, 2) * targetNode.x
    const y = Math.pow(1 - t, 2) * sourceNode.y + 2 * (1 - t) * t * controlY + Math.pow(t, 2) * targetNode.y
    curvePoints.push({ x, y })
  }

  return (
    <motion.circle
      r={PARTICLE_RADIUS}
      fill={color}
      initial={{ cx: curvePoints[0].x, cy: curvePoints[0].y, opacity: 0 }}
      animate={{
        cx: curvePoints.map(p => p.x),
        cy: curvePoints.map(p => p.y),
        opacity: [0, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0, 0],
      }}
      transition={{
        duration: 2.5,
        delay,
        repeat: Infinity,
        ease: 'linear',
      }}
      style={{ filter: `drop-shadow(0 0 1.5px ${color})` }}
    />
  )
}


// Large horseshoe gauge node for horseshoe view mode
interface HorseshoeNodeProps {
  node: FlowNode
  uniqueId: string
  isSelected?: boolean
  onClick?: () => void
}

// Color based on percentage (green -> yellow -> orange -> red)
const getHorseshoeColor = (pct: number) => {
  if (pct >= 90) return '#ef4444' // red
  if (pct >= 70) return '#f59e0b' // amber/orange
  if (pct >= 50) return '#eab308' // yellow
  return '#22c55e' // green
}

function HorseshoeNode({ node, uniqueId, isSelected, onClick }: HorseshoeNodeProps) {
  const load = node.load || 0
  const color = getHorseshoeColor(load)
  const filterId = `hs-glow-${uniqueId}-${node.id}`

  // Larger horseshoe for this view
  const radius = 8
  const strokeWidth = 2.5
  const cx = node.x
  const cy = node.y

  // Horseshoe arc angles - upright orientation (open at bottom)
  const startAngle = 135  // bottom-left of opening
  const endAngle = 45     // bottom-right of opening
  const totalSweep = 270  // degrees (going the long way around through top)
  const valueSweep = (load / 100) * totalSweep
  const valueEndAngle = startAngle + valueSweep

  const toCartesian = (angleDeg: number, r: number) => {
    const rad = (angleDeg * Math.PI) / 180
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad)
    }
  }

  const createArc = (r: number, fromAngle: number, toAngle: number, sweep: number) => {
    const start = toCartesian(fromAngle, r)
    const end = toCartesian(toAngle, r)
    const largeArc = sweep > 180 ? 1 : 0
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`
  }

  return (
    <motion.g
      className="cursor-pointer"
      onClick={onClick}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feFlood floodColor={color} floodOpacity="0.5" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Selection highlight ring */}
      {isSelected && (
        <motion.circle
          cx={cx}
          cy={cy}
          r={radius + 1.5}
          fill="none"
          stroke="#ffffff"
          strokeWidth="0.3"
          opacity={0.6}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      {/* Track background arc */}
      <path
        d={createArc(radius, startAngle, endAngle, totalSweep)}
        fill="none"
        stroke="#374151"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />

      {/* Value arc */}
      {load > 0 && (
        <motion.path
          d={createArc(radius, startAngle, valueEndAngle, valueSweep)}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          filter={`url(#${filterId})`}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      )}

      {/* Center fill */}
      <circle
        cx={cx}
        cy={cy}
        r={radius - 3}
        fill="#0f172a"
      />

      {/* Percentage text */}
      <text
        x={cx}
        y={cy + 0.5}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#ffffff"
        fontSize="4"
        fontWeight="700"
        style={{ textShadow: `0 0 4px ${color}` }}
      >
        {load}%
      </text>

      {/* Label below */}
      <text
        x={cx}
        y={cy + radius + 4}
        textAnchor="middle"
        fill="#e5e5e5"
        fontSize="2.8"
        fontWeight="600"
      >
        {node.label}
      </text>
    </motion.g>
  )
}

export function EPPRouting() {
  const [hoveredLink, setHoveredLink] = useState<string | null>(null)
  const [showParticles, setShowParticles] = useState(true)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [nodeMetrics, setNodeMetrics] = useState<Record<string, { load: number; rps: number }>>({})
  const [metricsHistory, setMetricsHistory] = useState<Record<string, { load: number[]; rps: number[] }>>({})
  const [selectedMetricTypes, setSelectedMetricTypes] = useState<MetricType[]>(['load'])
  const [viewMode, setViewMode] = useState<ViewMode>('default')
  const uniqueId = useRef(`epp-${Math.random().toString(36).substr(2, 9)}`).current

  // Toggle metric selection
  const toggleMetric = (metric: MetricType) => {
    setSelectedMetricTypes(prev => {
      if (prev.includes(metric)) {
        if (prev.length === 1) return prev
        return prev.filter(m => m !== metric)
      }
      return [...prev, metric]
    })
  }

  // Simulate metrics updates
  useEffect(() => {
    const updateMetrics = () => {
      const newMetrics: Record<string, { load: number; rps: number }> = {}
      NODES.forEach(node => {
        if (node.type !== 'source') {
          newMetrics[node.id] = {
            load: Math.floor(40 + Math.random() * 50),
            rps: Math.floor(80 + Math.random() * 150),
          }
        }
      })
      setNodeMetrics(newMetrics)

      // Update history
      setMetricsHistory(prev => {
        const updated = { ...prev }
        Object.entries(newMetrics).forEach(([id, m]) => {
          if (!updated[id]) {
            updated[id] = { load: [], rps: [] }
          }
          updated[id] = {
            load: [...updated[id].load.slice(-19), m.load],
            rps: [...updated[id].rps.slice(-19), m.rps],
          }
        })
        return updated
      })
    }

    updateMetrics()
    const interval = setInterval(updateMetrics, 2000)
    return () => clearInterval(interval)
  }, [])

  // Get current node with live metrics
  const getNodeWithMetrics = (node: FlowNode): FlowNode => {
    const m = nodeMetrics[node.id]
    if (!m) return node
    return { ...node, load: m.load }
  }

  // Transform routing stats to flow links
  const links = useMemo((): FlowLink[] => {
    return [
      { source: 'requests', target: 'epp', value: 450, percentage: 100, type: 'prefill' as const },
      { source: 'epp', target: 'prefill-0', value: 120, percentage: 27, type: 'prefill' as const },
      { source: 'epp', target: 'prefill-1', value: 115, percentage: 26, type: 'prefill' as const },
      { source: 'epp', target: 'prefill-2', value: 95, percentage: 21, type: 'prefill' as const },
      { source: 'epp', target: 'decode-0', value: 65, percentage: 14, type: 'decode' as const },
      { source: 'epp', target: 'decode-1', value: 55, percentage: 12, type: 'decode' as const },
      { source: 'prefill-0', target: 'decode-1', value: 60, percentage: 50, type: 'decode' as const },
      { source: 'prefill-1', target: 'decode-1', value: 58, percentage: 50, type: 'decode' as const },
      { source: 'prefill-2', target: 'decode-1', value: 48, percentage: 50, type: 'decode' as const },
    ]
  }, [])

  // Aggregate metrics
  const metrics = useMemo(() => {
    const prefillTotal = links
      .filter(l => l.source === 'epp' && l.target.startsWith('prefill'))
      .reduce((sum, l) => sum + l.value, 0)
    const decodeTotal = links
      .filter(l => l.source === 'epp' && l.target.startsWith('decode'))
      .reduce((sum, l) => sum + l.value, 0)

    return {
      totalRps: 450,
      prefillRps: prefillTotal,
      decodeRps: decodeTotal,
      prefillPercent: Math.round((prefillTotal / 450) * 100),
      decodePercent: Math.round((decodeTotal / 450) * 100),
    }
  }, [links])

  // Generate path between nodes
  const generatePath = (source: FlowNode, target: FlowNode): string => {
    const midX = (source.x + target.x) / 2
    const curve = Math.abs(source.y - target.y) > 20 ? 8 : 3
    return `M ${source.x} ${source.y} Q ${midX} ${(source.y + target.y) / 2 - curve} ${target.x} ${target.y}`
  }

  return (
    <div className="p-4 h-full flex flex-col bg-gradient-to-br from-slate-900/50 to-slate-800/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/20">
            <Zap size={14} className="text-amber-400" />
          </div>
          <span className="font-medium text-white text-sm"><Acronym term="EPP" /> Routing</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === 'default' ? 'horseshoe' : 'default')}
            className={`px-2 py-1 text-xs rounded font-medium transition-all flex items-center gap-1 ${
              viewMode === 'horseshoe'
                ? 'bg-cyan-500/20 text-cyan-400 shadow-lg shadow-cyan-500/20'
                : 'bg-slate-700/50 text-slate-400'
            }`}
            title="Toggle horseshoe gauge view"
          >
            <CircleDot size={12} />
          </button>
          <button
            onClick={() => setShowParticles(!showParticles)}
            className={`px-3 py-1 text-xs rounded font-medium transition-all ${
              showParticles
                ? 'bg-amber-500/20 text-amber-400 shadow-lg shadow-amber-500/20'
                : 'bg-slate-700/50 text-slate-400'
            }`}
          >
            {showParticles ? 'Pause' : 'Play'}
          </button>
        </div>
      </div>

      {/* Metrics bar */}
      <div className="flex items-center gap-4 mb-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Total:</span>
          <span className="text-white font-mono">{metrics.totalRps} <Acronym term="RPS" /></span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-purple-500" style={{ boxShadow: '0 0 6px #9333ea' }} />
          <span className="text-purple-400 font-mono">{metrics.prefillPercent}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" style={{ boxShadow: '0 0 6px #22c55e' }} />
          <span className="text-green-400 font-mono">{metrics.decodePercent}%</span>
        </div>
      </div>

      {/* Main visualization area */}
      <div className="flex-1 relative min-h-[200px]">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id={`${uniqueId}-prefillGrad`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#9333ea" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id={`${uniqueId}-decodeGrad`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id={`${uniqueId}-handoffGrad`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#9333ea" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.5" />
            </linearGradient>
          </defs>

          {/* Links */}
          {links.map((link, i) => {
            const source = NODES.find(n => n.id === link.source)
            const target = NODES.find(n => n.id === link.target)
            if (!source || !target) return null

            const linkId = `${link.source}-${link.target}`
            const isHovered = hoveredLink === linkId
            const strokeWidth = Math.max(0.3, link.percentage / 35)

            const gradient =
              link.source === 'requests' ? `url(#${uniqueId}-prefillGrad)` :
              link.source === 'epp' && link.target.startsWith('prefill') ? `url(#${uniqueId}-prefillGrad)` :
              link.source === 'epp' && link.target.startsWith('decode') ? `url(#${uniqueId}-decodeGrad)` :
              `url(#${uniqueId}-handoffGrad)`

            return (
              <g key={linkId}>
                <motion.path
                  d={generatePath(source, target)}
                  fill="none"
                  stroke={gradient}
                  strokeWidth={strokeWidth}
                  opacity={isHovered ? 0.7 : 0.35}
                  onMouseEnter={() => setHoveredLink(linkId)}
                  onMouseLeave={() => setHoveredLink(null)}
                  className="cursor-pointer"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8, delay: i * 0.08 }}
                />

                {/* Percentage label for major routes */}
                {link.percentage >= 20 && (
                  <text
                    x={(source.x + target.x) / 2}
                    y={(source.y + target.y) / 2 - 2}
                    textAnchor="middle"
                    fill={isHovered ? '#fff' : '#71717a'}
                    fontSize="2.5"
                  >
                    {link.percentage}%
                  </text>
                )}
              </g>
            )
          })}

          {/* Animated particles */}
          {showParticles && links.map((link, i) => (
            <FlowParticle
              key={`particle-${link.source}-${link.target}`}
              link={link}
              delay={i * 0.2}
            />
          ))}

          {/* Nodes - render either default or horseshoe style */}
          {viewMode === 'horseshoe' ? (
            NODES.map((node) => (
              <HorseshoeNode
                key={node.id}
                node={getNodeWithMetrics(node)}
                uniqueId={uniqueId}
                isSelected={selectedNode === node.id}
                onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
              />
            ))
          ) : (
            NODES.map((node) => (
              <PremiumNode
                key={node.id}
                node={getNodeWithMetrics(node)}
                uniqueId={uniqueId}
                isSelected={selectedNode === node.id}
                onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
              />
            ))
          )}
        </svg>

        {/* Left-side node details panel */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute left-2 top-2 bg-slate-900/95 backdrop-blur-sm rounded-lg border border-slate-700 p-3 shadow-xl max-w-[180px]"
            >
              {(() => {
                const node = NODES.find(n => n.id === selectedNode)
                const metrics = nodeMetrics[selectedNode]
                const history = metricsHistory[selectedNode]
                if (!node) return null

                return (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-medium text-sm">{node.label}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedNode(null) }}
                        className="text-slate-400 hover:text-white text-xs"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="text-xs text-slate-400 mb-2 capitalize">
                      {node.type === 'router' ? 'Endpoint Picker Pod' :
                       node.type === 'prefill' ? 'Prefill Server' :
                       node.type === 'decode' ? 'Decode Server' : 'Source'}
                    </div>

                    {metrics && (
                      <div className="space-y-2">
                        {/* Clickable metrics */}
                        <div className="flex gap-1">
                          {(['load', 'rps'] as MetricType[]).map((metric) => (
                            <button
                              key={metric}
                              onClick={(e) => { e.stopPropagation(); toggleMetric(metric) }}
                              className={`px-2 py-0.5 text-xs rounded transition-all ${
                                selectedMetricTypes.includes(metric)
                                  ? metric === 'load'
                                    ? 'bg-amber-500/20 text-amber-400 shadow-sm shadow-amber-500/20'
                                    : 'bg-cyan-500/20 text-cyan-400 shadow-sm shadow-cyan-500/20'
                                  : 'bg-slate-700/50 text-slate-500 hover:text-slate-300'
                              }`}
                            >
                              {metric === 'load' ? 'Load' : 'RPS'}
                            </button>
                          ))}
                        </div>

                        {/* Current values */}
                        <div className="flex gap-3 text-xs">
                          {selectedMetricTypes.includes('load') && (
                            <div>
                              <span className="text-slate-500">Load:</span>{' '}
                              <span className="text-amber-400 font-mono">{metrics.load}%</span>
                            </div>
                          )}
                          {selectedMetricTypes.includes('rps') && (
                            <div>
                              <span className="text-slate-500">RPS:</span>{' '}
                              <span className="text-cyan-400 font-mono">{metrics.rps}</span>
                            </div>
                          )}
                        </div>

                        {/* Side-by-side sparklines */}
                        {history && (
                          <div className={`grid gap-2 ${selectedMetricTypes.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {selectedMetricTypes.includes('load') && (
                              <div>
                                <div className="text-[10px] text-amber-400/70 mb-1">Load %</div>
                                <Sparkline
                                  data={history.load}
                                  color="#f59e0b"
                                  width={selectedMetricTypes.length === 2 ? 65 : 140}
                                  height={28}
                                />
                              </div>
                            )}
                            {selectedMetricTypes.includes('rps') && (
                              <div>
                                <div className="text-[10px] text-cyan-400/70 mb-1">RPS</div>
                                <Sparkline
                                  data={history.rps}
                                  color="#06b6d4"
                                  width={selectedMetricTypes.length === 2 ? 65 : 140}
                                  height={28}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {node.type === 'source' && (
                      <div className="text-xs text-slate-500">
                        Incoming inference requests
                      </div>
                    )}
                  </>
                )
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hovered link details */}
      {hoveredLink && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/95 backdrop-blur-sm rounded-lg p-3 border border-slate-700 text-xs shadow-xl"
        >
          {(() => {
            const link = links.find(l => `${l.source}-${l.target}` === hoveredLink)
            if (!link) return null

            return (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-white capitalize font-medium">{link.source.replace('-', ' ')}</span>
                  <ArrowRight size={12} className="text-muted-foreground" />
                  <span className="text-white capitalize font-medium">{link.target.replace('-', ' ')}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">
                    <span className="text-white font-mono">{link.value}</span> rps
                  </span>
                  <span className={`font-mono font-medium ${
                    link.type === 'prefill' ? 'text-purple-400' : 'text-green-400'
                  }`}>
                    {link.percentage}%
                  </span>
                </div>
              </div>
            )
          })()}
        </motion.div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-1 bg-gradient-to-r from-amber-500/60 to-purple-500/60 rounded" style={{ boxShadow: '0 0 4px rgba(147,51,234,0.4)' }} />
          <span className="text-muted-foreground">Prefill</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-1 bg-gradient-to-r from-amber-500/60 to-green-500/60 rounded" style={{ boxShadow: '0 0 4px rgba(34,197,94,0.4)' }} />
          <span className="text-muted-foreground">Decode</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-1 bg-gradient-to-r from-purple-500/60 to-green-500/60 rounded" style={{ boxShadow: '0 0 4px rgba(34,197,94,0.4)' }} />
          <span className="text-muted-foreground">Handoff</span>
        </div>
      </div>
    </div>
  )
}

export default EPPRouting
