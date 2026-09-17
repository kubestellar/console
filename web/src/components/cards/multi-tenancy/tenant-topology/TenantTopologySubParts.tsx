/**
 * Tenant Topology — Presentational Sub-Components
 *
 * Small SVG building blocks (animated particles, throughput labels, status
 * dots, interface badges, and the K8s icon) shared by the topology layers.
 */
import { motion } from 'framer-motion'
import {
  STATUS_DOT_RADIUS,
  FONT_SIZE_BADGE,
  FONT_SIZE_THROUGHPUT,
  BADGE_W,
  BADGE_H,
  BADGE_CORNER_RADIUS,
  PULSE_ANIMATION_DURATION_S,
  THROUGHPUT_PILL_FULL_W,
  THROUGHPUT_PILL_H,
  THROUGHPUT_PILL_RX,
  L2_UDN_CONNECTION_COLOR,
  STATUS_HEALTHY,
  STATUS_UNHEALTHY,
  STATUS_UNKNOWN,
  TEXT_SECONDARY,
  THROUGHPUT_PILL_FILL,
  THROUGHPUT_PILL_STROKE,
  ETH0_BADGE_FILL,
  ETH1_BADGE_FILL,
  ETH1_BADGE_STROKE,
} from './tenantTopology.constants'
import { formatBytesPerSec, getFlowDuration, getParticleRadius } from './TenantTopologyConnections'

/** Animated flow particle along a connection path, sized and paced by throughput */
export function FlowParticle({
  pathId,
  color,
  active,
  throughputBytesPerSec,
  idPrefix }: {
  pathId: string
  color: string
  active: boolean
  throughputBytesPerSec: number
  idPrefix: string
}) {
  if (!active) return null

  const duration = getFlowDuration(throughputBytesPerSec)
  const radius = getParticleRadius(throughputBytesPerSec)

  return (
    <>
      {/* Forward particle */}
      <motion.circle
        r={radius}
        fill={color}
        filter={`url(#${idPrefix}-glow)`}
        initial={{ offsetDistance: '0%' }}
        animate={{ offsetDistance: '100%' }}
        transition={{
          duration,
          repeat: Infinity,
          ease: 'linear' }}
        style={{
          offsetPath: `url(#${pathId})` }}
      >
        <animate
          attributeName="opacity"
          values="0;1;1;0"
          dur={`${duration}s`}
          repeatCount="indefinite"
        />
      </motion.circle>
      {/* Reverse particle (bidirectional) */}
      <motion.circle
        r={radius}
        fill={color}
        filter={`url(#${idPrefix}-glow)`}
        initial={{ offsetDistance: '100%' }}
        animate={{ offsetDistance: '0%' }}
        transition={{
          duration: duration * 1.15,
          repeat: Infinity,
          ease: 'linear',
          delay: duration * 0.4 }}
        style={{
          offsetPath: `url(#${pathId})` }}
      >
        <animate
          attributeName="opacity"
          values="0;1;1;0"
          dur={`${duration * 1.15}s`}
          repeatCount="indefinite"
        />
      </motion.circle>
    </>
  )
}

/** Throughput label pill with rx/tx prefix displayed near a connection */
export function ThroughputLabel({
  x,
  y,
  bytesPerSec,
  color,
  active,
  prefix }: {
  x: number
  y: number
  bytesPerSec: number
  color: string
  active: boolean
  prefix: 'rx' | 'tx'
}) {
  if (!active || bytesPerSec <= 0) return null

  const arrow = prefix === 'rx' ? '\u2193' : '\u2191'
  const label = `${arrow} ${formatBytesPerSec(bytesPerSec)}`

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={THROUGHPUT_PILL_FULL_W}
        height={THROUGHPUT_PILL_H}
        rx={THROUGHPUT_PILL_RX}
        fill={THROUGHPUT_PILL_FILL}
        stroke={THROUGHPUT_PILL_STROKE}
        strokeWidth={0.3}
      />
      <text
        x={x + THROUGHPUT_PILL_FULL_W / 2}
        y={y + THROUGHPUT_PILL_H / 2 + 0.8}
        textAnchor="middle"
        fill={color}
        fontSize={FONT_SIZE_THROUGHPUT}
        fontFamily="monospace"
        opacity={0.9}
      >
        {label}
      </text>
    </g>
  )
}

/** Status indicator dot on a component node */
export function StatusDot({ x, y, detected, healthy }: { x: number; y: number; detected: boolean; healthy: boolean }) {
  const fill = !detected ? STATUS_UNKNOWN : healthy ? STATUS_HEALTHY : STATUS_UNHEALTHY
  return (
    <motion.circle
      cx={x}
      cy={y}
      r={STATUS_DOT_RADIUS}
      fill={fill}
      animate={
        detected && healthy
          ? { opacity: [1, 0.5, 1] }
          : { opacity: 1 }
      }
      transition={
        detected && healthy
          ? { duration: PULSE_ANIMATION_DURATION_S, repeat: Infinity, ease: 'easeInOut' }
          : undefined
      }
    />
  )
}

/** Interface badge (eth0/eth1 labels on nodes) */
export function InterfaceBadge({ x, y, label, isEth1 }: { x: number; y: number; label: string; isEth1?: boolean }) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={BADGE_W}
        height={BADGE_H}
        rx={BADGE_CORNER_RADIUS}
        fill={isEth1 ? ETH1_BADGE_FILL : ETH0_BADGE_FILL}
        stroke={isEth1 ? ETH1_BADGE_STROKE : 'rgba(100, 116, 139, 0.3)'}
        strokeWidth={0.4}
      />
      <text
        x={x + BADGE_W / 2}
        y={y + BADGE_H / 2 + 0.8}
        textAnchor="middle"
        fill={isEth1 ? L2_UDN_CONNECTION_COLOR : TEXT_SECONDARY}
        fontSize={FONT_SIZE_BADGE}
        fontFamily="monospace"
      >
        {label}
      </text>
    </g>
  )
}

// ============================================================================
// Kubernetes SVG Icon (simplified helm wheel)
// ============================================================================

export function K8sIcon({ x, y, size }: { x: number; y: number; size: number }) {
  const cx = x + size / 2
  const cy = y + size / 2
  const r = size / 2
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={TEXT_SECONDARY} strokeWidth={0.4} />
      {/* 7 spokes of the K8s wheel */}
      {Array.from({ length: 7 }).map((_, i) => {
        /** Angle in radians for each spoke (7-spoke wheel, offset by -90 deg) */
        const SPOKE_COUNT = 7
        const angle = (i * 2 * Math.PI) / SPOKE_COUNT - Math.PI / 2
        /** Inner radius for spoke start */
        const SPOKE_INNER_RATIO = 0.3
        /** Outer radius for spoke end */
        const SPOKE_OUTER_RATIO = 0.85
        return (
          <line
            key={i}
            x1={cx + Math.cos(angle) * r * SPOKE_INNER_RATIO}
            y1={cy + Math.sin(angle) * r * SPOKE_INNER_RATIO}
            x2={cx + Math.cos(angle) * r * SPOKE_OUTER_RATIO}
            y2={cy + Math.sin(angle) * r * SPOKE_OUTER_RATIO}
            stroke={TEXT_SECONDARY}
            strokeWidth={0.3}
          />
        )
      })}
    </g>
  )
}
