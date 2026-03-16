/**
 * Tenant Architecture Topology
 *
 * Premium SVG topology card showing the KubeCon multi-tenancy architecture
 * diagram as a live, interactive visualization. Renders one tenant's complete
 * stack: KubeVirt pods, K3s server pods, Layer-2/Layer-3 UDN networks, and
 * the KubeFlex controller, with animated connection paths and live status
 * indicators driven by real hook data.
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
const VIEWBOX_WIDTH = 200
const VIEWBOX_HEIGHT = 140

// ============================================================================
// Node Position Constants (viewBox units)
// ============================================================================

/** Outer tenant boundary */
const TENANT_X = 3
const TENANT_Y = 3
const TENANT_W = 194
const TENANT_H = 134

/** Layer-2 Cluster UDN (Secondary) — top zone */
const L2_UDN_X = 30
const L2_UDN_Y = 8
const L2_UDN_W = 140
const L2_UDN_H = 22

/** Namespace-1 container (holds KubeVirt Pod) */
const NS1_X = 15
const NS1_Y = 35
const NS1_W = 70
const NS1_H = 55

/** Namespace-2 container (holds K3s Server Pod) */
const NS2_X = 115
const NS2_Y = 35
const NS2_W = 70
const NS2_H = 55

/** KubeVirt Pod node */
const KUBEVIRT_X = 25
const KUBEVIRT_Y = 45
const KUBEVIRT_W = 50
const KUBEVIRT_H = 30

/** K3s Server Pod node */
const K3S_X = 125
const K3S_Y = 45
const K3S_W = 50
const K3S_H = 30

/** Layer-3 UDN (Primary) — bottom-left zone */
const L3_UDN_X = 10
const L3_UDN_Y = 103
const L3_UDN_W = 75
const L3_UDN_H = 18

/** Default K8s Network label — bottom-center */
const DEFAULT_NET_X = 100
const DEFAULT_NET_Y = 103
const DEFAULT_NET_W = 50
const DEFAULT_NET_H = 18

/** KubeFlex Controller node — bottom-right */
const KUBEFLEX_X = 120
const KUBEFLEX_Y = 125
const KUBEFLEX_W = 60
const KUBEFLEX_H = 14

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
const FONT_SIZE_TITLE = 4
const FONT_SIZE_LABEL = 3.2
const FONT_SIZE_BADGE = 2.5
const FONT_SIZE_LEGEND = 2.8
const FONT_SIZE_TENANT = 5

/** Interface badge dimensions */
const BADGE_W = 12
const BADGE_H = 5
const BADGE_CORNER_RADIUS = 1.5

/** Animation duration for flow particles (seconds) */
const FLOW_ANIMATION_DURATION_S = 2.5

/** Animation duration for pulse effect (seconds) */
const PULSE_ANIMATION_DURATION_S = 2

/** Dash array for undetected/dashed connections */
const DASHED_PATTERN = '2,2'

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

/** KubeFlex controller — dark blue theme */
const KUBEFLEX_FILL = 'rgba(59, 130, 246, 0.15)'
const KUBEFLEX_STROKE = 'rgba(59, 130, 246, 0.6)'

/** Default K8s network — gray theme */
const DEFAULT_NET_FILL = 'rgba(148, 163, 184, 0.08)'
const DEFAULT_NET_STROKE = 'rgba(148, 163, 184, 0.4)'
const DEFAULT_NET_CONNECTION_COLOR = '#94a3b8'

/** Component node fill */
const NODE_FILL = 'rgba(30, 41, 59, 0.8)'
const NODE_STROKE = 'rgba(100, 116, 139, 0.4)'
const NODE_FILL_INACTIVE = 'rgba(30, 41, 59, 0.3)'
const NODE_STROKE_INACTIVE = 'rgba(100, 116, 139, 0.2)'

/** Namespace container styling */
const NS_FILL = 'rgba(148, 163, 184, 0.03)'
const NS_STROKE = 'rgba(148, 163, 184, 0.2)'

/** Tenant outer border */
const TENANT_STROKE = 'rgba(148, 163, 184, 0.15)'

