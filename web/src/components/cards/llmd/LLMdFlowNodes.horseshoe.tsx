import { motion } from 'framer-motion'
import type { ServerMetrics } from '../../../lib/llmd/mockData'
import { getHorseshoeColor } from './shared/colorUtils'

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
