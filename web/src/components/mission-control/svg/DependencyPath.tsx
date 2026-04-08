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
  /** Vertical offset to avoid overlapping nearby labels */
  labelOffsetY?: number
  /** Whether to show flowing particle animation */
  animate?: boolean
  /** Whether this path is highlighted (label hovered) */
  highlight?: boolean
  /** Whether something else is glowing and this path should fade */
  dimmed?: boolean
  /** Whether overlay filtering is active (reduces opacity) */
  overlayDim?: boolean
}

/** Compute the bezier midpoint for a dependency edge — used for label placement */
export function computeEdgeMidpoint(fromX: number, fromY: number, toX: number, toY: number) {
  const dx = toX - fromX
  const dy = toY - fromY
  const horizontalBend = Math.abs(dx) < 3 ? 15 : 0
  const cpOffset = Math.min(Math.max(Math.abs(dx), Math.abs(dy)) * 0.25, 60)
  const cp1x = fromX + dx * 0.25 + horizontalBend
  const cp1y = fromY - cpOffset
  const cp2x = fromX + dx * 0.75 - horizontalBend
  const cp2y = toY - cpOffset
  return {
    midX: (fromX + 3 * cp1x + 3 * cp2x + toX) / 8,
    midY: (fromY + 3 * cp1y + 3 * cp2y + toY) / 8,
  }
}

export function DependencyPath({
  id,
  fromX,
  fromY,
  toX,
  toY,
  crossCluster,
  index,
  animate: showParticle = true,
  highlight = false,
  dimmed = false,
  overlayDim = false,
}: DependencyPathProps) {
  // Calculate bezier control points for a nice curve
  const dx = toX - fromX
  const dy = toY - fromY

  // For near-vertical lines, add a horizontal bend so the gradient renders
  // (purely vertical paths collapse the horizontal linearGradient to zero width)
  const horizontalBend = Math.abs(dx) < 3 ? 15 : 0

  // Cap the offset to prevent extreme curves that go off-screen
  const cpOffset = Math.min(Math.max(Math.abs(dx), Math.abs(dy)) * 0.25, 60)

  // If roughly horizontal, curve vertically; if vertical, curve horizontally
  const cp1x = fromX + dx * 0.25 + horizontalBend
  const cp1y = fromY - cpOffset
  const cp2x = fromX + dx * 0.75 - horizontalBend
  const cp2y = toY - cpOffset

  const pathD = `M ${fromX} ${fromY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${toX} ${toY}`
  const pathId = `${id}-dep-path-${index}`
  const gradientRef = crossCluster ? `url(#${id}-cross-dep)` : `url(#${id}-intra-dep)`
  const particleColor = crossCluster ? '#f97316' : '#818cf8'

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: dimmed ? 0.1 : overlayDim ? 0.35 : 1 }}
      transition={{ opacity: { duration: 0.1 }, delay: 0.8 + index * 0.1 }}
    >
      {/* Path definition for animateMotion */}
      <path id={pathId} d={pathD} fill="none" stroke="none" />

      {/* Visible path */}
      <motion.path
        d={pathD}
        fill="none"
        stroke={gradientRef}
        strokeWidth={highlight ? 1.5 : crossCluster ? 0.6 : 0.3}
        strokeOpacity={highlight ? 1 : crossCluster ? 0.6 : 0.4}
        filter={highlight ? 'url(#glow)' : undefined}
        strokeDasharray={crossCluster ? 'none' : '3 2'}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, delay: 0.8 + index * 0.1, ease: 'easeOut' }}
      />

      {/* Flowing particle */}
      {showParticle && (
        <circle r={crossCluster ? 1.5 : 1} fill={particleColor} opacity={0.7}>
          <animateMotion
            dur={`${3 + index * 0.5}s`}
            repeatCount="indefinite"
            begin={`${0.8 + index * 0.1}s`}
          >
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </circle>
      )}
    </motion.g>
  )
}

/** Label pill rendered in a separate top layer so it's never hidden behind lines */
export function DependencyLabel({ midX, midY, label, crossCluster, fromName, toName, anchorX, anchorY, onHover, highlight, dimmed, overlayDim }: {
  midX: number; midY: number; label: string; crossCluster: boolean
  fromName?: string; toName?: string
  anchorX?: number; anchorY?: number
  onHover?: (edge: { from: string; to: string } | null) => void
  highlight?: boolean
  dimmed?: boolean
  overlayDim?: boolean
}) {
  const tooltip = [
    label,
    fromName && toName ? `${fromName} → ${toName}` : '',
    crossCluster ? 'Cross-cluster dependency' : 'Intra-cluster dependency',
  ].filter(Boolean).join('\n')

  const lineColor = crossCluster ? '#f97316' : '#6366f1'
  const showConnector = anchorX != null && anchorY != null &&
    (Math.abs(midX - anchorX) > 2 || Math.abs(midY - anchorY) > 2)

  return (
    <g
      style={{ cursor: 'pointer', transition: 'opacity 0.1s' }}
      opacity={dimmed ? 0.15 : overlayDim ? 0.35 : 1}
      onMouseEnter={() => fromName && toName && onHover?.({ from: fromName, to: toName })}
      onMouseLeave={() => onHover?.(null)}
    >
      <title>{tooltip}</title>
      {/* Connector line from label back to its path */}
      {showConnector && (
        <line
          x1={midX} y1={midY}
          x2={anchorX} y2={anchorY}
          stroke={lineColor}
          strokeWidth={0.3}
          strokeOpacity={0.5}
          strokeDasharray="2 1"
        />
      )}
      <rect
        x={midX - label.length * 1.8}
        y={midY - 4.5}
        width={label.length * 3.6}
        height={9}
        rx={3}
        fill={highlight ? '#1e293b' : '#0f172a'}
        stroke={highlight ? '#ffffff' : lineColor}
        strokeWidth={highlight ? 0.6 : 0.3}
        strokeOpacity={highlight ? 0.9 : 0.5}
      />
      <text
        x={midX}
        y={midY + 1}
        textAnchor="middle"
        fill={crossCluster ? '#fdba74' : '#a5b4fc'}
        fontSize={4.5}
        fontFamily="system-ui, sans-serif"
        fontWeight="500"
      >
        {label}
      </text>
    </g>
  )
}