/** Status dot colors */
const STATUS_HEALTHY = '#22c55e'
const STATUS_UNHEALTHY = '#ef4444'
const STATUS_UNKNOWN = '#6b7280'

/** Text colors */
const TEXT_PRIMARY = 'rgba(248, 250, 252, 0.9)'
const TEXT_SECONDARY = 'rgba(148, 163, 184, 0.8)'
const TEXT_MUTED = 'rgba(148, 163, 184, 0.5)'

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
}

function buildConnections(
  ovnDetected: boolean,
  kubeflexDetected: boolean,
  k3sDetected: boolean,
  kubevirtDetected: boolean,
): ConnectionDef[] {
  /** Center X of KubeVirt pod */
  const kvCx = KUBEVIRT_X + KUBEVIRT_W / 2
  /** Bottom Y of KubeVirt pod */
  const kvBy = KUBEVIRT_Y + KUBEVIRT_H
  /** Right X of KubeVirt pod */
  const kvRx = KUBEVIRT_X + KUBEVIRT_W

  /** Center X of K3s pod */
  const k3sCx = K3S_X + K3S_W / 2
  /** Bottom Y of K3s pod */
  const k3sBy = K3S_Y + K3S_H

  /** Center X of L3 UDN */
  const l3Cx = L3_UDN_X + L3_UDN_W / 2
  /** Top Y of L3 UDN */
  const l3Ty = L3_UDN_Y

  /** Center X of L2 UDN */
  const l2Cx = L2_UDN_X + L2_UDN_W / 2
  /** Bottom Y of L2 UDN */
  const l2By = L2_UDN_Y + L2_UDN_H

  /** Center X of default net */
  const defCx = DEFAULT_NET_X + DEFAULT_NET_W / 2
  /** Top Y of default net */
  const defTy = DEFAULT_NET_Y

  /** Center X of KubeFlex */
  const kfCx = KUBEFLEX_X + KUBEFLEX_W / 2
  /** Top Y of KubeFlex */
  const kfTy = KUBEFLEX_Y

  return [
    {
      // KubeVirt eth0 -> L3 UDN (Primary) — data-plane traffic (blue)
      id: 'kv-eth0-l3',
      d: `M ${kvCx} ${kvBy} L ${kvCx} ${kvBy + 6} Q ${kvCx} ${l3Ty - 3} ${l3Cx} ${l3Ty}`,
      color: L3_UDN_CONNECTION_COLOR,
      active: kubevirtDetected && ovnDetected,
      label: 'eth0',
    },
    {
      // KubeVirt eth1 -> L2 UDN (Secondary) — control-plane traffic (green)
      id: 'kv-eth1-l2',
      d: `M ${kvRx} ${KUBEVIRT_Y + 8} L ${kvRx + 5} ${KUBEVIRT_Y + 8} L ${kvRx + 5} ${l2By + 2} Q ${kvRx + 5} ${l2By} ${l2Cx - 25} ${l2By}`,
      color: L2_UDN_CONNECTION_COLOR,
      active: kubevirtDetected && ovnDetected,
      label: 'eth1',
    },
    {
      // K3s eth1 -> L2 UDN (Secondary) — control-plane traffic (green)
      id: 'k3s-eth1-l2',
      d: `M ${K3S_X} ${K3S_Y + 8} L ${K3S_X - 5} ${K3S_Y + 8} L ${K3S_X - 5} ${l2By + 2} Q ${K3S_X - 5} ${l2By} ${l2Cx + 25} ${l2By}`,
      color: L2_UDN_CONNECTION_COLOR,
      active: k3sDetected && ovnDetected,
      label: 'eth1',
    },
    {
      // K3s eth0 -> Default K8s Network -> KubeFlex Controller
      id: 'k3s-eth0-kf',
      d: `M ${k3sCx} ${k3sBy} L ${k3sCx} ${defTy - 2} L ${defCx} ${defTy} L ${defCx} ${defTy + DEFAULT_NET_H} L ${kfCx} ${kfTy}`,
      color: DEFAULT_NET_CONNECTION_COLOR,
      active: k3sDetected && kubeflexDetected,
      label: 'eth0',
    },
  ]
}

// ============================================================================
// Sub-Components
// ============================================================================

