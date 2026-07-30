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
import { useId } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useCardLoadingState } from '../../CardDataContext'
import { DEMO_TENANT_TOPOLOGY } from './demoData'
import {
  buildConnections,
  FlowParticle,
  ThroughputLabel,
  StatusDot,
  InterfaceBadge,
  K8sIcon,
} from './TenantTopologyParts'
import {
  AGENT1_H,
  AGENT1_W,
  AGENT1_X,
  AGENT1_Y,
  AGENT2_H,
  AGENT2_W,
  AGENT2_X,
  AGENT2_Y,
  BADGE_H,
  BADGE_W,
  CONNECTION_STROKE_WIDTH,
  DASHED_PATTERN,
  DEFAULT_NET_CONNECTION_COLOR,
  DEFAULT_NET_LABEL_X,
  DEFAULT_NET_LABEL_Y,
  FONT_SIZE_BADGE,
  FONT_SIZE_LABEL,
  FONT_SIZE_LEGEND,
  FONT_SIZE_SUBLABEL,
  FONT_SIZE_TENANT,
  FONT_SIZE_TITLE,
  K3S_H,
  K3S_W,
  K3S_X,
  K3S_Y,
  KUBEFLEX_FILL,
  KUBEFLEX_H,
  KUBEFLEX_STROKE,
  KUBEFLEX_W,
  KUBEFLEX_X,
  KUBEFLEX_Y,
  L2_UDN_CONNECTION_COLOR,
  L2_UDN_FILL,
  L2_UDN_H,
  L2_UDN_STROKE,
  L2_UDN_W,
  L2_UDN_X,
  L2_UDN_Y,
  L3_UDN_CONNECTION_COLOR,
  L3_UDN_FILL,
  L3_UDN_H,
  L3_UDN_STROKE,
  L3_UDN_W,
  L3_UDN_X,
  L3_UDN_Y,
  NODE_CORNER_RADIUS,
  NODE_FILL,
  NODE_FILL_INACTIVE,
  NODE_STROKE,
  NODE_STROKE_INACTIVE,
  NODE_STROKE_WIDTH,
  NS1_H,
  NS1_W,
  NS1_X,
  NS1_Y,
  NS2_H,
  NS2_W,
  NS2_X,
  NS2_Y,
  NS_FILL,
  NS_STROKE,
  STATUS_DOT_OFFSET_X,
  STATUS_DOT_OFFSET_Y,
  TENANT_H,
  TENANT_STROKE,
  TENANT_W,
  TENANT_X,
  TENANT_Y,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
  ZONE_CORNER_RADIUS,
  ZONE_STROKE_WIDTH,
} from './tenantTopology.constants'
import { useTenantTopology } from './useTenantTopology'

// Create namespace object for tree-shaking (named imports prevent bundle bloat)
const topology = {
  AGENT1_H,
  AGENT1_W,
  AGENT1_X,
  AGENT1_Y,
  AGENT2_H,
  AGENT2_W,
  AGENT2_X,
  AGENT2_Y,
  BADGE_H,
  BADGE_W,
  CONNECTION_STROKE_WIDTH,
  DASHED_PATTERN,
  DEFAULT_NET_CONNECTION_COLOR,
  DEFAULT_NET_LABEL_X,
  DEFAULT_NET_LABEL_Y,
  FONT_SIZE_BADGE,
  FONT_SIZE_LABEL,
  FONT_SIZE_LEGEND,
  FONT_SIZE_SUBLABEL,
  FONT_SIZE_TENANT,
  FONT_SIZE_TITLE,
  K3S_H,
  K3S_W,
  K3S_X,
  K3S_Y,
  KUBEFLEX_FILL,
  KUBEFLEX_H,
  KUBEFLEX_STROKE,
  KUBEFLEX_W,
  KUBEFLEX_X,
  KUBEFLEX_Y,
  L2_UDN_CONNECTION_COLOR,
  L2_UDN_FILL,
  L2_UDN_H,
  L2_UDN_STROKE,
  L2_UDN_W,
  L2_UDN_X,
  L2_UDN_Y,
  L3_UDN_CONNECTION_COLOR,
  L3_UDN_FILL,
  L3_UDN_H,
  L3_UDN_STROKE,
  L3_UDN_W,
  L3_UDN_X,
  L3_UDN_Y,
  NODE_CORNER_RADIUS,
  NODE_FILL,
  NODE_FILL_INACTIVE,
  NODE_STROKE,
  NODE_STROKE_INACTIVE,
  NODE_STROKE_WIDTH,
  NS1_H,
  NS1_W,
  NS1_X,
  NS1_Y,
  NS2_H,
  NS2_W,
  NS2_X,
  NS2_Y,
  NS_FILL,
  NS_STROKE,
  STATUS_DOT_OFFSET_X,
  STATUS_DOT_OFFSET_Y,
  TENANT_H,
  TENANT_STROKE,
  TENANT_W,
  TENANT_X,
  TENANT_Y,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
  ZONE_CORNER_RADIUS,
  ZONE_STROKE_WIDTH,
}

