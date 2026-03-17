/**
 * Tenant Architecture Topology
 *
 * Premium SVG topology card showing the KubeCon multi-tenancy architecture
 * diagram as a live, interactive visualization. Renders one tenant's complete
 * stack: K3s Agent Pods (KubeVirt), K3s Server Pod, Layer-2/Layer-3 UDN networks,
 * and the KubeFlex controller, with animated bidirectional connection paths and
 * live status indicators driven by real hook data.
 *
 * Updated to match Braulio's architecture diagram:
 * - Two K3s Agent Pods (KubeVirt) in namespace-1
 * - K3s Server Pod in namespace-2
 * - KubeFlex Controller at top-right (outside tenant boundary)
 * - All network traffic is bidirectional
 * - Default k8s Network between namespace-2 and KubeFlex
 *
 * Network throughput data drives:
 * - Particle animation speed (faster = higher throughput)
 * - Particle size (bigger = higher throughput)
 * - Throughput labels on each connection (e.g., "15.0 KB/s")
 *
 * Follows the LLMdFlow.tsx SVG pattern: viewBox coordinates, framer-motion
 * animations, and named constants for all positions/sizes/colors.
 */
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useCardLoadingState } from '../../CardDataContext'
import { useTenantTopology } from './useTenantTopology'
import { DEMO_TENANT_TOPOLOGY } from './demoData'

// ============================================================================
// SVG ViewBox & Layout Constants
// ============================================================================

/** ViewBox dimensions for landscape topology */
const VIEWBOX_WIDTH = 240
const VIEWBOX_HEIGHT = 160

// ============================================================================
// Node Position Constants (viewBox units)
// ============================================================================

/** Outer tenant boundary (dashed) */
const TENANT_X = 3
const TENANT_Y = 12
const TENANT_W = 185
const TENANT_H = 145

/** Layer-2 Cluster UDN (Secondary) — top zone inside tenant */
const L2_UDN_X = 20
const L2_UDN_Y = 18
const L2_UDN_W = 145
const L2_UDN_H = 20

/** Namespace-1 container (holds two K3s Agent Pods) */
const NS1_X = 10
const NS1_Y = 44
const NS1_W = 100
const NS1_H = 70

/** Namespace-2 container (holds K3s Server Pod) */
const NS2_X = 120
const NS2_Y = 44
const NS2_W = 60
const NS2_H = 70

/** K3s Agent Pod 1 (KubeVirt) — left pod in namespace-1 */
const AGENT1_X = 17
const AGENT1_Y = 58
const AGENT1_W = 40
const AGENT1_H = 40

/** K3s Agent Pod 2 (KubeVirt) — right pod in namespace-1 */
const AGENT2_X = 63
const AGENT2_Y = 58
const AGENT2_W = 40
const AGENT2_H = 40

/** K3s Server Pod — in namespace-2 */
const K3S_X = 127
const K3S_Y = 58
const K3S_W = 46
const K3S_H = 40

/** Layer-3 UDN (Primary) — bottom zone */
const L3_UDN_X = 10
const L3_UDN_Y = 125
const L3_UDN_W = 100
const L3_UDN_H = 16

/** KubeFlex Controller node — top-right, outside tenant boundary */
const KUBEFLEX_X = 193
const KUBEFLEX_Y = 3
const KUBEFLEX_W = 44
const KUBEFLEX_H = 16

/** "Default k8s Network" label — right side between namespace-2 and KubeFlex */
const DEFAULT_NET_LABEL_X = 178
const DEFAULT_NET_LABEL_Y = 48

// ============================================================================
// Styling Constants
// ============================================================================

/** Rounded corner radius for nodes */
const NODE_CORNER_RADIUS = 3

/** Rounded corner radius for zone containers */
const ZONE_CORNER_RADIUS = 4

/** Stroke width for node borders */
const NODE_STROKE_WIDTH = 0.8

/** Stroke width for zone borders */
const ZONE_STROKE_WIDTH = 0.6

/** Stroke width for connection lines */
const CONNECTION_STROKE_WIDTH = 1

/** Status dot radius */
const STATUS_DOT_RADIUS = 2

/** Status dot offset from node top-right corner */
const STATUS_DOT_OFFSET_X = 4
const STATUS_DOT_OFFSET_Y = 4

/** Font sizes in viewBox units */
const FONT_SIZE_TITLE = 3.5
const FONT_SIZE_LABEL = 3.0
const FONT_SIZE_BADGE = 2.3
const FONT_SIZE_LEGEND = 2.6
const FONT_SIZE_TENANT = 4.5
/** Font size for throughput labels on connections */
const FONT_SIZE_THROUGHPUT = 2.2
/** Font size for sub-labels (e.g., "(Kubevirt)") */
const FONT_SIZE_SUBLABEL = 2.3

