import { motion } from 'framer-motion'
import type { ServerMetrics } from '../../../lib/llmd/mockData'
import { getLoadColors, getHorseshoeColor } from './shared/colorUtils'

export const NODE_POSITIONS = {
  client: { x: 10, y: 50 },
  gateway: { x: 28, y: 50 },
  epp: { x: 48, y: 50 },
  prefill0: { x: 70, y: 18 },
  prefill1: { x: 70, y: 50 },
  prefill2: { x: 70, y: 82 },
  decode0: { x: 92, y: 34 },
  decode1: { x: 92, y: 66 } }

// Node styling constants
export const NODE_RADIUS = 6
export const STROKE_WIDTH = 1.5
export const TRACK_WIDTH = 1

// Connection between nodes
export interface Connection {
  from: keyof typeof NODE_POSITIONS
  to: keyof typeof NODE_POSITIONS
  type: 'prefill' | 'decode' | 'kv-transfer'
  trafficPercent: number
}

export const CONNECTIONS: Connection[] = [
  { from: 'client', to: 'gateway', type: 'prefill', trafficPercent: 100 },
  { from: 'gateway', to: 'epp', type: 'prefill', trafficPercent: 100 },
  { from: 'epp', to: 'prefill0', type: 'prefill', trafficPercent: 27 },
  { from: 'epp', to: 'prefill1', type: 'prefill', trafficPercent: 26 },
  { from: 'epp', to: 'prefill2', type: 'prefill', trafficPercent: 21 },
  { from: 'epp', to: 'decode0', type: 'decode', trafficPercent: 14 },
  { from: 'epp', to: 'decode1', type: 'decode', trafficPercent: 12 },
  { from: 'prefill0', to: 'decode0', type: 'decode', trafficPercent: 50 },
  { from: 'prefill0', to: 'decode1', type: 'decode', trafficPercent: 50 },
  { from: 'prefill1', to: 'decode0', type: 'decode', trafficPercent: 50 },
  { from: 'prefill1', to: 'decode1', type: 'decode', trafficPercent: 50 },
  { from: 'prefill2', to: 'decode0', type: 'decode', trafficPercent: 50 },
  { from: 'prefill2', to: 'decode1', type: 'decode', trafficPercent: 50 },
]

// Color palette
export const COLORS = {
  prefill: '#9333ea',
  decode: '#22c55e',
  'kv-transfer': '#06b6d4',
  gateway: '#3b82f6',
  epp: '#f59e0b' }

// Metric colors
export const METRIC_LOAD_COLOR = '#f59e0b'
export const METRIC_QUEUE_COLOR = '#06b6d4'

// Premium gauge node with glowing arc
export interface PremiumNodeProps {
  id: string
  label: string
  metrics?: ServerMetrics
  nodeColor: string
  isSelected?: boolean
  onClick?: () => void
  uniqueId: string
  nodePositions: Record<string, { x: number; y: number }>
  isGhost?: boolean  // For scaled-to-0 autoscaler nodes
}

