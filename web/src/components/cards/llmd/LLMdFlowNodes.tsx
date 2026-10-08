import { motion } from 'framer-motion'
import type { ServerMetrics } from '../../../lib/llmd/mockData'
import { getLoadColors } from './shared/colorUtils'
import { COLORS, NODE_RADIUS, STROKE_WIDTH, TRACK_WIDTH, type Connection } from './LLMdFlowNodes.constants'

export {
  NODE_POSITIONS,
  NODE_RADIUS,
  STROKE_WIDTH,
  TRACK_WIDTH,
  CONNECTIONS,
  COLORS,
  METRIC_LOAD_COLOR,
  METRIC_QUEUE_COLOR,
  type Connection,
} from './LLMdFlowNodes.constants'
export { HorseshoeFlowNode, Sparkline, type HorseshoeFlowNodeProps } from './LLMdFlowNodes.horseshoe'

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
