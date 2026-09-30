/**
 * SVG node visualizations (premium ring gauge and horseshoe gauge) and the
 * animated flow particle used by the EPPRoutingMetrics graph.
 *
 * Extracted from EPPRoutingMetrics.tsx to keep the main component focused
 * on orchestrating link/node layout and the selected-node detail panel.
 */
import { motion } from 'framer-motion'
import { getLoadColors, getHorseshoeColor } from '../shared/colorUtils'
import type { FlowLink, FlowNode } from './useEPPRoutingData'

const NODE_RADIUS = 6
const STROKE_WIDTH = 1.2
const TRACK_WIDTH = 0.8
const PARTICLE_RADIUS = 0.6

interface PremiumNodeProps {
  isSelected?: boolean
  node: FlowNode
  onClick?: () => void
  uniqueId: string
}

export function PremiumNode({ node, uniqueId, isSelected, onClick }: PremiumNodeProps) {
  const isGhost = node.isGhost || false
  const load = isGhost ? 0 : (node.load || 0)
  const loadColors = isGhost
    ? { start: '#475569', end: '#64748b', glow: '#475569' }
    : getLoadColors(load)

  const startAngle = -225
  const endAngle = 45
  const totalAngle = endAngle - startAngle
  const valueAngle = startAngle + (load / 100) * totalAngle

  const polarToCartesian = (angle: number, radius: number) => {
    const radians = ((angle - 90) * Math.PI) / 180
    return { x: node.x + radius * Math.cos(radians), y: node.y + radius * Math.sin(radians) }
  }

  const createArc = (radius: number, start: number, end: number) => {
    const startPoint = polarToCartesian(end, radius)
    const endPoint = polarToCartesian(start, radius)
    const largeArc = end - start > 180 ? 1 : 0
    return `M ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${largeArc} 0 ${endPoint.x} ${endPoint.y}`
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
        <filter id={filterIdGlow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.35" result="blur" />
          <feFlood floodColor={loadColors.glow} floodOpacity="0.5" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={loadColors.start} />
          <stop offset="100%" stopColor={loadColors.end} />
        </linearGradient>

        <radialGradient id={innerGlowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={loadColors.glow} stopOpacity="0.2" />
          <stop offset="60%" stopColor={loadColors.glow} stopOpacity="0.08" />
          <stop offset="100%" stopColor={loadColors.glow} stopOpacity="0" />
        </radialGradient>

        <radialGradient id={centerGradientId} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </radialGradient>
      </defs>

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

      <circle
        cx={node.x}
        cy={node.y}
        r={NODE_RADIUS + 0.3}
        fill="none"
        stroke={loadColors.glow}
        strokeWidth="0.2"
        opacity={0.3}
        style={{ filter: 'blur(0.5px)' }}
      />

      <path
        d={createArc(NODE_RADIUS, startAngle, endAngle)}
        fill="none"
        stroke={isGhost ? '#475569' : '#1e293b'}
        strokeWidth={TRACK_WIDTH}
        strokeLinecap="round"
        strokeDasharray={isGhost ? '1 1' : undefined}
        opacity={isGhost ? 0.5 : 0.9}
      />

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

      <circle
        cx={node.x}
        cy={node.y}
        r={NODE_RADIUS - 1.5}
        fill={`url(#${centerGradientId})`}
      />

      <circle
        cx={node.x}
        cy={node.y}
        r={NODE_RADIUS - 1.5}
        fill={`url(#${innerGlowId})`}
      />

      {isGhost ? (
        <g transform={`translate(${node.x - 1.5}, ${node.y - 1.5})`}>
          <rect x="0" y="0" width="1" height="3" fill="#64748b" rx="0.2" />
          <rect x="2" y="0" width="1" height="3" fill="#64748b" rx="0.2" />
        </g>
      ) : load > 0 ? (
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
      ) : null}

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

interface FlowParticleProps {
  delay: number
  link: FlowLink
  nodes: FlowNode[]
  pathGenerator: (source: FlowNode, target: FlowNode) => string
}

export function FlowParticle({ link, delay, nodes, pathGenerator }: FlowParticleProps) {
  const sourceNode = nodes.find(node => node.id === link.source)
  const targetNode = nodes.find(node => node.id === link.target)

  if (!sourceNode || !targetNode) return null

  const color = link.type === 'prefill' ? '#9333ea' : link.type === 'decode' ? '#22c55e' : '#06b6d4'
  const path = pathGenerator(sourceNode, targetNode)
  const baseDuration = 4 - (link.percentage / 100) * 2.5

  return (
    <circle
      r={PARTICLE_RADIUS}
      fill={color}
      style={{ filter: `drop-shadow(0 0 1.5px ${color})` }}
    >
      <animateMotion
        dur={`${baseDuration}s`}
        repeatCount="indefinite"
        begin={`${delay}s`}
        path={path}
        calcMode="linear"
      />
      <animate
        attributeName="opacity"
        values="0;0.8;0.8;0.8;0.8;0.8;0.8;0.8;0.8;0"
        dur={`${baseDuration}s`}
        repeatCount="indefinite"
        begin={`${delay}s`}
      />
    </circle>
  )
}

interface HorseshoeNodeProps {
  isSelected?: boolean
  node: FlowNode
  onClick?: () => void
  uniqueId: string
}

export function HorseshoeNode({ node, uniqueId, isSelected, onClick }: HorseshoeNodeProps) {
  const isGhost = node.isGhost || false
  const load = isGhost ? 0 : (node.load || 0)
  const color = isGhost ? '#475569' : getHorseshoeColor(load)
  const filterId = `hs-glow-${uniqueId}-${node.id}`
  const radius = 8
  const strokeWidth = 2.5
  const cx = node.x
  const cy = node.y
  const startAngle = 135
  const endAngle = 45
  const totalSweep = 270
  const valueSweep = (load / 100) * totalSweep
  const valueEndAngle = startAngle + valueSweep

  const toCartesian = (angleDeg: number, r: number) => {
    const radians = (angleDeg * Math.PI) / 180
    return {
      x: cx + r * Math.cos(radians),
      y: cy + r * Math.sin(radians),
    }
  }

  const createArc = (radiusValue: number, fromAngle: number, toAngle: number, sweep: number) => {
    const start = toCartesian(fromAngle, radiusValue)
    const end = toCartesian(toAngle, radiusValue)
    const largeArc = sweep > 180 ? 1 : 0
    return `M ${start.x} ${start.y} A ${radiusValue} ${radiusValue} 0 ${largeArc} 1 ${end.x} ${end.y}`
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
        stroke={isGhost ? '#475569' : '#374151'}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={isGhost ? '2 2' : undefined}
        opacity={isGhost ? 0.5 : 1}
      />

      {load > 0 && !isGhost && (
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

      <circle
        cx={cx}
        cy={cy}
        r={radius - 3}
        fill="#0f172a"
      />

      {isGhost ? (
        <g transform={`translate(${cx - 2}, ${cy - 2})`}>
          <rect x="0" y="0" width="1.5" height="4" fill="#64748b" rx="0.3" />
          <rect x="2.5" y="0" width="1.5" height="4" fill="#64748b" rx="0.3" />
        </g>
      ) : (
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
      )}

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

