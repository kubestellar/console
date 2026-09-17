import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { InterfaceBadge, StatusDot } from './TenantTopologySubParts'
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
  FONT_SIZE_SUBLABEL,
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
  L2_UDN_W,
  L2_UDN_X,
  L2_UDN_Y,
  L3_UDN_W,
  L3_UDN_X,
  L3_UDN_Y,
  DASHED_PATTERN,
  NODE_CORNER_RADIUS,
  NODE_FILL,
  NODE_FILL_INACTIVE,
  NODE_STROKE,
  NODE_STROKE_INACTIVE,
  NODE_STROKE_WIDTH,
  STATUS_DOT_OFFSET_X,
  STATUS_DOT_OFFSET_Y,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from './tenantTopology.constants'

interface TenantTopologyNodesLayerProps {
  /** Unique prefix for SVG defs IDs to prevent collisions with multiple instances */
  svgId: string
  /** Whether OVN (Layer-2/Layer-3 UDN) is detected on the cluster */
  ovnDetected: boolean
  /** Whether OVN reports a healthy status */
  ovnHealthy: boolean
  /** Whether the KubeFlex controller is detected */
  kubeflexDetected: boolean
  /** Whether the KubeFlex controller is healthy */
  kubeflexHealthy: boolean
  /** Whether the K3s server pod is detected */
  k3sDetected: boolean
  /** Whether the K3s server pod is healthy */
  k3sHealthy: boolean
  /** Whether the KubeVirt agent pods are detected */
  kubevirtDetected: boolean
  /** Whether the KubeVirt agent pods are healthy */
  kubevirtHealthy: boolean
}

/**
 * Layer 3 of the topology SVG: the two KubeVirt agent pod nodes, the K3s
 * server pod node, the KubeFlex controller node, and the OVN status dots
 * overlaid on the UDN zones.
 */
