import { motion } from 'framer-motion'
import {
  L2_UDN_Y,
  L2_UDN_H,
  NS1_X,
  NS1_W,
  NS2_X,
  AGENT1_X,
  AGENT1_Y,
  AGENT1_W,
  AGENT1_H,
  AGENT2_X,
  AGENT2_Y,
  AGENT2_W,
  AGENT2_H,
  K3S_X,
  K3S_Y,
  K3S_W,
  K3S_H,
  L3_UDN_Y,
  KUBEFLEX_X,
  KUBEFLEX_Y,
  KUBEFLEX_W,
  KUBEFLEX_H,
  STATUS_DOT_RADIUS,
  FONT_SIZE_BADGE,
  FONT_SIZE_THROUGHPUT,
  BADGE_W,
  BADGE_H,
  BADGE_CORNER_RADIUS,
  PULSE_ANIMATION_DURATION_S,
  MAX_THROUGHPUT_BYTES_PER_SEC,
  FLOW_DURATION_MAX_S,
  FLOW_DURATION_MIN_S,
  PARTICLE_RADIUS_MIN,
  PARTICLE_RADIUS_MAX,
  THROUGHPUT_PILL_FULL_W,
  THROUGHPUT_PILL_H,
  THROUGHPUT_PILL_RX,
  L2_UDN_CONNECTION_COLOR,
  L3_UDN_CONNECTION_COLOR,
  DEFAULT_NET_CONNECTION_COLOR,
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

/** Bytes per kilobyte */
const BYTES_PER_KB = 1024
/** Bytes per megabyte */
const BYTES_PER_MB = 1024 * 1024

/**
 * Format a bytes-per-second value into a human-readable string.
 * Uses KB/s for most values, MB/s for very high throughput.
 */
export function formatBytesPerSec(bytesPerSec: number): string {
  if (bytesPerSec >= BYTES_PER_MB) return `${(bytesPerSec / BYTES_PER_MB).toFixed(1)} MB/s`
  if (bytesPerSec >= BYTES_PER_KB) return `${(bytesPerSec / BYTES_PER_KB).toFixed(1)} KB/s`
  return `${Math.round(bytesPerSec)} B/s`
}

/**
 * Calculate particle animation duration from throughput.
 * Higher throughput = shorter (faster) duration.
 */
export function getFlowDuration(throughputBytesPerSec: number): number {
  if (throughputBytesPerSec <= 0) return FLOW_DURATION_MAX_S
  const ratio = Math.min(throughputBytesPerSec / MAX_THROUGHPUT_BYTES_PER_SEC, 1)
  return FLOW_DURATION_MAX_S - ratio * (FLOW_DURATION_MAX_S - FLOW_DURATION_MIN_S)
}

/**
 * Calculate particle radius from throughput.
 * Higher throughput = bigger particle.
 */
export function getParticleRadius(throughputBytesPerSec: number): number {
  if (throughputBytesPerSec <= 0) return PARTICLE_RADIUS_MIN
  const ratio = Math.min(throughputBytesPerSec / MAX_THROUGHPUT_BYTES_PER_SEC, 1)
  return PARTICLE_RADIUS_MIN + ratio * (PARTICLE_RADIUS_MAX - PARTICLE_RADIUS_MIN)
}

// ============================================================================
// Connection Path Definitions
// ============================================================================

export interface ConnectionDef {
  id: string
  /** SVG path data */
  d: string
  /** Connection color */
  color: string
  /** Whether both endpoints are detected */
  active: boolean
  /** Label for the connection */
  label: string
  /** Combined rx+tx throughput in bytes/sec */
  throughputBytesPerSec: number
  /** Receive bytes/sec (ingress) */
  rxBytesPerSec: number
  /** Transmit bytes/sec (egress) */
  txBytesPerSec: number
  /** X position for ingress label (near source end) */
  rxLabelX: number
  /** Y position for ingress label */
  rxLabelY: number
  /** X position for egress label (near destination end) */
  txLabelX: number
  /** Y position for egress label */
  txLabelY: number
}

export interface ThroughputRates {
  kvEth0Rate: number
  kvEth1Rate: number
  k3sEth0Rate: number
  k3sEth1Rate: number
  kvEth0Rx: number
  kvEth0Tx: number
  kvEth1Rx: number
  kvEth1Tx: number
  k3sEth0Rx: number
  k3sEth0Tx: number
  k3sEth1Rx: number
  k3sEth1Tx: number
}

export function buildConnections(
  ovnDetected: boolean,
  kubeflexDetected: boolean,
  k3sDetected: boolean,
  kubevirtDetected: boolean,
  rates: ThroughputRates,
): ConnectionDef[] {
  /** Agent Pod 1 top center (eth1 -> L2 UDN) */
  const a1TopCx = AGENT1_X + AGENT1_W / 2
  const a1TopY = AGENT1_Y
  /** Agent Pod 1 bottom center (eth0 -> L3 UDN) */
  const a1BotCx = AGENT1_X + AGENT1_W / 2
  const a1BotY = AGENT1_Y + AGENT1_H

  /** Agent Pod 2 top center (eth1 -> L2 UDN) */
  const a2TopCx = AGENT2_X + AGENT2_W / 2
  const a2TopY = AGENT2_Y
  /** Agent Pod 2 bottom center (eth0 -> L3 UDN) */
  const a2BotCx = AGENT2_X + AGENT2_W / 2
  const a2BotY = AGENT2_Y + AGENT2_H

  /** K3s Server eth1 left side (-> L2 UDN) */
  const k3sLeftX = K3S_X
  const k3sLeftY = K3S_Y + K3S_H / 2

  /** Waypoint X for routing K3s eth1 connection around the pod (midpoint of gap between namespaces) */
  const K3S_ETH1_ROUTE_X = (NS1_X + NS1_W + NS2_X) / 2

  /** K3s Server eth0 top-right (-> Default k8s Network -> KubeFlex) */
  const k3sTopX = K3S_X + K3S_W - 10
  const k3sTopY = K3S_Y

  /** L2 UDN bottom edge */
  const l2BottomY = L2_UDN_Y + L2_UDN_H

  /** L3 UDN top edge */
  const l3TopY = L3_UDN_Y

  /** KubeFlex bottom center */
  const kfBotCx = KUBEFLEX_X + KUBEFLEX_W / 2
  const kfBotY = KUBEFLEX_Y + KUBEFLEX_H

  /** Midpoint Y for the vertical segment of the KubeFlex connection (between KubeFlex bottom and K3s top) */
  const KF_MID_Y = (kfBotY + k3sTopY) / 2

  /** Half the throughput for each agent pod (split equally) */
  const AGENT_THROUGHPUT_SPLIT = 2
  const halfKvEth0 = rates.kvEth0Rate / AGENT_THROUGHPUT_SPLIT
  const halfKvEth1 = rates.kvEth1Rate / AGENT_THROUGHPUT_SPLIT

  /** Offset for placing stacked rx/tx labels beside a vertical connection */
  const RX_TX_LABEL_OFFSET_X = 10

  return [
    {
      // Agent Pod 1 eth1 -> L2 UDN (green, bidirectional)
      id: 'a1-eth1-l2',
      d: `M ${a1TopCx} ${a1TopY} L ${a1TopCx} ${l2BottomY}`,
      color: L2_UDN_CONNECTION_COLOR,
      active: kubevirtDetected && ovnDetected,
      label: 'eth1',
      throughputBytesPerSec: halfKvEth1,
      rxBytesPerSec: rates.kvEth1Rx / AGENT_THROUGHPUT_SPLIT,
      txBytesPerSec: rates.kvEth1Tx / AGENT_THROUGHPUT_SPLIT,
      rxLabelX: a1TopCx + RX_TX_LABEL_OFFSET_X,
      rxLabelY: (a1TopY + l2BottomY) / 2 - 4,
      txLabelX: a1TopCx + RX_TX_LABEL_OFFSET_X,
      txLabelY: (a1TopY + l2BottomY) / 2 + 1 },
    {
      // Agent Pod 2 eth1 -> L2 UDN (green, bidirectional)
      id: 'a2-eth1-l2',
      d: `M ${a2TopCx} ${a2TopY} L ${a2TopCx} ${l2BottomY}`,
      color: L2_UDN_CONNECTION_COLOR,
      active: kubevirtDetected && ovnDetected,
      label: 'eth1',
      throughputBytesPerSec: halfKvEth1,
      rxBytesPerSec: rates.kvEth1Rx / AGENT_THROUGHPUT_SPLIT,
      txBytesPerSec: rates.kvEth1Tx / AGENT_THROUGHPUT_SPLIT,
      rxLabelX: a2TopCx + RX_TX_LABEL_OFFSET_X,
      rxLabelY: (a2TopY + l2BottomY) / 2 - 4,
      txLabelX: a2TopCx + RX_TX_LABEL_OFFSET_X,
      txLabelY: (a2TopY + l2BottomY) / 2 + 1 },
    {
      // Agent Pod 1 eth0 -> L3 UDN (blue, bidirectional)
      id: 'a1-eth0-l3',
      d: `M ${a1BotCx} ${a1BotY} L ${a1BotCx} ${l3TopY}`,
      color: L3_UDN_CONNECTION_COLOR,
      active: kubevirtDetected && ovnDetected,
      label: 'eth0',
      throughputBytesPerSec: halfKvEth0,
      rxBytesPerSec: rates.kvEth0Rx / AGENT_THROUGHPUT_SPLIT,
      txBytesPerSec: rates.kvEth0Tx / AGENT_THROUGHPUT_SPLIT,
      rxLabelX: a1BotCx + RX_TX_LABEL_OFFSET_X,
      rxLabelY: (a1BotY + l3TopY) / 2 - 4,
      txLabelX: a1BotCx + RX_TX_LABEL_OFFSET_X,
      txLabelY: (a1BotY + l3TopY) / 2 + 1 },
    {
      // Agent Pod 2 eth0 -> L3 UDN (blue, bidirectional)
      id: 'a2-eth0-l3',
      d: `M ${a2BotCx} ${a2BotY} L ${a2BotCx} ${l3TopY}`,
      color: L3_UDN_CONNECTION_COLOR,
      active: kubevirtDetected && ovnDetected,
      label: 'eth0',
      throughputBytesPerSec: halfKvEth0,
      rxBytesPerSec: rates.kvEth0Rx / AGENT_THROUGHPUT_SPLIT,
      txBytesPerSec: rates.kvEth0Tx / AGENT_THROUGHPUT_SPLIT,
      rxLabelX: a2BotCx + RX_TX_LABEL_OFFSET_X,
      rxLabelY: (a2BotY + l3TopY) / 2 - 4,
      txLabelX: a2BotCx + RX_TX_LABEL_OFFSET_X,
      txLabelY: (a2BotY + l3TopY) / 2 + 1 },
    {
      // K3s Server eth1 -> L2 UDN (green, bidirectional)
      // Route LEFT from the pod to the gap between namespaces, then UP to the UDN
      // to avoid the connection cutting through the K3s Server Pod
      id: 'k3s-eth1-l2',
      d: `M ${k3sLeftX} ${k3sLeftY} L ${K3S_ETH1_ROUTE_X} ${k3sLeftY} L ${K3S_ETH1_ROUTE_X} ${l2BottomY}`,
      color: L2_UDN_CONNECTION_COLOR,
      active: k3sDetected && ovnDetected,
      label: 'eth1',
      throughputBytesPerSec: rates.k3sEth1Rate,
      rxBytesPerSec: rates.k3sEth1Rx,
      txBytesPerSec: rates.k3sEth1Tx,
      rxLabelX: k3sLeftX - THROUGHPUT_PILL_FULL_W - 1,
      rxLabelY: k3sLeftY - 5,
      txLabelX: k3sLeftX - THROUGHPUT_PILL_FULL_W - 1,
      txLabelY: k3sLeftY + 1 },
    {
      // K3s Server eth0 -> Default k8s Network -> KubeFlex (dark blue, bidirectional)
      id: 'k3s-eth0-kf',
      d: `M ${k3sTopX} ${k3sTopY} L ${kfBotCx} ${k3sTopY} L ${kfBotCx} ${kfBotY}`,
      color: DEFAULT_NET_CONNECTION_COLOR,
      active: k3sDetected && kubeflexDetected,
      label: 'eth0',
      throughputBytesPerSec: rates.k3sEth0Rate,
      rxBytesPerSec: rates.k3sEth0Rx,
      txBytesPerSec: rates.k3sEth0Tx,
      rxLabelX: kfBotCx + 3,
      rxLabelY: KF_MID_Y - 3,
      txLabelX: kfBotCx + 3,
      txLabelY: KF_MID_Y + 2 },
  ]
}

// ============================================================================
// Sub-Components
// ============================================================================

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

// ============================================================================
// Main Component
// ============================================================================