/** Interface badge dimensions */
const BADGE_W = 10
const BADGE_H = 4.5
const BADGE_CORNER_RADIUS = 1.5

/** Animation duration for pulse effect (seconds) */
const PULSE_ANIMATION_DURATION_S = 2

/** Dash array for undetected/dashed connections */
const DASHED_PATTERN = '2,2'

// ============================================================================
// Throughput Animation Constants
// ============================================================================

/** Maximum throughput (bytes/sec) that maps to fastest animation / largest particle.
 *  Values above this cap are treated the same. 100 KB/s combined rx+tx. */
const MAX_THROUGHPUT_BYTES_PER_SEC = 102400

/** Slowest particle animation duration when throughput is near zero (seconds) */
const FLOW_DURATION_MAX_S = 3.5

/** Fastest particle animation duration at MAX_THROUGHPUT (seconds) */
const FLOW_DURATION_MIN_S = 0.8

/** Minimum particle radius (viewBox units) for low throughput */
const PARTICLE_RADIUS_MIN = 0.8

/** Maximum particle radius (viewBox units) for high throughput */
const PARTICLE_RADIUS_MAX = 2.0

/** Throughput label pill dimensions */
const THROUGHPUT_PILL_W = 18
const THROUGHPUT_PILL_H = 4
const THROUGHPUT_PILL_RX = 1.5

// ============================================================================
// Color Constants
// ============================================================================

/** Layer-2 UDN (secondary) — green/lime theme */
const L2_UDN_FILL = 'rgba(74, 222, 128, 0.08)'
const L2_UDN_STROKE = 'rgba(74, 222, 128, 0.5)'
const L2_UDN_CONNECTION_COLOR = '#4ade80'

/** Layer-3 UDN (primary) — blue theme */
const L3_UDN_FILL = 'rgba(96, 165, 250, 0.08)'
const L3_UDN_STROKE = 'rgba(96, 165, 250, 0.5)'
const L3_UDN_CONNECTION_COLOR = '#60a5fa'

/** KubeFlex controller — dark blue/teal theme */
const KUBEFLEX_FILL = 'rgba(20, 80, 120, 0.9)'
const KUBEFLEX_STROKE = 'rgba(59, 130, 246, 0.6)'

/** Default K8s network — dark blue theme (matches Braulio's diagram) */
const DEFAULT_NET_CONNECTION_COLOR = '#1e4a6e'

/** Component node fill */
const NODE_FILL = 'rgba(30, 41, 59, 0.8)'
const NODE_STROKE = 'rgba(100, 116, 139, 0.4)'
const NODE_FILL_INACTIVE = 'rgba(30, 41, 59, 0.3)'
const NODE_STROKE_INACTIVE = 'rgba(100, 116, 139, 0.2)'

/** Namespace container styling */
const NS_FILL = 'rgba(148, 163, 184, 0.03)'
const NS_STROKE = 'rgba(148, 163, 184, 0.2)'

/** Tenant outer border */
const TENANT_STROKE = 'rgba(96, 165, 250, 0.4)'

/** Status dot colors */
const STATUS_HEALTHY = '#22c55e'
const STATUS_UNHEALTHY = '#ef4444'
const STATUS_UNKNOWN = '#6b7280'

/** Text colors */
const TEXT_PRIMARY = 'rgba(248, 250, 252, 0.9)'
const TEXT_SECONDARY = 'rgba(148, 163, 184, 0.8)'
const TEXT_MUTED = 'rgba(148, 163, 184, 0.5)'

/** Throughput label background */
const THROUGHPUT_PILL_FILL = 'rgba(15, 23, 42, 0.85)'
const THROUGHPUT_PILL_STROKE = 'rgba(100, 116, 139, 0.25)'

/** Interface badge colors matching Braulio's diagram */
const ETH0_BADGE_FILL = 'rgba(30, 41, 59, 0.9)'
const ETH1_BADGE_FILL = 'rgba(34, 90, 50, 0.9)'
const ETH1_BADGE_STROKE = 'rgba(74, 222, 128, 0.4)'

// ============================================================================
// Throughput Helpers
// ============================================================================

/** Bytes per kilobyte */
const BYTES_PER_KB = 1024
/** Bytes per megabyte */
const BYTES_PER_MB = 1024 * 1024

/**
 * Format a bytes-per-second value into a human-readable string.
 * Uses KB/s for most values, MB/s for very high throughput.
 */