export function PremiumNode({ id, label, metrics, nodeColor, isSelected, onClick, uniqueId, nodePositions, isGhost }: PremiumNodeProps) {
  const pos = nodePositions[id]
  if (!pos) return null
  const load = isGhost ? 0 : (metrics?.load || 0)
  const loadColors = isGhost ? { start: '#475569', end: '#64748b', glow: '#475569' } : getLoadColors(load)

  // Arc calculation (270 degrees, bottom open)
  const startAngle = -225
  const endAngle = 45
  const totalAngle = endAngle - startAngle
  const valueAngle = startAngle + (load / 100) * totalAngle

  const polarToCartesian = (angle: number, r: number) => {
    const rad = ((angle - 90) * Math.PI) / 180
    return { x: pos.x + r * Math.cos(rad), y: pos.y + r * Math.sin(rad) }
  }

  const createArc = (r: number, start: number, end: number) => {
    const s = polarToCartesian(end, r)
    const e = polarToCartesian(start, r)
    const large = end - start > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`
  }

  const filterIdGlow = `glow-${uniqueId}-${id}`
  const gradientId = `gradient-${uniqueId}-${id}`
  const innerGlowId = `inner-glow-${uniqueId}-${id}`
  const centerGradientId = `center-${uniqueId}-${id}`

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
          <feGaussianBlur stdDeviation="0.4" result="blur" />
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

      {/* Outer glow ring - uses node color for identity */}
      <circle
        cx={pos.x}
        cy={pos.y}
        r={NODE_RADIUS + 0.5}
        fill="none"
        stroke={metrics ? loadColors.glow : nodeColor}
        strokeWidth="0.3"
        opacity={0.3}
        style={{ filter: `blur(1px)` }}
      />

      {/* Selection highlight ring */}
      {isSelected && (
        <motion.circle
          cx={pos.x}
          cy={pos.y}
          r={NODE_RADIUS + 1.5}
          fill="none"
          stroke="#ffffff"
          strokeWidth="0.3"
          opacity={0.5}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      {/* Track background (270 degree arc) - dashed for ghost nodes */}
      <path
        d={createArc(NODE_RADIUS, startAngle, endAngle)}
        fill="none"
        stroke={isGhost ? '#475569' : '#1e293b'}
        strokeWidth={TRACK_WIDTH}
        strokeLinecap="round"
        strokeDasharray={isGhost ? '1 1' : undefined}
        opacity={isGhost ? 0.5 : 0.9}
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
        cx={pos.x}
        cy={pos.y}
        r={NODE_RADIUS - 1.8}
        fill={isGhost ? 'transparent' : `url(#${centerGradientId})`}
        stroke={isGhost ? '#475569' : undefined}
        strokeWidth={isGhost ? 0.5 : undefined}
        strokeDasharray={isGhost ? '1 1' : undefined}
        opacity={isGhost ? 0.4 : 1}
      />

      {/* Inner ambient glow overlay */}
      {!isGhost && (
        <circle
          cx={pos.x}
          cy={pos.y}
          r={NODE_RADIUS - 1.8}
          fill={`url(#${innerGlowId})`}
        />
      )}

      {/* Load percentage inside gauge - primary metric */}
      {isGhost ? (
        <>
          {/* Pause icon for ghost nodes */}
          <text
            x={pos.x}
            y={pos.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#64748b"
            fontSize="3"
          >
            ⏸
          </text>
        </>
      ) : metrics && (
        <>
          <text
            x={pos.x}
            y={pos.y - 0.5}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#ffffff"
            fontSize="3.2"
            fontWeight="700"
            style={{ textShadow: `0 0 4px ${loadColors.glow}` }}
          >
            {load}%
          </text>
          {/* RPS inside gauge - secondary metric */}
          <text
            x={pos.x}
            y={pos.y + 2.5}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#94a3b8"
            fontSize="1.8"
          >
            {metrics.throughputRps}
          </text>
        </>
      )}

      {/* Label below gauge */}
      <text
        x={pos.x}
        y={pos.y + NODE_RADIUS + 3}
        textAnchor="middle"
        fill={isGhost ? '#64748b' : '#e5e5e5'}
        fontSize={isGhost ? '2' : '2.5'}
        fontWeight="600"
        fontStyle={isGhost ? 'italic' : undefined}
      >
        {label}
      </text>
    </motion.g>
  )
}

// Connection line with animated flow - sleek design
export function FlowConnection({
  connection,
  isAnimating,
  nodePositions }: {
  connection: Connection
  isAnimating: boolean
  nodePositions: Record<string, { x: number; y: number }>
}) {
  const from = nodePositions[connection.from]
  const to = nodePositions[connection.to]
  if (!from || !to) return null
  const color = COLORS[connection.type]
  // Thinner lines - max 0.8px
  const strokeWidth = Math.max(0.2, connection.trafficPercent / 150)

  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2
  const curve = Math.abs(from.y - to.y) > 20 ? 8 : 3
  const pathD = `M ${from.x} ${from.y} Q ${midX} ${midY - curve} ${to.x} ${to.y}`

  return (
    <g>
      {/* Subtle glow underneath */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth + 0.5}
        opacity={0.05}
        style={{ filter: `blur(1px)` }}
      />
      {/* Main line - very subtle */}
      <path d={pathD} fill="none" stroke={color} strokeWidth={strokeWidth} opacity={0.18} />
      {/* Animated flowing dots - slower and subtler */}
      {isAnimating && (
        <motion.path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth * 1.2}
          strokeDasharray="0.4 4"
          strokeLinecap="round"
          opacity={0.5}
          animate={{ strokeDashoffset: [0, -8] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        />
      )}
      {/* Percentage label - smaller and more subtle */}
      {connection.trafficPercent >= 20 && (
        <text x={midX} y={midY - 1.5} textAnchor="middle" fill={color} fontSize="2" opacity={0.6} fontWeight="500">
          {connection.trafficPercent}%
        </text>
      )}
    </g>
  )
}

// Horseshoe node for alternative view
export interface HorseshoeFlowNodeProps {
  id: string
  label: string
  metrics?: ServerMetrics
  isSelected?: boolean
  onClick?: () => void
  uniqueId: string
  nodePositions: Record<string, { x: number; y: number }>
  isGhost?: boolean
}

export function HorseshoeFlowNode({ id, label, metrics, isSelected, onClick, uniqueId, nodePositions, isGhost }: HorseshoeFlowNodeProps) {
  const pos = nodePositions[id]
  if (!pos) return null
  const load = isGhost ? 0 : (metrics?.load || 0)
  const color = isGhost ? '#475569' : getHorseshoeColor(load)
  const filterId = `hsf-glow-${uniqueId}-${id}`

  const radius = 8
  const strokeWidth = 2.5
  const cx = pos.x
  const cy = pos.y

  const startAngle = 135
  const endAngle = 45
  const totalSweep = 270
  const valueSweep = (load / 100) * totalSweep
  const valueEndAngle = startAngle + valueSweep

  const toCartesian = (angleDeg: number, r: number) => {
    const rad = (angleDeg * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
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

      <path
        d={createArc(radius, startAngle, endAngle, totalSweep)}
        fill="none"
        stroke="#374151"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />

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

      <circle cx={cx} cy={cy} r={radius - 3} fill="#0f172a" />

      {metrics && (
        <>
          <text
            x={cx}
            y={cy - 0.5}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#ffffff"
            fontSize="4"
            fontWeight="700"
            style={{ textShadow: `0 0 4px ${color}` }}
          >
            {load}%
          </text>
          <text
            x={cx}
            y={cy + 3}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#94a3b8"
            fontSize="2"
          >
            {metrics.throughputRps}
          </text>
        </>
      )}

      <text
        x={cx}
        y={cy + radius + 4}
        textAnchor="middle"
        fill="#e5e5e5"
        fontSize="2.5"
        fontWeight="600"
      >
        {label}
      </text>
    </motion.g>
  )
}

// Mini sparkline for time-series data
export function Sparkline({ data, color, width = 80, height = 24 }: { data: number[]; color: string; width?: number; height?: number }) {
  // Filter out NaN/undefined values and ensure we have enough data points
  const validData = data.filter(v => Number.isFinite(v))
  if (validData.length < 2) return null

  const max = Math.max(...validData, 1)
  const min = Math.min(...validData, 0)
  const range = max - min || 1

  const points = validData.map((v, i) => {
    const x = (i / (validData.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')

  const areaPath = `M 0,${height} L ${points} L ${width},${height} Z`

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <filter id="sparkline-glow-line" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feFlood floodColor={color} floodOpacity="0.6" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path d={areaPath} fill="url(#sparkline-fill)" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        filter="url(#sparkline-glow-line)"
      />
      <circle
        cx={width}
        cy={height - ((validData[validData.length - 1] - min) / range) * (height - 4) - 2}
        r="2"
        fill={color}
        filter="url(#sparkline-glow-line)"
      />
    </svg>
  )
}
