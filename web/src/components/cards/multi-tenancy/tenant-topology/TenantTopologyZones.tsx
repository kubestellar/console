import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { K8sIcon } from './TenantTopologyParts'
import {
  DASHED_PATTERN,
  DEFAULT_NET_CONNECTION_COLOR,
  DEFAULT_NET_LABEL_X,
  DEFAULT_NET_LABEL_Y,
  FONT_SIZE_BADGE,
  FONT_SIZE_LABEL,
  FONT_SIZE_LEGEND,
  FONT_SIZE_TENANT,
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
  TENANT_H,
  TENANT_STROKE,
  TENANT_W,
  TENANT_X,
  TENANT_Y,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  ZONE_CORNER_RADIUS,
  ZONE_STROKE_WIDTH,
} from './tenantTopology.constants'

interface TenantTopologyZonesProps {
  /** Whether OVN (Layer-2/Layer-3 UDN) is detected on the cluster */
  ovnDetected: boolean
}

/**
 * Layer 0/1 of the topology SVG: the outer tenant boundary, the Layer-2 and
 * Layer-3 UDN zone backgrounds, the namespace-1/namespace-2 containers, and
 * the "Default k8s Network" label.
 */
export function TenantTopologyZones({ ovnDetected }: TenantTopologyZonesProps) {
  const { t } = useTranslation('cards')

  return (
    <>
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
        fill={ovnDetected ? L2_UDN_FILL : 'transparent'}
        stroke={ovnDetected ? L2_UDN_STROKE : NS_STROKE}
        strokeWidth={ZONE_STROKE_WIDTH}
        strokeDasharray={ovnDetected ? 'none' : DASHED_PATTERN}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      />
      <text
        x={L2_UDN_X + L2_UDN_W / 2}
        y={L2_UDN_Y + 8}
        textAnchor="middle"
        fill={ovnDetected ? L2_UDN_CONNECTION_COLOR : TEXT_MUTED}
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
        fill={ovnDetected ? L3_UDN_FILL : 'transparent'}
        stroke={ovnDetected ? L3_UDN_STROKE : NS_STROKE}
        strokeWidth={ZONE_STROKE_WIDTH}
        strokeDasharray={ovnDetected ? 'none' : DASHED_PATTERN}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      />
      <text
        x={L3_UDN_X + L3_UDN_W / 2}
        y={L3_UDN_Y + 10}
        textAnchor="middle"
        fill={ovnDetected ? L3_UDN_CONNECTION_COLOR : TEXT_MUTED}
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
    </>
  )
}