export function TenantTopologyNodesLayer({
  svgId,
  ovnDetected,
  ovnHealthy,
  kubeflexDetected,
  kubeflexHealthy,
  k3sDetected,
  k3sHealthy,
  kubevirtDetected,
  kubevirtHealthy,
}: TenantTopologyNodesLayerProps) {
  const { t } = useTranslation('cards')

  return (
    <>
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
          fill={kubevirtDetected ? NODE_FILL : NODE_FILL_INACTIVE}
          stroke={kubevirtDetected ? NODE_STROKE : NODE_STROKE_INACTIVE}
          strokeWidth={NODE_STROKE_WIDTH}
          strokeDasharray={kubevirtDetected ? 'none' : DASHED_PATTERN}
          filter={`url(#${svgId}-nodeShadow)`}
        />
        {/* eth1 badge at top */}
        <InterfaceBadge x={AGENT1_X + AGENT1_W / 2 - BADGE_W / 2} y={AGENT1_Y + 2} label="eth1" isEth1 />
        <text
          x={AGENT1_X + AGENT1_W / 2}
          y={AGENT1_Y + 16}
          textAnchor="middle"
          fill={kubevirtDetected ? TEXT_PRIMARY : TEXT_MUTED}
          fontSize={FONT_SIZE_TITLE}
          fontWeight="600"
        >
          {t('tenantTopology.agentPod', 'K3s Agent Pod')}
        </text>
        <text
          x={AGENT1_X + AGENT1_W / 2}
          y={AGENT1_Y + 22}
          textAnchor="middle"
          fill={TEXT_MUTED}
          fontSize={FONT_SIZE_SUBLABEL}
        >
          {t('tenantTopology.kubevirtLabel', '(KubeVirt)')}
        </text>
        {/* eth0 badge at bottom */}
        <InterfaceBadge x={AGENT1_X + AGENT1_W / 2 - BADGE_W / 2} y={AGENT1_Y + AGENT1_H - 8} label="eth0" />
        <StatusDot
          x={AGENT1_X + AGENT1_W - STATUS_DOT_OFFSET_X}
          y={AGENT1_Y + STATUS_DOT_OFFSET_Y}
          detected={kubevirtDetected}
          healthy={kubevirtHealthy}
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
          fill={kubevirtDetected ? NODE_FILL : NODE_FILL_INACTIVE}
          stroke={kubevirtDetected ? NODE_STROKE : NODE_STROKE_INACTIVE}
          strokeWidth={NODE_STROKE_WIDTH}
          strokeDasharray={kubevirtDetected ? 'none' : DASHED_PATTERN}
          filter={`url(#${svgId}-nodeShadow)`}
        />
        {/* eth1 badge at top */}
        <InterfaceBadge x={AGENT2_X + AGENT2_W / 2 - BADGE_W / 2} y={AGENT2_Y + 2} label="eth1" isEth1 />
        <text
          x={AGENT2_X + AGENT2_W / 2}
          y={AGENT2_Y + 16}
          textAnchor="middle"
          fill={kubevirtDetected ? TEXT_PRIMARY : TEXT_MUTED}
          fontSize={FONT_SIZE_TITLE}
          fontWeight="600"
        >
          {t('tenantTopology.agentPod', 'K3s Agent Pod')}
        </text>
        <text
          x={AGENT2_X + AGENT2_W / 2}
          y={AGENT2_Y + 22}
          textAnchor="middle"
          fill={TEXT_MUTED}
          fontSize={FONT_SIZE_SUBLABEL}
          fontWeight="600"
        >
          {t('tenantTopology.kubevirtLabel', '(KubeVirt)')}
        </text>
        {/* eth0 badge at bottom */}
        <InterfaceBadge x={AGENT2_X + AGENT2_W / 2 - BADGE_W / 2} y={AGENT2_Y + AGENT2_H - 8} label="eth0" />
        <StatusDot
          x={AGENT2_X + AGENT2_W - STATUS_DOT_OFFSET_X}
          y={AGENT2_Y + STATUS_DOT_OFFSET_Y}
          detected={kubevirtDetected}
          healthy={kubevirtHealthy}
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
          fill={k3sDetected ? NODE_FILL : NODE_FILL_INACTIVE}
          stroke={k3sDetected ? NODE_STROKE : NODE_STROKE_INACTIVE}
          strokeWidth={NODE_STROKE_WIDTH}
          strokeDasharray={k3sDetected ? 'none' : DASHED_PATTERN}
          filter={`url(#${svgId}-nodeShadow)`}
        />
        {/* eth0 badge at top-right */}
        <InterfaceBadge x={K3S_X + K3S_W - BADGE_W - 4} y={K3S_Y + 2} label="eth0" />
        {/* eth1 badge at left side */}
        <InterfaceBadge x={K3S_X + 2} y={K3S_Y + K3S_H / 2 - BADGE_H / 2} label="eth1" isEth1 />
        <text
          x={K3S_X + K3S_W / 2 + 4}
          y={K3S_Y + 26}
          textAnchor="middle"
          fill={k3sDetected ? TEXT_PRIMARY : TEXT_MUTED}
          fontSize={FONT_SIZE_TITLE}
          fontWeight="600"
        >
          {t('tenantTopology.k3sPod', 'K3s Server Pod')}
        </text>
        <StatusDot
          x={K3S_X + K3S_W - STATUS_DOT_OFFSET_X}
          y={K3S_Y + STATUS_DOT_OFFSET_Y}
          detected={k3sDetected}
          healthy={k3sHealthy}
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
          fill={kubeflexDetected ? KUBEFLEX_FILL : NODE_FILL_INACTIVE}
          stroke={kubeflexDetected ? KUBEFLEX_STROKE : NODE_STROKE_INACTIVE}
          strokeWidth={NODE_STROKE_WIDTH}
          strokeDasharray={kubeflexDetected ? 'none' : DASHED_PATTERN}
          filter={`url(#${svgId}-nodeShadow)`}
        />
        <text
          x={KUBEFLEX_X + KUBEFLEX_W / 2}
          y={KUBEFLEX_Y + 10}
          textAnchor="middle"
          fill={kubeflexDetected ? TEXT_PRIMARY : TEXT_MUTED}
          fontSize={FONT_SIZE_TITLE}
          fontWeight="700"
        >
          {t('tenantTopology.kubeflexController', 'KubeFlex Controller')}
        </text>
        <StatusDot
          x={KUBEFLEX_X + KUBEFLEX_W - STATUS_DOT_OFFSET_X}
          y={KUBEFLEX_Y + STATUS_DOT_OFFSET_Y}
          detected={kubeflexDetected}
          healthy={kubeflexHealthy}
        />
      </motion.g>

      {/* OVN status dot on L2 UDN zone */}
      <StatusDot
        x={L2_UDN_X + L2_UDN_W - STATUS_DOT_OFFSET_X}
        y={L2_UDN_Y + STATUS_DOT_OFFSET_Y}
        detected={ovnDetected}
        healthy={ovnHealthy}
      />

      {/* OVN status dot on L3 UDN zone */}
      <StatusDot
        x={L3_UDN_X + L3_UDN_W - STATUS_DOT_OFFSET_X}
        y={L3_UDN_Y + STATUS_DOT_OFFSET_Y}
        detected={ovnDetected}
        healthy={ovnHealthy}
      />
    </>
  )
}