export function TenantTopology() {
  const { t } = useTranslation('cards')
  /** Unique prefix for SVG defs IDs to prevent collisions with multiple instances */
  const svgId = useId().replace(/:/g, '')

  const liveData = useTenantTopology()

  // Use demo data when all hooks return no detection
  const data = liveData.isDemoData ? DEMO_TENANT_TOPOLOGY : liveData

  useCardLoadingState({
    isLoading: data.isLoading && !data.isDemoData,
    isRefreshing: liveData.isRefreshing,
    hasAnyData: true,
    isDemoData: data.isDemoData })

  const connections = buildConnections(
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
          k3sEth1Tx: data.k3sEth1Tx },
      )

  return (
    <div className="w-full h-full min-h-[280px]">
      <svg
        viewBox={`0 0 ${topology.VIEWBOX_WIDTH} ${topology.VIEWBOX_HEIGHT}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* SVG Definitions: gradients, filters, path references */}
        <defs>
          {/* Glow filter for animated particles */}
          <filter id={`${svgId}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Subtle shadow for nodes */}
          <filter id={`${svgId}-nodeShadow`} x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="0.5" stdDeviation="1" floodColor="rgba(0,0,0,0.3)" />
          </filter>

          {/* Connection path references for offset-path animation */}
          {(connections || []).map((conn) => (
            <path key={conn.id} id={`${svgId}-${conn.id}`} d={conn.d} fill="none" />
          ))}

          {/* Arrowhead markers for bidirectional connections */}
          <marker id={`${svgId}-arrowBlue`} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
            <path d="M 0 0 L 4 2 L 0 4 Z" fill={topology.L3_UDN_CONNECTION_COLOR} opacity={0.7} />
          </marker>
          <marker id={`${svgId}-arrowBlueReverse`} markerWidth="4" markerHeight="4" refX="1" refY="2" orient="auto-start-reverse">
            <path d="M 0 0 L 4 2 L 0 4 Z" fill={topology.L3_UDN_CONNECTION_COLOR} opacity={0.7} />
          </marker>

          <marker id={`${svgId}-arrowGreen`} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
            <path d="M 0 0 L 4 2 L 0 4 Z" fill={topology.L2_UDN_CONNECTION_COLOR} opacity={0.7} />
          </marker>
          <marker id={`${svgId}-arrowGreenReverse`} markerWidth="4" markerHeight="4" refX="1" refY="2" orient="auto-start-reverse">
            <path d="M 0 0 L 4 2 L 0 4 Z" fill={topology.L2_UDN_CONNECTION_COLOR} opacity={0.7} />
          </marker>

          <marker id={`${svgId}-arrowDark`} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
            <path d="M 0 0 L 4 2 L 0 4 Z" fill={topology.DEFAULT_NET_CONNECTION_COLOR} opacity={0.7} />
          </marker>
          <marker id={`${svgId}-arrowDarkReverse`} markerWidth="4" markerHeight="4" refX="1" refY="2" orient="auto-start-reverse">
            <path d="M 0 0 L 4 2 L 0 4 Z" fill={topology.DEFAULT_NET_CONNECTION_COLOR} opacity={0.7} />
          </marker>
        </defs>

        {/* ================================================================
            Layer 0: Tenant outer boundary (blue dashed)
            ================================================================ */}
        <rect
          x={topology.TENANT_X}
          y={topology.TENANT_Y}
          width={topology.TENANT_W}
          height={topology.TENANT_H}
          rx={topology.ZONE_CORNER_RADIUS}
          fill="none"
          stroke={topology.TENANT_STROKE}
          strokeWidth={1}
          strokeDasharray="4,2"
        />
        {/* Tenant label with K8s icon */}
        <K8sIcon x={topology.TENANT_X + 3} y={topology.TENANT_Y + 2} size={6} />
        <text
          x={topology.TENANT_X + 11}
          y={topology.TENANT_Y + 6.5}
          fill={topology.TEXT_PRIMARY}
          fontSize={topology.FONT_SIZE_TENANT}
          fontWeight="600"
        >
          {t('tenantTopology.tenantLabel', 'Tenant 1')}
        </text>

        {/* ================================================================
            Layer 1: Zone backgrounds
            ================================================================ */}

        {/* Layer-2 Cluster UDN (Secondary) — green zone at top */}
        <motion.rect
          x={topology.L2_UDN_X}
          y={topology.L2_UDN_Y}
          width={topology.L2_UDN_W}
          height={topology.L2_UDN_H}
          rx={topology.ZONE_CORNER_RADIUS}
          fill={data.ovnDetected ? topology.L2_UDN_FILL : 'transparent'}
          stroke={data.ovnDetected ? topology.L2_UDN_STROKE : topology.NS_STROKE}
          strokeWidth={topology.ZONE_STROKE_WIDTH}
          strokeDasharray={data.ovnDetected ? 'none' : topology.DASHED_PATTERN}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        />
        <text
          x={topology.L2_UDN_X + topology.L2_UDN_W / 2}
          y={topology.L2_UDN_Y + 8}
          textAnchor="middle"
          fill={data.ovnDetected ? topology.L2_UDN_CONNECTION_COLOR : topology.TEXT_MUTED}
          fontSize={topology.FONT_SIZE_LABEL}
          fontWeight="500"
        >
          {t('tenantTopology.l2Udn', 'Layer-2 Cluster UDN (Secondary)')}
        </text>
        <text
          x={topology.L2_UDN_X + topology.L2_UDN_W / 2}
          y={topology.L2_UDN_Y + 14}
          textAnchor="middle"
          fill={topology.TEXT_MUTED}
          fontSize={topology.FONT_SIZE_BADGE}
        >
          {t('tenantTopology.l2Namespaces', '(namespace-1 & namespace-2)')}
        </text>

        {/* Namespace-1 container */}
        <rect
          x={topology.NS1_X}
          y={topology.NS1_Y}
          width={topology.NS1_W}
          height={topology.NS1_H}
          rx={topology.ZONE_CORNER_RADIUS}
          fill={topology.NS_FILL}
          stroke={topology.NS_STROKE}
          strokeWidth={topology.ZONE_STROKE_WIDTH}
        />
        <text
          x={topology.NS1_X + 4}
          y={topology.NS1_Y + 5}
          fill={topology.TEXT_PRIMARY}
          fontSize={topology.FONT_SIZE_LABEL}
          fontWeight="600"
        >
          {t('tenantTopology.namespace1', 'namespace-1')}
        </text>

        {/* Namespace-2 container */}
        <rect
          x={topology.NS2_X}
          y={topology.NS2_Y}
          width={topology.NS2_W}
          height={topology.NS2_H}
          rx={topology.ZONE_CORNER_RADIUS}
          fill={topology.NS_FILL}
          stroke={topology.NS_STROKE}
          strokeWidth={topology.ZONE_STROKE_WIDTH}
        />
        <text
          x={topology.NS2_X + 4}
          y={topology.NS2_Y + 5}
          fill={topology.TEXT_PRIMARY}
          fontSize={topology.FONT_SIZE_LABEL}
          fontWeight="600"
        >
          {t('tenantTopology.namespace2', 'namespace-2')}
        </text>

        {/* Layer-3 UDN (Primary) — blue zone at bottom */}
        <motion.rect
          x={topology.L3_UDN_X}
          y={topology.L3_UDN_Y}
          width={topology.L3_UDN_W}
          height={topology.L3_UDN_H}
          rx={topology.ZONE_CORNER_RADIUS}
          fill={data.ovnDetected ? topology.L3_UDN_FILL : 'transparent'}
          stroke={data.ovnDetected ? topology.L3_UDN_STROKE : topology.NS_STROKE}
          strokeWidth={topology.ZONE_STROKE_WIDTH}
          strokeDasharray={data.ovnDetected ? 'none' : topology.DASHED_PATTERN}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        />
        <text
          x={topology.L3_UDN_X + topology.L3_UDN_W / 2}
          y={topology.L3_UDN_Y + 10}
          textAnchor="middle"
          fill={data.ovnDetected ? topology.L3_UDN_CONNECTION_COLOR : topology.TEXT_MUTED}
          fontSize={topology.FONT_SIZE_LABEL}
          fontWeight="500"
        >
          {t('tenantTopology.l3Udn', 'Layer-3 UDN (Primary)')}
        </text>

        {/* "Default k8s Network" label — right side */}
        <text
          x={topology.DEFAULT_NET_LABEL_X}
          y={topology.DEFAULT_NET_LABEL_Y}
          fill={topology.DEFAULT_NET_CONNECTION_COLOR}
          fontSize={topology.FONT_SIZE_LABEL}
          fontStyle="italic"
        >
          {t('tenantTopology.defaultNet', 'Default k8s Network')}
        </text>

        {/* ================================================================
            Layer 2: Connection lines (all bidirectional)
            ================================================================ */}
        {(connections || []).map((conn) => {
          const isGreen = conn.color === topology.L2_UDN_CONNECTION_COLOR
          const isBlue = conn.color === topology.L3_UDN_CONNECTION_COLOR
          const markerEnd = isGreen ? `url(#${svgId}-arrowGreen)` : isBlue ? `url(#${svgId}-arrowBlue)` : `url(#${svgId}-arrowDark)`
          const markerStart = isGreen ? `url(#${svgId}-arrowGreenReverse)` : isBlue ? `url(#${svgId}-arrowBlueReverse)` : `url(#${svgId}-arrowDarkReverse)`

          return (
            <motion.path
              key={conn.id}
              d={conn.d}
              fill="none"
              stroke={conn.active ? conn.color : topology.TEXT_MUTED}
              strokeWidth={topology.CONNECTION_STROKE_WIDTH}
              strokeDasharray={conn.active ? 'none' : topology.DASHED_PATTERN}
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
            pathId={`${svgId}-${conn.id}`}
            color={conn.color}
            active={conn.active}
            throughputBytesPerSec={conn.throughputBytesPerSec}
            idPrefix={svgId}
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
            x={topology.AGENT1_X}
            y={topology.AGENT1_Y}
            width={topology.AGENT1_W}
            height={topology.AGENT1_H}
            rx={topology.NODE_CORNER_RADIUS}
            fill={data.kubevirtDetected ? topology.NODE_FILL : topology.NODE_FILL_INACTIVE}
            stroke={data.kubevirtDetected ? topology.NODE_STROKE : topology.NODE_STROKE_INACTIVE}
            strokeWidth={topology.NODE_STROKE_WIDTH}
            strokeDasharray={data.kubevirtDetected ? 'none' : topology.DASHED_PATTERN}
            filter={`url(#${svgId}-nodeShadow)`}
          />
          {/* eth1 badge at top */}
          <InterfaceBadge x={topology.AGENT1_X + topology.AGENT1_W / 2 - topology.BADGE_W / 2} y={topology.AGENT1_Y + 2} label="eth1" isEth1 />
          <text
            x={topology.AGENT1_X + topology.AGENT1_W / 2}
            y={topology.AGENT1_Y + 16}
            textAnchor="middle"
            fill={data.kubevirtDetected ? topology.TEXT_PRIMARY : topology.TEXT_MUTED}
            fontSize={topology.FONT_SIZE_TITLE}
            fontWeight="600"
          >
            {t('tenantTopology.agentPod', 'K3s Agent Pod')}
          </text>
          <text
            x={topology.AGENT1_X + topology.AGENT1_W / 2}
            y={topology.AGENT1_Y + 22}
            textAnchor="middle"
            fill={topology.TEXT_MUTED}
            fontSize={topology.FONT_SIZE_SUBLABEL}
          >
            {t('tenantTopology.kubevirtLabel', '(KubeVirt)')}
          </text>
          {/* eth0 badge at bottom */}
          <InterfaceBadge x={topology.AGENT1_X + topology.AGENT1_W / 2 - topology.BADGE_W / 2} y={topology.AGENT1_Y + topology.AGENT1_H - 8} label="eth0" />
          <StatusDot
            x={topology.AGENT1_X + topology.AGENT1_W - topology.STATUS_DOT_OFFSET_X}
            y={topology.AGENT1_Y + topology.STATUS_DOT_OFFSET_Y}
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
            x={topology.AGENT2_X}
            y={topology.AGENT2_Y}
            width={topology.AGENT2_W}
            height={topology.AGENT2_H}
            rx={topology.NODE_CORNER_RADIUS}
            fill={data.kubevirtDetected ? topology.NODE_FILL : topology.NODE_FILL_INACTIVE}
            stroke={data.kubevirtDetected ? topology.NODE_STROKE : topology.NODE_STROKE_INACTIVE}
            strokeWidth={topology.NODE_STROKE_WIDTH}
            strokeDasharray={data.kubevirtDetected ? 'none' : topology.DASHED_PATTERN}
            filter={`url(#${svgId}-nodeShadow)`}
          />
          {/* eth1 badge at top */}
          <InterfaceBadge x={topology.AGENT2_X + topology.AGENT2_W / 2 - topology.BADGE_W / 2} y={topology.AGENT2_Y + 2} label="eth1" isEth1 />
          <text
            x={topology.AGENT2_X + topology.AGENT2_W / 2}
            y={topology.AGENT2_Y + 16}
            textAnchor="middle"
            fill={data.kubevirtDetected ? topology.TEXT_PRIMARY : topology.TEXT_MUTED}
            fontSize={topology.FONT_SIZE_TITLE}
            fontWeight="600"
          >
            {t('tenantTopology.agentPod', 'K3s Agent Pod')}
          </text>
          <text
            x={topology.AGENT2_X + topology.AGENT2_W / 2}
            y={topology.AGENT2_Y + 22}
            textAnchor="middle"
            fill={topology.TEXT_MUTED}
            fontSize={topology.FONT_SIZE_SUBLABEL}
            fontWeight="600"
          >
            {t('tenantTopology.kubevirtLabel', '(KubeVirt)')}
          </text>
          {/* eth0 badge at bottom */}
          <InterfaceBadge x={topology.AGENT2_X + topology.AGENT2_W / 2 - topology.BADGE_W / 2} y={topology.AGENT2_Y + topology.AGENT2_H - 8} label="eth0" />
          <StatusDot
            x={topology.AGENT2_X + topology.AGENT2_W - topology.STATUS_DOT_OFFSET_X}
            y={topology.AGENT2_Y + topology.STATUS_DOT_OFFSET_Y}
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
            x={topology.K3S_X}
            y={topology.K3S_Y}
            width={topology.K3S_W}
            height={topology.K3S_H}
            rx={topology.NODE_CORNER_RADIUS}
            fill={data.k3sDetected ? topology.NODE_FILL : topology.NODE_FILL_INACTIVE}
            stroke={data.k3sDetected ? topology.NODE_STROKE : topology.NODE_STROKE_INACTIVE}
            strokeWidth={topology.NODE_STROKE_WIDTH}
            strokeDasharray={data.k3sDetected ? 'none' : topology.DASHED_PATTERN}
            filter={`url(#${svgId}-nodeShadow)`}
          />
          {/* eth0 badge at top-right */}
          <InterfaceBadge x={topology.K3S_X + topology.K3S_W - topology.BADGE_W - 4} y={topology.K3S_Y + 2} label="eth0" />
          {/* eth1 badge at left side */}
          <InterfaceBadge x={topology.K3S_X + 2} y={topology.K3S_Y + topology.K3S_H / 2 - topology.BADGE_H / 2} label="eth1" isEth1 />
          <text
            x={topology.K3S_X + topology.K3S_W / 2 + 4}
            y={topology.K3S_Y + 26}
            textAnchor="middle"
            fill={data.k3sDetected ? topology.TEXT_PRIMARY : topology.TEXT_MUTED}
            fontSize={topology.FONT_SIZE_TITLE}
            fontWeight="600"
          >
            {t('tenantTopology.k3sPod', 'K3s Server Pod')}
          </text>
          <StatusDot
            x={topology.K3S_X + topology.K3S_W - topology.STATUS_DOT_OFFSET_X}
            y={topology.K3S_Y + topology.STATUS_DOT_OFFSET_Y}
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
            x={topology.KUBEFLEX_X}
            y={topology.KUBEFLEX_Y}
            width={topology.KUBEFLEX_W}
            height={topology.KUBEFLEX_H}
            rx={topology.NODE_CORNER_RADIUS}
            fill={data.kubeflexDetected ? topology.KUBEFLEX_FILL : topology.NODE_FILL_INACTIVE}
            stroke={data.kubeflexDetected ? topology.KUBEFLEX_STROKE : topology.NODE_STROKE_INACTIVE}
            strokeWidth={topology.NODE_STROKE_WIDTH}
            strokeDasharray={data.kubeflexDetected ? 'none' : topology.DASHED_PATTERN}
            filter={`url(#${svgId}-nodeShadow)`}
          />
          <text
            x={topology.KUBEFLEX_X + topology.KUBEFLEX_W / 2}
            y={topology.KUBEFLEX_Y + 10}
            textAnchor="middle"
            fill={data.kubeflexDetected ? topology.TEXT_PRIMARY : topology.TEXT_MUTED}
            fontSize={topology.FONT_SIZE_TITLE}
            fontWeight="700"
          >
            {t('tenantTopology.kubeflexController', 'KubeFlex Controller')}
          </text>
          <StatusDot
            x={topology.KUBEFLEX_X + topology.KUBEFLEX_W - topology.STATUS_DOT_OFFSET_X}
            y={topology.KUBEFLEX_Y + topology.STATUS_DOT_OFFSET_Y}
            detected={data.kubeflexDetected}
            healthy={data.kubeflexHealthy}
          />
        </motion.g>

        {/* OVN status dot on L2 UDN zone */}
        <StatusDot
          x={topology.L2_UDN_X + topology.L2_UDN_W - topology.STATUS_DOT_OFFSET_X}
          y={topology.L2_UDN_Y + topology.STATUS_DOT_OFFSET_Y}
          detected={data.ovnDetected}
          healthy={data.ovnHealthy}
        />

        {/* OVN status dot on L3 UDN zone */}
        <StatusDot
          x={topology.L3_UDN_X + topology.L3_UDN_W - topology.STATUS_DOT_OFFSET_X}
          y={topology.L3_UDN_Y + topology.STATUS_DOT_OFFSET_Y}
          detected={data.ovnDetected}
          healthy={data.ovnHealthy}
        />

        {/* ================================================================
            Layer 4: Legend (bottom-right)
            ================================================================ */}
        <g>
          {/* Legend background */}
          <rect
            x={topology.L3_UDN_X + topology.L3_UDN_W + 10}
            y={topology.L3_UDN_Y}
            width={70}
            height={16}
            rx={2}
            fill="rgba(15, 23, 42, 0.7)"
            stroke="rgba(100, 116, 139, 0.15)"
            strokeWidth={0.3}
          />
          {/* Blue — Primary UDN: data-plane traffic */}
          <circle cx={topology.L3_UDN_X + topology.L3_UDN_W + 15} cy={topology.L3_UDN_Y + 5} r={1.5} fill={topology.L3_UDN_CONNECTION_COLOR} />
          <text
            x={topology.L3_UDN_X + topology.L3_UDN_W + 19}
            y={topology.L3_UDN_Y + 6.5}
            fill={topology.TEXT_SECONDARY}
            fontSize={topology.FONT_SIZE_LEGEND}
          >
            {t('tenantTopology.legendPrimary', 'Primary UDN: data-plane traffic')}
          </text>
          {/* Green — Secondary UDN: control-plane traffic */}
          <circle cx={topology.L3_UDN_X + topology.L3_UDN_W + 15} cy={topology.L3_UDN_Y + 11} r={1.5} fill={topology.L2_UDN_CONNECTION_COLOR} />
          <text
            x={topology.L3_UDN_X + topology.L3_UDN_W + 19}
            y={topology.L3_UDN_Y + 12.5}
            fill={topology.TEXT_SECONDARY}
            fontSize={topology.FONT_SIZE_LEGEND}
          >
            {t('tenantTopology.legendSecondary', 'Secondary UDN: control-plane traffic')}
          </text>
        </g>
      </svg>
    </div>
  )
}