function formatBytesPerSec(bytesPerSec: number): string {
  if (bytesPerSec >= BYTES_PER_MB) return `${(bytesPerSec / BYTES_PER_MB).toFixed(1)} MB/s`
  if (bytesPerSec >= BYTES_PER_KB) return `${(bytesPerSec / BYTES_PER_KB).toFixed(1)} KB/s`
  return `${Math.round(bytesPerSec)} B/s`
}

/**
 * Calculate particle animation duration from throughput.
 * Higher throughput = shorter (faster) duration.
 */
function getFlowDuration(throughputBytesPerSec: number): number {
  if (throughputBytesPerSec <= 0) return FLOW_DURATION_MAX_S
  const ratio = Math.min(throughputBytesPerSec / MAX_THROUGHPUT_BYTES_PER_SEC, 1)
  return FLOW_DURATION_MAX_S - ratio * (FLOW_DURATION_MAX_S - FLOW_DURATION_MIN_S)
}

/**
 * Calculate particle radius from throughput.
 * Higher throughput = bigger particle.
 */
function getParticleRadius(throughputBytesPerSec: number): number {
  if (throughputBytesPerSec <= 0) return PARTICLE_RADIUS_MIN
  const ratio = Math.min(throughputBytesPerSec / MAX_THROUGHPUT_BYTES_PER_SEC, 1)
  return PARTICLE_RADIUS_MIN + ratio * (PARTICLE_RADIUS_MAX - PARTICLE_RADIUS_MIN)
}

// ============================================================================
// Connection Path Definitions
// ============================================================================

interface ConnectionDef {
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

interface ThroughputRates {
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

function buildConnections(
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

  /** Half the throughput for each agent pod (split equally) */
  const AGENT_THROUGHPUT_SPLIT = 2
  const halfKvEth0 = rates.kvEth0Rate / AGENT_THROUGHPUT_SPLIT
  const halfKvEth1 = rates.kvEth1Rate / AGENT_THROUGHPUT_SPLIT

  /** Offset for placing rx/tx labels on opposite sides of a vertical connection */
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
      txLabelY: (a1TopY + l2BottomY) / 2 + 1,
    },
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
      txLabelY: (a2TopY + l2BottomY) / 2 + 1,
    },
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
      txLabelY: (a1BotY + l3TopY) / 2 + 1,
    },
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
      txLabelY: (a2BotY + l3TopY) / 2 + 1,
    },
    {
      // K3s Server eth1 -> L2 UDN (green, bidirectional)
      id: 'k3s-eth1-l2',
      d: `M ${k3sLeftX} ${k3sLeftY} L ${L2_UDN_X + L2_UDN_W - 5} ${k3sLeftY} L ${L2_UDN_X + L2_UDN_W - 5} ${l2BottomY}`,
      color: L2_UDN_CONNECTION_COLOR,
      active: k3sDetected && ovnDetected,
      label: 'eth1',
      throughputBytesPerSec: rates.k3sEth1Rate,
      rxBytesPerSec: rates.k3sEth1Rx,
      txBytesPerSec: rates.k3sEth1Tx,
      rxLabelX: k3sLeftX - THROUGHPUT_PILL_W - 2,
      rxLabelY: k3sLeftY - 5,
      txLabelX: k3sLeftX - THROUGHPUT_PILL_W - 2,
      txLabelY: k3sLeftY + 1,
    },
    {
      // K3s Server eth0 -> Default k8s Network -> KubeFlex (dark blue, bidirectional)
      id: 'k3s-eth0-kf',
      d: `M ${k3sTopX} ${k3sTopY} L ${k3sTopX} ${kfBotY + 15} L ${kfBotCx} ${kfBotY + 15} L ${kfBotCx} ${kfBotY}`,
      color: DEFAULT_NET_CONNECTION_COLOR,
      active: k3sDetected && kubeflexDetected,
      label: 'eth0',
      throughputBytesPerSec: rates.k3sEth0Rate,
      rxBytesPerSec: rates.k3sEth0Rx,
      txBytesPerSec: rates.k3sEth0Tx,
      rxLabelX: k3sTopX + 2,
      rxLabelY: kfBotY + 12,
      txLabelX: kfBotCx + 3,
      txLabelY: kfBotY + 12,
    },
  ]
}

// ============================================================================
// Sub-Components
// ============================================================================

