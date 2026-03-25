/**
 * DependencyPath — Curved SVG path between project nodes with animated particles.
 * Shows optional label at midpoint describing the integration.
 */

import { motion } from 'framer-motion'

interface DependencyPathProps {
  id: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  crossCluster: boolean
  index: number
  /** Short label describing the connection (e.g., "TLS certs", "metrics") */
  label?: string
}

export function DependencyPath({
  id,
  fromX,
  fromY,
  toX,
  toY,
  crossCluster,
  index,
  label,
}: DependencyPathProps) {
  // Calculate bezier control points for a nice curve
  const dx = toX - fromX
  const dy = toY - fromY
  // Cap the offset to prevent extreme curves that go off-screen
  const cpOffset = Math.min(Math.max(Math.abs(dx), Math.abs(dy)) * 0.25, 60)

  // If roughly horizontal, curve vertically; if vertical, curve horizontally
  const cp1x = fromX + dx * 0.25
  const cp1y = fromY - cpOffset
  const cp2x = fromX + dx * 0.75
  const cp2y = toY - cpOffset

  const pathD = `M ${fromX} ${fromY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${toX} ${toY}`
  const pathId = `${id}-dep-path-${index}`
  const gradientRef = crossCluster ? `url(#${id}-cross-dep)` : `url(#${id}-intra-dep)`

  // Midpoint of the bezier (approximate) for label placement
  const midX = (fromX + 3 * cp1x + 3 * cp2x + toX) / 8
  const midY = (fromY + 3 * cp1y + 3 * cp2y + toY) / 8

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.8 + index * 0.1 }}
    >
      {/* Path definition for animateMotion */}
      <path id={pathId} d={pathD} fill="none" stroke="none" />

      {/* Visible path */}
      <motion.path
        d={pathD}
        fill="none"
        stroke={gradientRef}
        strokeWidth={crossCluster ? 1.2 : 0.8}
        strokeDasharray={crossCluster ? 'none' : '3 2'}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, delay: 0.8 + index * 0.1, ease: 'easeOut' }}
      />

      {/* Connection label */}
      {label && (
        <g>
          {/* Background pill for readability */}
          <rect
            x={midX - label.length * 1.3}
            y={midY - 3.5}
            width={label.length * 2.6}
            height={6}
            rx={2.5}
            fill="#0f172a"
            fillOpacity={0.95}
            stroke={crossCluster ? '#f97316' : '#6366f1'}
            strokeWidth={0.3}
            strokeOpacity={0.4}
          />
          <text
            x={midX}
            y={midY + 0.5}
            textAnchor="middle"
            fill={crossCluster ? '#fdba74' : '#a5b4fc'}
            fontSize={2.8}
            fontFamily="system-ui, sans-serif"
            fontWeight="500"
          >
            {label}
          </text>
        </g>
      )}

      {/* Animated particle */}
      <circle r={crossCluster ? 2 : 1.5} fill={`url(#${id}-particle)`}>
        <animateMotion
          dur={crossCluster ? '2.5s' : '2s'}
          repeatCount="indefinite"
          begin={`${index * 0.3}s`}
        >
          <mpath href={`#${pathId}`} />
        </animateMotion>
      </circle>

      {/* Second particle for cross-cluster deps (more visible) */}
      {crossCluster && (
        <circle r={1.5} fill={`url(#${id}-particle)`} opacity={0.6}>
          <animateMotion
            dur="2.5s"
            repeatCount="indefinite"
            begin={`${index * 0.3 + 1.2}s`}
          >
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </circle>
      )}
    </motion.g>
  )
}