/** Animated flow particle along a connection path */
function FlowParticle({ pathId, color, active }: { pathId: string; color: string; active: boolean }) {
  if (!active) return null

  return (
    <motion.circle
      r={1.2}
      fill={color}
      filter="url(#glow)"
      initial={{ offsetDistance: '0%' }}
      animate={{ offsetDistance: '100%' }}
      transition={{
        duration: FLOW_ANIMATION_DURATION_S,
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
        dur={`${FLOW_ANIMATION_DURATION_S}s`}
        repeatCount="indefinite"
      />
    </motion.circle>
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
function InterfaceBadge({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={BADGE_W}
        height={BADGE_H}
        rx={BADGE_CORNER_RADIUS}
        fill="rgba(30, 41, 59, 0.9)"
        stroke="rgba(100, 116, 139, 0.3)"
        strokeWidth={0.4}
      />
      <text
        x={x + BADGE_W / 2}
        y={y + BADGE_H / 2 + 1}
        textAnchor="middle"
        fill={TEXT_SECONDARY}
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
      ),
    [data.ovnDetected, data.kubeflexDetected, data.k3sDetected, data.kubevirtDetected],
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

          {/* Arrowhead marker — blue */}
          <marker
            id="arrowBlue"
            markerWidth="4"
            markerHeight="4"
            refX="3"
            refY="2"
            orient="auto"
          >
            <path d="M 0 0 L 4 2 L 0 4 Z" fill={L3_UDN_CONNECTION_COLOR} opacity={0.7} />
          </marker>

          {/* Arrowhead marker — green */}
          <marker
            id="arrowGreen"
            markerWidth="4"
            markerHeight="4"
            refX="3"
            refY="2"
            orient="auto"
          >
            <path d="M 0 0 L 4 2 L 0 4 Z" fill={L2_UDN_CONNECTION_COLOR} opacity={0.7} />
          </marker>

          {/* Arrowhead marker — gray */}
          <marker
            id="arrowGray"
            markerWidth="4"
            markerHeight="4"
            refX="3"
            refY="2"
            orient="auto"
          >
            <path d="M 0 0 L 4 2 L 0 4 Z" fill={DEFAULT_NET_CONNECTION_COLOR} opacity={0.7} />
          </marker>
        </defs>

        {/* ================================================================
            Layer 0: Tenant outer boundary
            ================================================================ */}
        <rect
          x={TENANT_X}
          y={TENANT_Y}
          width={TENANT_W}
          height={TENANT_H}
          rx={ZONE_CORNER_RADIUS}
          fill="none"
          stroke={TENANT_STROKE}
          strokeWidth={ZONE_STROKE_WIDTH}
          strokeDasharray="4,2"
        />
        {/* Tenant label with K8s icon */}
        <K8sIcon x={TENANT_X + 3} y={TENANT_Y - 1} size={6} />
        <text
          x={TENANT_X + 11}
          y={TENANT_Y + 4}
          fill={TEXT_PRIMARY}
          fontSize={FONT_SIZE_TENANT}
          fontWeight="600"
        >
          {t('tenantTopology.tenantLabel', 'Tenant 1')}
        </text>

        {/* ================================================================
            Layer 1: Zone backgrounds
            ================================================================ */}

        {/* Layer-2 Cluster UDN (Secondary) */}
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
          {t('tenantTopology.l2Namespaces', 'namespace-1 & namespace-2')}
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
          strokeDasharray={DASHED_PATTERN}
        />
        <text
          x={NS1_X + NS1_W / 2}
          y={NS1_Y + 5}
          textAnchor="middle"
          fill={TEXT_MUTED}
          fontSize={FONT_SIZE_BADGE}
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
          strokeDasharray={DASHED_PATTERN}
        />
        <text
          x={NS2_X + NS2_W / 2}
          y={NS2_Y + 5}
          textAnchor="middle"
          fill={TEXT_MUTED}
          fontSize={FONT_SIZE_BADGE}
        >
          {t('tenantTopology.namespace2', 'namespace-2')}
        </text>

        {/* Layer-3 UDN (Primary) */}
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
          y={L3_UDN_Y + 7}
          textAnchor="middle"
          fill={data.ovnDetected ? L3_UDN_CONNECTION_COLOR : TEXT_MUTED}
          fontSize={FONT_SIZE_LABEL}
          fontWeight="500"
        >
          {t('tenantTopology.l3Udn', 'Layer-3 UDN (Primary)')}
        </text>
        <text
          x={L3_UDN_X + L3_UDN_W / 2}
          y={L3_UDN_Y + 13}
          textAnchor="middle"
          fill={TEXT_MUTED}
          fontSize={FONT_SIZE_BADGE}
        >
          {t('tenantTopology.l3DataPlane', 'data-plane')}
        </text>

        {/* Default K8s Network */}
        <rect
          x={DEFAULT_NET_X}
          y={DEFAULT_NET_Y}
          width={DEFAULT_NET_W}
          height={DEFAULT_NET_H}
          rx={ZONE_CORNER_RADIUS}
          fill={DEFAULT_NET_FILL}
          stroke={DEFAULT_NET_STROKE}
          strokeWidth={ZONE_STROKE_WIDTH}
        />
        <text
          x={DEFAULT_NET_X + DEFAULT_NET_W / 2}
          y={DEFAULT_NET_Y + 7}
          textAnchor="middle"
          fill={TEXT_SECONDARY}
          fontSize={FONT_SIZE_LABEL}
        >
          {t('tenantTopology.defaultNet', 'Default K8s')}
        </text>
        <text
          x={DEFAULT_NET_X + DEFAULT_NET_W / 2}
          y={DEFAULT_NET_Y + 13}
          textAnchor="middle"
          fill={TEXT_MUTED}
          fontSize={FONT_SIZE_BADGE}
        >
          {t('tenantTopology.defaultNetLabel', 'Network')}
        </text>

        {/* ================================================================
            Layer 2: Connection lines
            ================================================================ */}
        {(connections || []).map((conn) => {
          const markerEnd =
            conn.color === L2_UDN_CONNECTION_COLOR
              ? 'url(#arrowGreen)'
              : conn.color === L3_UDN_CONNECTION_COLOR
                ? 'url(#arrowBlue)'
                : 'url(#arrowGray)'

          return (
            <motion.path
              key={conn.id}
              d={conn.d}
              fill="none"
              stroke={conn.active ? conn.color : TEXT_MUTED}
              strokeWidth={CONNECTION_STROKE_WIDTH}
              strokeDasharray={conn.active ? 'none' : DASHED_PATTERN}
              markerEnd={conn.active ? markerEnd : undefined}
              opacity={conn.active ? 0.6 : 0.25}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: conn.active ? 0.6 : 0.25 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          )
        })}

        {/* Animated flow particles on active connections */}
        {(connections || []).map((conn) => (
          <FlowParticle
            key={`particle-${conn.id}`}
            pathId={conn.id}
            color={conn.color}
            active={conn.active}
          />
        ))}

        {/* ================================================================
            Layer 3: Component nodes
            ================================================================ */}

        {/* KubeVirt Pod */}
        <motion.g
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <rect
            x={KUBEVIRT_X}
            y={KUBEVIRT_Y}
            width={KUBEVIRT_W}
            height={KUBEVIRT_H}
            rx={NODE_CORNER_RADIUS}
            fill={data.kubevirtDetected ? NODE_FILL : NODE_FILL_INACTIVE}
            stroke={data.kubevirtDetected ? NODE_STROKE : NODE_STROKE_INACTIVE}
            strokeWidth={NODE_STROKE_WIDTH}
            strokeDasharray={data.kubevirtDetected ? 'none' : DASHED_PATTERN}
            filter="url(#nodeShadow)"
          />
          <text
            x={KUBEVIRT_X + KUBEVIRT_W / 2}
            y={KUBEVIRT_Y + 10}
            textAnchor="middle"
            fill={data.kubevirtDetected ? TEXT_PRIMARY : TEXT_MUTED}
            fontSize={FONT_SIZE_TITLE}
            fontWeight="600"
          >
            {t('tenantTopology.kubevirtPod', 'KubeVirt Pod')}
          </text>
          <text
            x={KUBEVIRT_X + KUBEVIRT_W / 2}
            y={KUBEVIRT_Y + 16}
            textAnchor="middle"
            fill={TEXT_MUTED}
            fontSize={FONT_SIZE_BADGE}
          >
            {t('tenantTopology.kubevirtVm', 'VM Workload')}
          </text>
          {/* Interface badges */}
          <InterfaceBadge x={KUBEVIRT_X + KUBEVIRT_W / 2 - BADGE_W / 2} y={KUBEVIRT_Y + KUBEVIRT_H - 8} label="eth0" />
          <InterfaceBadge x={KUBEVIRT_X + KUBEVIRT_W - BADGE_W - 2} y={KUBEVIRT_Y + 4} label="eth1" />
          {/* Status dot */}
          <StatusDot
            x={KUBEVIRT_X + KUBEVIRT_W - STATUS_DOT_OFFSET_X}
            y={KUBEVIRT_Y + STATUS_DOT_OFFSET_Y}
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
          <text
            x={K3S_X + K3S_W / 2}
            y={K3S_Y + 10}
            textAnchor="middle"
            fill={data.k3sDetected ? TEXT_PRIMARY : TEXT_MUTED}
            fontSize={FONT_SIZE_TITLE}
            fontWeight="600"
          >
            {t('tenantTopology.k3sPod', 'K3s Server Pod')}
          </text>
          <text
            x={K3S_X + K3S_W / 2}
            y={K3S_Y + 16}
            textAnchor="middle"
            fill={TEXT_MUTED}
            fontSize={FONT_SIZE_BADGE}
          >
            {t('tenantTopology.k3sCluster', 'Control Plane')}
          </text>
          {/* Interface badges */}
          <InterfaceBadge x={K3S_X + K3S_W / 2 - BADGE_W / 2} y={K3S_Y + K3S_H - 8} label="eth0" />
          <InterfaceBadge x={K3S_X + 2} y={K3S_Y + 4} label="eth1" />
          {/* Status dot */}
          <StatusDot
            x={K3S_X + K3S_W - STATUS_DOT_OFFSET_X}
            y={K3S_Y + STATUS_DOT_OFFSET_Y}
            detected={data.k3sDetected}
            healthy={data.k3sHealthy}
          />
        </motion.g>

        {/* KubeFlex Controller */}
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
            y={KUBEFLEX_Y + 9}
            textAnchor="middle"
            fill={data.kubeflexDetected ? TEXT_PRIMARY : TEXT_MUTED}
            fontSize={FONT_SIZE_TITLE}
            fontWeight="600"
          >
            {t('tenantTopology.kubeflexController', 'KubeFlex Controller')}
          </text>
          {/* Status dot */}
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
            Layer 4: Legend (bottom-left)
            ================================================================ */}
        <g>
          {/* Legend background */}
          <rect
            x={TENANT_X + 3}
            y={TENANT_Y + TENANT_H - 18}
            width={55}
            height={15}
            rx={2}
            fill="rgba(15, 23, 42, 0.7)"
            stroke="rgba(100, 116, 139, 0.15)"
            strokeWidth={0.3}
          />
          {/* Blue — Primary UDN */}
          <circle cx={TENANT_X + 8} cy={TENANT_Y + TENANT_H - 11} r={1.5} fill={L3_UDN_CONNECTION_COLOR} />
          <text
            x={TENANT_X + 12}
            y={TENANT_Y + TENANT_H - 9.5}
            fill={TEXT_SECONDARY}
            fontSize={FONT_SIZE_LEGEND}
          >
            {t('tenantTopology.legendPrimary', 'Primary UDN: data-plane')}
          </text>
          {/* Green — Secondary UDN */}
          <circle cx={TENANT_X + 8} cy={TENANT_Y + TENANT_H - 6} r={1.5} fill={L2_UDN_CONNECTION_COLOR} />
          <text
            x={TENANT_X + 12}
            y={TENANT_Y + TENANT_H - 4.5}
            fill={TEXT_SECONDARY}
            fontSize={FONT_SIZE_LEGEND}
          >
            {t('tenantTopology.legendSecondary', 'Secondary UDN: control-plane')}
          </text>
        </g>
      </svg>
    </div>
  )
}