/** Animated flow particle along a connection path, sized and paced by throughput */
function FlowParticle({
  pathId,
  color,
  active,
  throughputBytesPerSec,
}: {
  pathId: string
  color: string
  active: boolean
  throughputBytesPerSec: number
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
        filter="url(#glow)"
        initial={{ offsetDistance: '0%' }}
        animate={{ offsetDistance: '100%' }}
        transition={{
          duration,
          repeat: Infinity,
          ease: 'linear',
        }}
        style={{
          offsetPath: `url(#${pathId})`,
        }}
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
        filter="url(#glow)"
        initial={{ offsetDistance: '100%' }}
        animate={{ offsetDistance: '0%' }}
        transition={{
          duration: duration * 1.15,
          repeat: Infinity,
          ease: 'linear',
          delay: duration * 0.4,
        }}
        style={{
          offsetPath: `url(#${pathId})`,
        }}
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
function ThroughputLabel({
  x,
  y,
  bytesPerSec,
  color,
  active,
  prefix,
}: {
  x: number
  y: number
  bytesPerSec: number
  color: string
  active: boolean
  prefix?: 'rx' | 'tx'
}) {
  if (!active || bytesPerSec <= 0) return null

  /** Extra width for the rx/tx prefix arrow */
  const PILL_W_WITH_PREFIX = THROUGHPUT_PILL_W + 4
  const arrow = prefix === 'rx' ? '\u2193' : '\u2191'
  const label = `${arrow} ${formatBytesPerSec(bytesPerSec)}`

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={PILL_W_WITH_PREFIX}
        height={THROUGHPUT_PILL_H}
        rx={THROUGHPUT_PILL_RX}
        fill={THROUGHPUT_PILL_FILL}
        stroke={THROUGHPUT_PILL_STROKE}
        strokeWidth={0.3}
      />
      <text
        x={x + PILL_W_WITH_PREFIX / 2}
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
function StatusDot({ x, y, detected, healthy }: { x: number; y: number; detected: boolean; healthy: boolean }) {
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
function InterfaceBadge({ x, y, label, isEth1 }: { x: number; y: number; label: string; isEth1?: boolean }) {
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

function K8sIcon({ x, y, size }: { x: number; y: number; size: number }) {
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

export function TenantTopology() {
  const { t } = useTranslation('cards')

  const liveData = useTenantTopology()

  // Use demo data when all hooks return no detection
  const data = useMemo(
    () => (liveData.isDemoData ? DEMO_TENANT_TOPOLOGY : liveData),
    [liveData],
  )

  useCardLoadingState({
    isLoading: data.isLoading,
    hasAnyData: true,
    isDemoData: data.isDemoData,
  })

  const connections = useMemo(
    () =>
      buildConnections(
        data.ovnDetected,
        data.kubeflexDetected,
        data.k3sDetected,
        data.kubevirtDetected,
        {
          kvEth0Rate: data.kvEth0Rate,
          kvEth1Rate: data.kvEth1Rate,
          k3sEth0Rate: data.k3sEth0Rate,
          k3sEth1Rate: data.k3sEth1Rate,
          kvEth0Rx: data.kvEth0Rx,
          kvEth0Tx: data.kvEth0Tx,
          kvEth1Rx: data.kvEth1Rx,
          kvEth1Tx: data.kvEth1Tx,
          k3sEth0Rx: data.k3sEth0Rx,
          k3sEth0Tx: data.k3sEth0Tx,
          k3sEth1Rx: data.k3sEth1Rx,
          k3sEth1Tx: data.k3sEth1Tx,
        },
      ),
    [
      data.ovnDetected, data.kubeflexDetected, data.k3sDetected, data.kubevirtDetected,
      data.kvEth0Rate, data.kvEth1Rate, data.k3sEth0Rate, data.k3sEth1Rate,
      data.kvEth0Rx, data.kvEth0Tx, data.kvEth1Rx, data.kvEth1Tx,
      data.k3sEth0Rx, data.k3sEth0Tx, data.k3sEth1Rx, data.k3sEth1Tx,
    ],
  )

  return (
    <div className="w-full h-full min-h-[280px]">
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* SVG Definitions: gradients, filters, path references */}
        <defs>
          {/* Glow filter for animated particles */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Subtle shadow for nodes */}
          <filter id="nodeShadow" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="0.5" stdDeviation="1" floodColor="rgba(0,0,0,0.3)" />
          </filter>

          {/* Connection path references for offset-path animation */}
          {(connections || []).map((conn) => (
            <path key={conn.id} id={conn.id} d={conn.d} fill="none" />
          ))}

          {/* Arrowhead markers for bidirectional connections */}
          <marker id="arrowBlue" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
            <path d="M 0 0 L 4 2 L 0 4 Z" fill={L3_UDN_CONNECTION_COLOR} opacity={0.7} />
          </marker>
          <marker id="arrowBlueReverse" markerWidth="4" markerHeight="4" refX="1" refY="2" orient="auto-start-reverse">
            <path d="M 0 0 L 4 2 L 0 4 Z" fill={L3_UDN_CONNECTION_COLOR} opacity={0.7} />
          </marker>

          <marker id="arrowGreen" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
            <path d="M 0 0 L 4 2 L 0 4 Z" fill={L2_UDN_CONNECTION_COLOR} opacity={0.7} />
          </marker>
          <marker id="arrowGreenReverse" markerWidth="4" markerHeight="4" refX="1" refY="2" orient="auto-start-reverse">
            <path d="M 0 0 L 4 2 L 0 4 Z" fill={L2_UDN_CONNECTION_COLOR} opacity={0.7} />
          </marker>

          <marker id="arrowDark" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
            <path d="M 0 0 L 4 2 L 0 4 Z" fill={DEFAULT_NET_CONNECTION_COLOR} opacity={0.7} />
          </marker>
          <marker id="arrowDarkReverse" markerWidth="4" markerHeight="4" refX="1" refY="2" orient="auto-start-reverse">
            <path d="M 0 0 L 4 2 L 0 4 Z" fill={DEFAULT_NET_CONNECTION_COLOR} opacity={0.7} />
          </marker>
        </defs>

        {/* ================================================================
            Layer 0: Tenant outer boundary (blue dashed)
            ================================================================ */}
        <rect
          x={TENANT_X}
          y={TENANT_Y}
          width={TENANT_W}
          height={TENANT_H}
          rx={ZONE_CORNER_RADIUS}
          fill="none"
          stroke={TENANT_STROKE}
          strokeWidth={1}
          strokeDasharray="4,2"
        />
        {/* Tenant label with K8s icon */}
        <K8sIcon x={TENANT_X + 3} y={TENANT_Y + 2} size={6} />
        <text
          x={TENANT_X + 11}
          y={TENANT_Y + 6.5}
          fill={TEXT_PRIMARY}
          fontSize={FONT_SIZE_TENANT}
          fontWeight="600"
        >
          {t('tenantTopology.tenantLabel', 'Tenant 1')}
        </text>

        {/* ================================================================
            Layer 1: Zone backgrounds
            ================================================================ */}

        {/* Layer-2 Cluster UDN (Secondary) — green zone at top */}
        <motion.rect
          x={L2_UDN_X}
          y={L2_UDN_Y}
          width={L2_UDN_W}
          height={L2_UDN_H}
          rx={ZONE_CORNER_RADIUS}
          fill={data.ovnDetected ? L2_UDN_FILL : 'transparent'}
          stroke={data.ovnDetected ? L2_UDN_STROKE : NS_STROKE}
          strokeWidth={ZONE_STROKE_WIDTH}
          strokeDasharray={data.ovnDetected ? 'none' : DASHED_PATTERN}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        />
        <text
          x={L2_UDN_X + L2_UDN_W / 2}
          y={L2_UDN_Y + 8}
          textAnchor="middle"
          fill={data.ovnDetected ? L2_UDN_CONNECTION_COLOR : TEXT_MUTED}
          fontSize={FONT_SIZE_LABEL}
          fontWeight="500"
        >
          {t('tenantTopology.l2Udn', 'Layer-2 Cluster UDN (Secondary)')}
        </text>
        <text
          x={L2_UDN_X + L2_UDN_W / 2}
          y={L2_UDN_Y + 14}
          textAnchor="middle"
          fill={TEXT_MUTED}
          fontSize={FONT_SIZE_BADGE}
        >
          {t('tenantTopology.l2Namespaces', '(namespace-1 & namespace-2)')}
        </text>

        {/* Namespace-1 container */}
        <rect
          x={NS1_X}
          y={NS1_Y}
          width={NS1_W}
          height={NS1_H}
          rx={ZONE_CORNER_RADIUS}
          fill={NS_FILL}
          stroke={NS_STROKE}
          strokeWidth={ZONE_STROKE_WIDTH}
        />
        <text
          x={NS1_X + 4}
          y={NS1_Y + 5}
          fill={TEXT_PRIMARY}
          fontSize={FONT_SIZE_LABEL}
          fontWeight="600"
        >
          {t('tenantTopology.namespace1', 'namespace-1')}
        </text>

        {/* Namespace-2 container */}
        <rect
          x={NS2_X}
          y={NS2_Y}
          width={NS2_W}
          height={NS2_H}
          rx={ZONE_CORNER_RADIUS}
          fill={NS_FILL}
          stroke={NS_STROKE}
          strokeWidth={ZONE_STROKE_WIDTH}
        />
        <text
          x={NS2_X + 4}
          y={NS2_Y + 5}
          fill={TEXT_PRIMARY}
          fontSize={FONT_SIZE_LABEL}
          fontWeight="600"
        >
          {t('tenantTopology.namespace2', 'namespace-2')}
        </text>

        {/* Layer-3 UDN (Primary) — blue zone at bottom */}
        <motion.rect
          x={L3_UDN_X}
          y={L3_UDN_Y}
          width={L3_UDN_W}
          height={L3_UDN_H}
          rx={ZONE_CORNER_RADIUS}
          fill={data.ovnDetected ? L3_UDN_FILL : 'transparent'}
          stroke={data.ovnDetected ? L3_UDN_STROKE : NS_STROKE}
          strokeWidth={ZONE_STROKE_WIDTH}
          strokeDasharray={data.ovnDetected ? 'none' : DASHED_PATTERN}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        />
        <text
          x={L3_UDN_X + L3_UDN_W / 2}
          y={L3_UDN_Y + 10}
          textAnchor="middle"
          fill={data.ovnDetected ? L3_UDN_CONNECTION_COLOR : TEXT_MUTED}
          fontSize={FONT_SIZE_LABEL}
          fontWeight="500"
        >
          {t('tenantTopology.l3Udn', 'Layer-3 UDN (Primary)')}
        </text>

        {/* "Default k8s Network" label — right side */}
        <text
          x={DEFAULT_NET_LABEL_X}
          y={DEFAULT_NET_LABEL_Y}
          fill={DEFAULT_NET_CONNECTION_COLOR}
          fontSize={FONT_SIZE_LABEL}
          fontStyle="italic"
        >
          {t('tenantTopology.defaultNet', 'Default k8s Network')}
        </text>

        {/* ================================================================
            Layer 2: Connection lines (all bidirectional)
            ================================================================ */}
        {(connections || []).map((conn) => {
          const isGreen = conn.color === L2_UDN_CONNECTION_COLOR
          const isBlue = conn.color === L3_UDN_CONNECTION_COLOR
          const markerEnd = isGreen ? 'url(#arrowGreen)' : isBlue ? 'url(#arrowBlue)' : 'url(#arrowDark)'
          const markerStart = isGreen ? 'url(#arrowGreenReverse)' : isBlue ? 'url(#arrowBlueReverse)' : 'url(#arrowDarkReverse)'

          return (
            <motion.path
              key={conn.id}
              d={conn.d}
              fill="none"
              stroke={conn.active ? conn.color : TEXT_MUTED}
              strokeWidth={CONNECTION_STROKE_WIDTH}
              strokeDasharray={conn.active ? 'none' : DASHED_PATTERN}
              markerEnd={conn.active ? markerEnd : undefined}
              markerStart={conn.active ? markerStart : undefined}
              opacity={conn.active ? 0.6 : 0.25}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: conn.active ? 0.6 : 0.25 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          )
        })}

        {/* Animated bidirectional flow particles on active connections */}
        {(connections || []).map((conn) => (
          <FlowParticle
            key={`particle-${conn.id}`}
            pathId={conn.id}
            color={conn.color}
            active={conn.active}
            throughputBytesPerSec={conn.throughputBytesPerSec}
          />
        ))}

        {/* Ingress (rx) throughput labels */}
        {(connections || []).map((conn) => (
          <ThroughputLabel
            key={`rx-${conn.id}`}
            x={conn.rxLabelX}
            y={conn.rxLabelY}
            bytesPerSec={conn.rxBytesPerSec}
            color={conn.color}
            active={conn.active}
            prefix="rx"
          />
        ))}

        {/* Egress (tx) throughput labels */}
        {(connections || []).map((conn) => (
          <ThroughputLabel
            key={`tx-${conn.id}`}
            x={conn.txLabelX}
            y={conn.txLabelY}
            bytesPerSec={conn.txBytesPerSec}
            color={conn.color}
            active={conn.active}
            prefix="tx"
          />
        ))}

        {/* ================================================================
            Layer 3: Component nodes
            ================================================================ */}

        {/* K3s Agent Pod 1 (KubeVirt) */}
        <motion.g
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <rect
            x={AGENT1_X}
            y={AGENT1_Y}
            width={AGENT1_W}
            height={AGENT1_H}
            rx={NODE_CORNER_RADIUS}
            fill={data.kubevirtDetected ? NODE_FILL : NODE_FILL_INACTIVE}
            stroke={data.kubevirtDetected ? NODE_STROKE : NODE_STROKE_INACTIVE}
            strokeWidth={NODE_STROKE_WIDTH}
            strokeDasharray={data.kubevirtDetected ? 'none' : DASHED_PATTERN}
            filter="url(#nodeShadow)"
          />
          {/* eth1 badge at top */}
          <InterfaceBadge x={AGENT1_X + AGENT1_W / 2 - BADGE_W / 2} y={AGENT1_Y + 2} label="eth1" isEth1 />
          <text
            x={AGENT1_X + AGENT1_W / 2}
            y={AGENT1_Y + 16}
            textAnchor="middle"
            fill={data.kubevirtDetected ? TEXT_PRIMARY : TEXT_MUTED}
            fontSize={FONT_SIZE_TITLE}
            fontWeight="600"
          >
            K3s Agent Pod
          </text>
          <text
            x={AGENT1_X + AGENT1_W / 2}
            y={AGENT1_Y + 22}
            textAnchor="middle"
            fill={TEXT_MUTED}
            fontSize={FONT_SIZE_SUBLABEL}
          >
            (Kubevirt)
          </text>
          {/* eth0 badge at bottom */}
          <InterfaceBadge x={AGENT1_X + AGENT1_W / 2 - BADGE_W / 2} y={AGENT1_Y + AGENT1_H - 8} label="eth0" />
          <StatusDot
            x={AGENT1_X + AGENT1_W - STATUS_DOT_OFFSET_X}
            y={AGENT1_Y + STATUS_DOT_OFFSET_Y}
            detected={data.kubevirtDetected}
            healthy={data.kubevirtHealthy}
          />
        </motion.g>

        {/* K3s Agent Pod 2 (KubeVirt) */}
        <motion.g
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
        >
          <rect
            x={AGENT2_X}
            y={AGENT2_Y}
            width={AGENT2_W}
            height={AGENT2_H}
            rx={NODE_CORNER_RADIUS}
            fill={data.kubevirtDetected ? NODE_FILL : NODE_FILL_INACTIVE}
            stroke={data.kubevirtDetected ? NODE_STROKE : NODE_STROKE_INACTIVE}
            strokeWidth={NODE_STROKE_WIDTH}
            strokeDasharray={data.kubevirtDetected ? 'none' : DASHED_PATTERN}
            filter="url(#nodeShadow)"
          />
          {/* eth1 badge at top */}
          <InterfaceBadge x={AGENT2_X + AGENT2_W / 2 - BADGE_W / 2} y={AGENT2_Y + 2} label="eth1" isEth1 />
          <text
            x={AGENT2_X + AGENT2_W / 2}
            y={AGENT2_Y + 16}
            textAnchor="middle"
            fill={data.kubevirtDetected ? TEXT_PRIMARY : TEXT_MUTED}
            fontSize={FONT_SIZE_TITLE}
            fontWeight="600"
          >
            K3s Agent Pod
          </text>
          <text
            x={AGENT2_X + AGENT2_W / 2}
            y={AGENT2_Y + 22}
            textAnchor="middle"
            fill={TEXT_MUTED}
            fontSize={FONT_SIZE_SUBLABEL}
            fontWeight="600"
          >
            (KubeVirt)
          </text>
          {/* eth0 badge at bottom */}
          <InterfaceBadge x={AGENT2_X + AGENT2_W / 2 - BADGE_W / 2} y={AGENT2_Y + AGENT2_H - 8} label="eth0" />
          <StatusDot
            x={AGENT2_X + AGENT2_W - STATUS_DOT_OFFSET_X}
            y={AGENT2_Y + STATUS_DOT_OFFSET_Y}
            detected={data.kubevirtDetected}
            healthy={data.kubevirtHealthy}
          />
        </motion.g>

        {/* K3s Server Pod */}
        <motion.g
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <rect
            x={K3S_X}
            y={K3S_Y}
            width={K3S_W}
            height={K3S_H}
            rx={NODE_CORNER_RADIUS}
            fill={data.k3sDetected ? NODE_FILL : NODE_FILL_INACTIVE}
            stroke={data.k3sDetected ? NODE_STROKE : NODE_STROKE_INACTIVE}
            strokeWidth={NODE_STROKE_WIDTH}
            strokeDasharray={data.k3sDetected ? 'none' : DASHED_PATTERN}
            filter="url(#nodeShadow)"
          />
          {/* eth0 badge at top-right */}
          <InterfaceBadge x={K3S_X + K3S_W - BADGE_W - 4} y={K3S_Y + 2} label="eth0" />
          {/* eth1 badge at left side */}
          <InterfaceBadge x={K3S_X + 2} y={K3S_Y + K3S_H / 2 - BADGE_H / 2} label="eth1" isEth1 />
          <text
            x={K3S_X + K3S_W / 2}
            y={K3S_Y + 20}
            textAnchor="middle"
            fill={data.k3sDetected ? TEXT_PRIMARY : TEXT_MUTED}
            fontSize={FONT_SIZE_TITLE}
            fontWeight="600"
          >
            {t('tenantTopology.k3sPod', 'K3s Server Pod')}
          </text>
          <StatusDot
            x={K3S_X + K3S_W - STATUS_DOT_OFFSET_X}
            y={K3S_Y + STATUS_DOT_OFFSET_Y}
            detected={data.k3sDetected}
            healthy={data.k3sHealthy}
          />
        </motion.g>

        {/* KubeFlex Controller (top-right, outside tenant) */}
        <motion.g
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <rect
            x={KUBEFLEX_X}
            y={KUBEFLEX_Y}
            width={KUBEFLEX_W}
            height={KUBEFLEX_H}
            rx={NODE_CORNER_RADIUS}
            fill={data.kubeflexDetected ? KUBEFLEX_FILL : NODE_FILL_INACTIVE}
            stroke={data.kubeflexDetected ? KUBEFLEX_STROKE : NODE_STROKE_INACTIVE}
            strokeWidth={NODE_STROKE_WIDTH}
            strokeDasharray={data.kubeflexDetected ? 'none' : DASHED_PATTERN}
            filter="url(#nodeShadow)"
          />
          <text
            x={KUBEFLEX_X + KUBEFLEX_W / 2}
            y={KUBEFLEX_Y + 10}
            textAnchor="middle"
            fill={data.kubeflexDetected ? TEXT_PRIMARY : TEXT_MUTED}
            fontSize={FONT_SIZE_TITLE}
            fontWeight="700"
          >
            {t('tenantTopology.kubeflexController', 'KubeFlex Controller')}
          </text>
          <StatusDot
            x={KUBEFLEX_X + KUBEFLEX_W - STATUS_DOT_OFFSET_X}
            y={KUBEFLEX_Y + STATUS_DOT_OFFSET_Y}
            detected={data.kubeflexDetected}
            healthy={data.kubeflexHealthy}
          />
        </motion.g>

        {/* OVN status dot on L2 UDN zone */}
        <StatusDot
          x={L2_UDN_X + L2_UDN_W - STATUS_DOT_OFFSET_X}
          y={L2_UDN_Y + STATUS_DOT_OFFSET_Y}
          detected={data.ovnDetected}
          healthy={data.ovnHealthy}
        />

        {/* OVN status dot on L3 UDN zone */}
        <StatusDot
          x={L3_UDN_X + L3_UDN_W - STATUS_DOT_OFFSET_X}
          y={L3_UDN_Y + STATUS_DOT_OFFSET_Y}
          detected={data.ovnDetected}
          healthy={data.ovnHealthy}
        />

        {/* ================================================================
            Layer 4: Legend (bottom-right)
            ================================================================ */}
        <g>
          {/* Legend background */}
          <rect
            x={L3_UDN_X + L3_UDN_W + 10}
            y={L3_UDN_Y}
            width={70}
            height={16}
            rx={2}
            fill="rgba(15, 23, 42, 0.7)"
            stroke="rgba(100, 116, 139, 0.15)"
            strokeWidth={0.3}
          />
          {/* Blue — Primary UDN: data-plane traffic */}
          <circle cx={L3_UDN_X + L3_UDN_W + 15} cy={L3_UDN_Y + 5} r={1.5} fill={L3_UDN_CONNECTION_COLOR} />
          <text
            x={L3_UDN_X + L3_UDN_W + 19}
            y={L3_UDN_Y + 6.5}
            fill={TEXT_SECONDARY}
            fontSize={FONT_SIZE_LEGEND}
          >
            {t('tenantTopology.legendPrimary', 'Primary UDN: data-plane traffic')}
          </text>
          {/* Green — Secondary UDN: control-plane traffic */}
          <circle cx={L3_UDN_X + L3_UDN_W + 15} cy={L3_UDN_Y + 11} r={1.5} fill={L2_UDN_CONNECTION_COLOR} />
          <text
            x={L3_UDN_X + L3_UDN_W + 19}
            y={L3_UDN_Y + 12.5}
            fill={TEXT_SECONDARY}
            fontSize={FONT_SIZE_LEGEND}
          >
            {t('tenantTopology.legendSecondary', 'Secondary UDN: control-plane traffic')}
          </text>
        </g>
      </svg>
    </div>
  )
}
