/**
 * LLM-d Flow Visualization
 *
 * Premium animated request flow diagram with Home Assistant-style
 * glowing gauges, time-series sparklines, and interactive elements.
 *
 * Now supports live data from selected llm-d stack via StackContext.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CircleDot } from 'lucide-react'
import { generateServerMetrics, type ServerMetrics } from '../../../lib/llmd/mockData'
import { Acronym } from './shared/PortalTooltip'
import { useOptionalStack } from '../../../contexts/StackContext'
import { useDemoMode } from '../../../hooks/useDemoMode'

type ViewMode = 'default' | 'horseshoe'

// Node positions for the flow diagram (coordinates in viewBox units)
const NODE_POSITIONS = {
  client: { x: 10, y: 50 },
  gateway: { x: 28, y: 50 },
  epp: { x: 48, y: 50 },
  prefill0: { x: 70, y: 18 },
  prefill1: { x: 70, y: 50 },
  prefill2: { x: 70, y: 82 },
  decode0: { x: 92, y: 34 },
  decode1: { x: 92, y: 66 },
}

// Node styling constants
const NODE_RADIUS = 6
const STROKE_WIDTH = 1.5
const TRACK_WIDTH = 1

// Connection between nodes
interface Connection {
  from: keyof typeof NODE_POSITIONS
  to: keyof typeof NODE_POSITIONS
  type: 'prefill' | 'decode' | 'kv-transfer'
  trafficPercent: number
}

const CONNECTIONS: Connection[] = [
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
const COLORS = {
  prefill: '#9333ea',
  decode: '#22c55e',
  'kv-transfer': '#06b6d4',
  gateway: '#3b82f6',
  epp: '#f59e0b',
}

// Get color based on load percentage
const getLoadColors = (load: number) => {
  if (load >= 90) return { start: '#ef4444', end: '#f87171', glow: '#ef4444' }
  if (load >= 70) return { start: '#f59e0b', end: '#fbbf24', glow: '#f59e0b' }
  if (load >= 50) return { start: '#eab308', end: '#facc15', glow: '#eab308' }
  return { start: '#22c55e', end: '#4ade80', glow: '#22c55e' }
}

// Premium gauge node with glowing arc
interface PremiumNodeProps {
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

function PremiumNode({ id, label, metrics, nodeColor, isSelected, onClick, uniqueId, nodePositions, isGhost }: PremiumNodeProps) {
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
function FlowConnection({
  connection,
  isAnimating,
  nodePositions,
}: {
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

// Color based on percentage for horseshoe
const getHorseshoeColor = (pct: number) => {
  if (pct >= 90) return '#ef4444'
  if (pct >= 70) return '#f59e0b'
  if (pct >= 50) return '#eab308'
  return '#22c55e'
}

// Horseshoe node for alternative view
interface HorseshoeFlowNodeProps {
  id: string
  label: string
  metrics?: ServerMetrics
  isSelected?: boolean
  onClick?: () => void
  uniqueId: string
  nodePositions: Record<string, { x: number; y: number }>
  isGhost?: boolean
}

function HorseshoeFlowNode({ id, label, metrics, isSelected, onClick, uniqueId, nodePositions, isGhost }: HorseshoeFlowNodeProps) {
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
function Sparkline({ data, color, width = 80, height = 24 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null

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
        cy={height - ((data[data.length - 1] - min) / range) * (height - 4) - 2}
        r="2"
        fill={color}
        filter="url(#sparkline-glow-line)"
      />
    </svg>
  )
}


type MetricType = 'load' | 'queue' | 'rps'

interface MetricsHistoryData {
  rps: number[]
  load: number[]
  queue: number[]
}

export function LLMdFlow() {
  const stackContext = useOptionalStack()
  const [serverMetrics, setServerMetrics] = useState<ServerMetrics[]>([])
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [isAnimating, setIsAnimating] = useState(true)
  const [metricsHistory, setMetricsHistory] = useState<Record<string, MetricsHistoryData>>({})
  const [selectedMetricTypes, setSelectedMetricTypes] = useState<MetricType[]>(['rps'])
  const [viewMode, setViewMode] = useState<ViewMode>('default')
  const uniqueId = useRef(`flow-${Math.random().toString(36).substr(2, 9)}`).current

  // Get selected stack from context and demo mode from global hook
  const selectedStack = stackContext?.selectedStack
  const { isDemoMode } = useDemoMode()

  // Build dynamic node positions based on actual stack topology
  const { nodePositions, connections, nodeLabels } = useMemo(() => {
    // Only show demo topology if demo mode is ON
    if (!selectedStack && isDemoMode) {
      return {
        nodePositions: NODE_POSITIONS,
        connections: CONNECTIONS,
        nodeLabels: {
          client: 'Clients',
          gateway: 'Gateway',
          epp: 'EPP',
          prefill0: 'Prefill-0',
          prefill1: 'Prefill-1',
          prefill2: 'Prefill-2',
          decode0: 'Decode-0',
          decode1: 'Decode-1',
        } as Record<string, string>,
      }
    }

    // In live mode with no stack selected, return empty state
    if (!selectedStack) {
      return {
        nodePositions: {} as Record<string, { x: number; y: number }>,
        connections: [] as Connection[],
        nodeLabels: {} as Record<string, string>,
      }
    }

    // Live topology from stack
    const prefillCount = selectedStack.components.prefill.reduce((sum, c) => sum + c.replicas, 0)
    const decodeCount = selectedStack.components.decode.reduce((sum, c) => sum + c.replicas, 0)
    const unifiedCount = selectedStack.components.both.reduce((sum, c) => sum + c.replicas, 0)
    const hasDisaggregation = prefillCount > 0 && decodeCount > 0

    // Debug: log component counts
    console.log('[LLMdFlow] Stack topology:', {
      stack: selectedStack.name,
      prefillCount,
      decodeCount,
      unifiedCount,
      hasDisaggregation,
      prefillComponents: selectedStack.components.prefill.length,
      decodeComponents: selectedStack.components.decode.length,
    })

    const positions: Record<string, { x: number; y: number }> = {
      client: { x: 10, y: 50 },
      gateway: { x: 28, y: 50 },
      epp: { x: 48, y: 50 },
    }

    const labels: Record<string, string> = {
      client: 'Clients',
      gateway: 'Gateway',
      epp: 'EPP',
    }

    const conns: Connection[] = [
      { from: 'client', to: 'gateway', type: 'prefill', trafficPercent: 100 },
      { from: 'gateway', to: 'epp', type: 'prefill', trafficPercent: 100 },
    ]

    if (hasDisaggregation) {
      // Disaggregated topology (both prefill AND decode)
      const maxPrefill = Math.min(prefillCount, 10) // Show up to 3 prefill
      const maxDecode = Math.min(decodeCount, 10)   // Show up to 2 decode

      // Position prefill nodes - spread from y=18 to y=82
      for (let i = 0; i < maxPrefill; i++) {
        const key = `prefill${i}`
        const y = maxPrefill === 1 ? 50 : 5 + (90 * i) / (maxPrefill - 1)
        positions[key] = { x: 70, y }
        labels[key] = `Prefill-${i}`
        conns.push({
          from: 'epp',
          to: key as keyof typeof NODE_POSITIONS,
          type: 'prefill',
          trafficPercent: Math.round(100 / maxPrefill),
        })
      }

      // Position decode nodes - spread from y=34 to y=66
      for (let i = 0; i < maxDecode; i++) {
        const key = `decode${i}`
        const y = maxDecode === 1 ? 50 : 34 + (32 * i) / (maxDecode - 1)
        positions[key] = { x: 92, y }
        labels[key] = `Decode-${i}`
        // Direct EPP to decode connections (for cached KV)
        conns.push({
          from: 'epp',
          to: key as keyof typeof NODE_POSITIONS,
          type: 'decode',
          trafficPercent: Math.round(20 / maxDecode),
        })
        // Prefill to decode connections
        for (let j = 0; j < maxPrefill; j++) {
          conns.push({
            from: `prefill${j}` as keyof typeof NODE_POSITIONS,
            to: key as keyof typeof NODE_POSITIONS,
            type: 'decode',
            trafficPercent: Math.round(100 / maxDecode),
          })
        }
      }
    } else if (decodeCount > 0) {
      // Decode-only topology - spread from y=18 to y=82
      const maxDecode = Math.min(decodeCount, 10)
      for (let i = 0; i < maxDecode; i++) {
        const key = `decode${i}`
        const y = maxDecode === 1 ? 50 : 5 + (90 * i) / (maxDecode - 1)
        positions[key] = { x: 78, y }
        labels[key] = `Decode-${i}`
        conns.push({
          from: 'epp',
          to: key as keyof typeof NODE_POSITIONS,
          type: 'decode',
          trafficPercent: Math.round(100 / maxDecode),
        })
      }
    } else if (prefillCount > 0) {
      // Prefill-only topology - spread from y=18 to y=82
      const maxPrefill = Math.min(prefillCount, 10)
      for (let i = 0; i < maxPrefill; i++) {
        const key = `prefill${i}`
        const y = maxPrefill === 1 ? 50 : 5 + (90 * i) / (maxPrefill - 1)
        positions[key] = { x: 78, y }
        labels[key] = `Prefill-${i}`
        conns.push({
          from: 'epp',
          to: key as keyof typeof NODE_POSITIONS,
          type: 'prefill',
          trafficPercent: Math.round(100 / maxPrefill),
        })
      }
    } else if (unifiedCount > 0) {
      // Unified serving topology - spread from y=18 to y=82
      const maxServers = Math.min(unifiedCount, 10)
      for (let i = 0; i < maxServers; i++) {
        const key = `server${i}`
        const y = maxServers === 1 ? 50 : 5 + (90 * i) / (maxServers - 1)
        positions[key] = { x: 78, y }
        labels[key] = `Server-${i}`
        conns.push({
          from: 'epp',
          to: key as keyof typeof NODE_POSITIONS,
          type: 'prefill',
          trafficPercent: Math.round(100 / maxServers),
        })
      }
    } else if (selectedStack.autoscaler) {
      // Scaled to 0 but has autoscaler - show ghost nodes
      const maxReplicas = selectedStack.autoscaler.maxReplicas || 3
      const ghostCount = Math.min(maxReplicas, 3) // Show up to 3 ghost nodes
      for (let i = 0; i < ghostCount; i++) {
        const key = `ghost${i}`
        const y = ghostCount === 1 ? 50 : 18 + (64 * i) / (ghostCount - 1)
        positions[key] = { x: 78, y }
        labels[key] = `(scaled to 0)`
        // Dashed connection to ghost node
        conns.push({
          from: 'epp',
          to: key as keyof typeof NODE_POSITIONS,
          type: 'prefill',
          trafficPercent: 0, // No traffic when scaled to 0
        })
      }
    }

    return { nodePositions: positions, connections: conns, nodeLabels: labels }
  }, [selectedStack, isDemoMode])

  // Toggle metric selection
  const toggleMetric = (metric: MetricType) => {
    setSelectedMetricTypes(prev => {
      if (prev.includes(metric)) {
        // Don't allow removing the last metric
        if (prev.length === 1) return prev
        return prev.filter(m => m !== metric)
      }
      return [...prev, metric]
    })
  }

  // Generate metrics based on stack data
  const generateLiveMetrics = useCallback((): ServerMetrics[] => {
    // Only show demo metrics if demo mode is ON
    if (!selectedStack && isDemoMode) {
      return generateServerMetrics()
    }
    // In live mode with no stack, return empty
    if (!selectedStack) {
      return []
    }

    const now = Date.now()
    const wave = Math.sin(now / 5000)
    const metrics: ServerMetrics[] = []

    // Gateway metrics
    if (selectedStack.components.gateway) {
      metrics.push({
        name: 'Istio Gateway',
        type: 'gateway',
        status: selectedStack.components.gateway.status === 'running' ? 'healthy' : 'unhealthy',
        load: Math.round(35 + wave * 10),
        queueDepth: Math.round(5 + Math.random() * 10),
        activeConnections: Math.round(120 + Math.random() * 30),
        throughputRps: Math.round(450 + wave * 50),
      })
    }

    // EPP metrics
    if (selectedStack.components.epp) {
      metrics.push({
        name: 'EPP Scheduler',
        type: 'epp',
        status: selectedStack.components.epp.status === 'running' ? 'healthy' : 'unhealthy',
        load: Math.round(45 + wave * 15),
        queueDepth: Math.round(8 + Math.random() * 12),
        activeConnections: Math.round(450 + Math.random() * 50),
        throughputRps: Math.round(448 + wave * 48),
      })
    }

    // Prefill metrics
    selectedStack.components.prefill.forEach((comp, i) => {
      const isHealthy = comp.readyReplicas > 0
      metrics.push({
        name: `Prefill-${i}`,
        type: 'prefill',
        status: isHealthy ? (wave > 0.3 ? 'healthy' : 'degraded') : 'unhealthy',
        load: Math.round((isHealthy ? 60 : 10) + wave * 20 + Math.random() * 10),
        queueDepth: Math.round(2 + Math.random() * 6),
        activeConnections: Math.round(100 + Math.random() * 20),
        throughputRps: Math.round((isHealthy ? 100 : 10) + wave * 15),
      })
    })

    // Decode metrics
    selectedStack.components.decode.forEach((comp, i) => {
      const isHealthy = comp.readyReplicas > 0
      metrics.push({
        name: `Decode-${i}`,
        type: 'decode',
        status: isHealthy ? 'healthy' : 'unhealthy',
        load: Math.round((isHealthy ? 50 : 5) + wave * 15),
        queueDepth: Math.round(1 + Math.random() * 3),
        activeConnections: Math.round(180 + Math.random() * 30),
        throughputRps: Math.round((isHealthy ? 180 : 10) + wave * 20),
      })
    })

    // Unified server metrics
    selectedStack.components.both.forEach((comp, i) => {
      const isHealthy = comp.readyReplicas > 0
      metrics.push({
        name: `Server-${i}`,
        type: 'prefill', // Unified servers do both
        status: isHealthy ? 'healthy' : 'unhealthy',
        load: Math.round((isHealthy ? 55 : 5) + wave * 18),
        queueDepth: Math.round(2 + Math.random() * 5),
        activeConnections: Math.round(150 + Math.random() * 25),
        throughputRps: Math.round((isHealthy ? 150 : 10) + wave * 18),
      })
    })

    return metrics
  }, [selectedStack, isDemoMode])

  // Update metrics periodically and track history for all metric types
  useEffect(() => {
    const updateMetrics = () => {
      const newMetrics = generateLiveMetrics()
      setServerMetrics(newMetrics)

      // Update history for each node and each metric type
      setMetricsHistory(prev => {
        const updated = { ...prev }
        newMetrics.forEach(m => {
          const key = m.name
          if (!updated[key]) {
            updated[key] = { rps: [], load: [], queue: [] }
          }
          updated[key] = {
            rps: [...updated[key].rps.slice(-19), m.throughputRps],
            load: [...updated[key].load.slice(-19), m.load],
            queue: [...updated[key].queue.slice(-19), m.queueDepth],
          }
        })
        return updated
      })
    }

    updateMetrics()
    const interval = setInterval(updateMetrics, 2000)
    return () => clearInterval(interval)
  }, [generateLiveMetrics])

  const getMetricsForNode = useCallback((nodeId: string): ServerMetrics | undefined => {
    // Dynamic name mapping based on node labels
    const name = nodeLabels[nodeId]
    if (!name) return undefined

    // Map node labels to metric names
    if (name === 'Gateway') return serverMetrics.find(m => m.name === 'Istio Gateway')
    if (name === 'EPP') return serverMetrics.find(m => m.name === 'EPP Scheduler')
    return serverMetrics.find(m => m.name === name)
  }, [serverMetrics, nodeLabels])

  const getHistoryForNode = useCallback((nodeId: string, metricType: MetricType): number[] => {
    const name = nodeLabels[nodeId]
    if (!name) return []

    // Map node labels to history keys
    let historyKey = name
    if (name === 'Gateway') historyKey = 'Istio Gateway'
    if (name === 'EPP') historyKey = 'EPP Scheduler'

    const history = metricsHistory[historyKey]
    if (!history) return []
    return history[metricType] || []
  }, [metricsHistory, nodeLabels])

  const totalThroughput = useMemo(() =>
    serverMetrics
      .filter(m => m.type === 'prefill' || m.type === 'decode')
      .reduce((sum, m) => sum + m.throughputRps, 0),
    [serverMetrics]
  )

  const avgLoad = useMemo(() => {
    const relevant = serverMetrics.filter(m => m.type === 'prefill' || m.type === 'decode')
    return relevant.length > 0
      ? Math.round(relevant.reduce((sum, m) => sum + m.load, 0) / relevant.length)
      : 0
  }, [serverMetrics])

  const selectedMetrics = selectedNode ? getMetricsForNode(selectedNode) : undefined

  // Get color for any node
  const getNodeColor = (nodeId: string | null) => {
    if (!nodeId) return COLORS.gateway
    if (nodeId.startsWith('prefill')) return COLORS.prefill
    if (nodeId.startsWith('decode')) return COLORS.decode
    if (nodeId.startsWith('server')) return COLORS.prefill  // Unified servers use prefill color
    if (nodeId === 'epp') return COLORS.epp
    if (nodeId === 'client' || nodeId === 'gateway') return COLORS.gateway
    return COLORS.gateway
  }

  const metricConfig: Record<MetricType, { label: string; color: string; unit: string }> = {
    load: { label: 'Load', color: '#f59e0b', unit: '%' },
    queue: { label: 'Queue', color: '#06b6d4', unit: '' },
    rps: { label: 'RPS', color: getNodeColor(selectedNode), unit: '' },
  }

  // Show empty state when no stack selected in live mode
  const showEmptyState = !selectedStack && !isDemoMode

  return (
    <div className="relative w-full h-full min-h-[300px] bg-gradient-to-br from-slate-900/50 to-slate-800/30 rounded-lg overflow-hidden">
      {/* Empty state overlay */}
      {showEmptyState && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-12 h-12 rounded-full border-2 border-slate-600 border-t-purple-500 animate-spin mb-4" />
          <span className="text-slate-400 text-sm">Select a stack to visualize</span>
          <span className="text-slate-500 text-xs mt-1">Use the stack selector above</span>
        </div>
      )}
      {/* Header */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          {/* Stack info */}
          {selectedStack && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className={`px-1.5 py-0.5 rounded font-medium truncate max-w-[100px] ${
                isDemoMode ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'
              }`}>
                {selectedStack.name}
              </span>
              <span className="text-slate-500">{selectedStack.cluster}</span>
              {/* Autoscaler indicator */}
              {selectedStack.autoscaler && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  selectedStack.autoscaler.type === 'WVA' ? 'bg-purple-500/20 text-purple-400' :
                  selectedStack.autoscaler.type === 'HPA' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-green-500/20 text-green-400'
                }`}>
                  {selectedStack.autoscaler.type}: {selectedStack.autoscaler.currentReplicas ?? 0}→{selectedStack.autoscaler.desiredReplicas ?? '?'}
                </span>
              )}
              {/* Scaled to 0 indicator */}
              {selectedStack.autoscaler && selectedStack.totalReplicas === 0 && (
                <span className="px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 text-[10px] italic">
                  ⏸ Scaled to 0
                </span>
              )}
              {isDemoMode && (
                <span className="px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px]">Demo</span>
              )}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Throughput:</span>
            <span className="text-white font-mono font-medium">{totalThroughput} <Acronym term="RPS" /></span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Avg Load:</span>
            <span className={`font-mono font-medium ${avgLoad > 70 ? 'text-amber-400' : 'text-green-400'}`}>
              {avgLoad}%
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === 'default' ? 'horseshoe' : 'default')}
            className={`px-2 py-1 rounded text-xs font-medium transition-all flex items-center gap-1 ${
              viewMode === 'horseshoe'
                ? 'bg-cyan-500/20 text-cyan-400 shadow-lg shadow-cyan-500/20'
                : 'bg-slate-700/50 text-slate-400'
            }`}
            title="Toggle horseshoe gauge view"
          >
            <CircleDot size={12} />
          </button>
          <button
            onClick={() => setIsAnimating(!isAnimating)}
            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
              isAnimating
                ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 shadow-lg shadow-purple-500/20'
                : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {isAnimating ? 'Pause' : 'Play'}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-2 left-3 flex items-center gap-4 text-xs z-10">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.prefill, boxShadow: `0 0 6px ${COLORS.prefill}` }} />
          <span className="text-muted-foreground">Prefill</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.decode, boxShadow: `0 0 6px ${COLORS.decode}` }} />
          <span className="text-muted-foreground">Decode</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS['kv-transfer'], boxShadow: `0 0 6px ${COLORS['kv-transfer']}` }} />
          <span className="text-muted-foreground"><Acronym term="KV" /> Transfer</span>
        </div>
      </div>

      {/* SVG Flow Diagram */}
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
        style={{ padding: '30px 5px 20px 5px' }}
      >
        {/* Connections - use dynamic connections */}
        {connections.map((conn, i) => (
          <FlowConnection
            key={`${conn.from}-${conn.to}-${i}`}
            connection={conn}
            isAnimating={isAnimating}
            nodePositions={nodePositions}
          />
        ))}

        {/* Nodes - render dynamically based on topology */}
        {viewMode === 'horseshoe' ? (
          <>
            {Object.keys(nodePositions).map(nodeId => (
              <HorseshoeFlowNode
                key={nodeId}
                id={nodeId}
                label={nodeLabels[nodeId] || nodeId}
                metrics={nodeId !== 'client' ? getMetricsForNode(nodeId) : undefined}
                isSelected={selectedNode === nodeId}
                onClick={() => setSelectedNode(selectedNode === nodeId ? null : nodeId)}
                uniqueId={uniqueId}
                nodePositions={nodePositions}
                isGhost={nodeId.startsWith('ghost')}
              />
            ))}
          </>
        ) : (
          <>
            {Object.keys(nodePositions).map(nodeId => (
              <PremiumNode
                key={nodeId}
                id={nodeId}
                label={nodeLabels[nodeId] || nodeId}
                metrics={nodeId !== 'client' ? getMetricsForNode(nodeId) : undefined}
                nodeColor={getNodeColor(nodeId)}
                isSelected={selectedNode === nodeId}
                onClick={() => setSelectedNode(selectedNode === nodeId ? null : nodeId)}
                uniqueId={uniqueId}
                nodePositions={nodePositions}
                isGhost={nodeId.startsWith('ghost')}
              />
            ))}
          </>
        )}
      </svg>

      {/* Selected node details panel - LEFT side with clickable metrics */}
      <AnimatePresence>
        {selectedNode && selectedMetrics && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="absolute top-10 left-3 w-56 bg-slate-900/95 backdrop-blur-sm rounded-xl p-4 border border-slate-700 shadow-xl"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-white font-semibold text-sm">
                {selectedMetrics.name}
              </h4>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                selectedMetrics.status === 'healthy' ? 'bg-green-500/20 text-green-400' :
                selectedMetrics.status === 'degraded' ? 'bg-amber-500/20 text-amber-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {selectedMetrics.status.charAt(0).toUpperCase() + selectedMetrics.status.slice(1)}
              </span>
            </div>

            {/* Clickable metrics - toggle to show time-series */}
            <div className="flex gap-1 mb-3">
              {(['load', 'queue', 'rps'] as MetricType[]).map(metric => (
                <button
                  key={metric}
                  onClick={() => toggleMetric(metric)}
                  className={`flex-1 px-2 py-1.5 rounded text-[10px] font-medium transition-all ${
                    selectedMetricTypes.includes(metric)
                      ? 'bg-slate-700 text-white ring-1 ring-slate-500'
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-[9px] text-slate-500 uppercase">{metricConfig[metric].label}</div>
                    <div className="font-mono" style={{ color: selectedMetricTypes.includes(metric) ? metricConfig[metric].color : undefined }}>
                      {metric === 'load' ? `${selectedMetrics.load}%` :
                       metric === 'queue' ? selectedMetrics.queueDepth :
                       selectedMetrics.throughputRps}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Time-series graphs - side by side based on selection */}
            <div className={`grid gap-2 ${
              selectedMetricTypes.length === 1 ? 'grid-cols-1' :
              selectedMetricTypes.length === 2 ? 'grid-cols-2' :
              'grid-cols-3'
            }`}>
              {selectedMetricTypes.map(metric => (
                <div key={metric} className="bg-slate-800/50 rounded-lg p-2">
                  <div className="text-[9px] text-muted-foreground mb-1 flex items-center gap-1">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: metricConfig[metric].color }}
                    />
                    {metricConfig[metric].label}
                  </div>
                  <Sparkline
                    data={getHistoryForNode(selectedNode, metric)}
                    color={metricConfig[metric].color}
                    width={selectedMetricTypes.length === 1 ? 180 : selectedMetricTypes.length === 2 ? 85 : 55}
                    height={35}
                  />
                </div>
              ))}
            </div>

            {/* Hint text */}
            <div className="text-[9px] text-slate-500 mt-2 text-center">
              Click metrics above to compare
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default LLMdFlow
