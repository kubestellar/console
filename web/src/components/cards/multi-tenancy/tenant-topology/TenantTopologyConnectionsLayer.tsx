import { motion } from 'framer-motion'
import type { ConnectionDef } from './TenantTopologyConnections'
import { FlowParticle, ThroughputLabel } from './TenantTopologySubParts'
import {
  CONNECTION_STROKE_WIDTH,
  DASHED_PATTERN,
  L2_UDN_CONNECTION_COLOR,
  L3_UDN_CONNECTION_COLOR,
  TEXT_MUTED,
} from './tenantTopology.constants'

interface TenantTopologyConnectionsLayerProps {
  /** Unique prefix for SVG defs IDs to prevent collisions with multiple instances */
  svgId: string
  /** Connections to render as paths, animated particles, and throughput labels */
  connections: ConnectionDef[]
}

/**
 * Layer 2 of the topology SVG: the animated bidirectional connection paths
 * between components, the flow particles that travel along them, and the
 * ingress/egress throughput labels.
 */
export function TenantTopologyConnectionsLayer({ svgId, connections }: TenantTopologyConnectionsLayerProps) {
  return (
    <>
      {/* ================================================================
          Layer 2: Connection lines (all bidirectional)
          ================================================================ */}
      {(connections || []).map((conn) => {
        const isGreen = conn.color === L2_UDN_CONNECTION_COLOR
        const isBlue = conn.color === L3_UDN_CONNECTION_COLOR
        const markerEnd = isGreen ? `url(#${svgId}-arrowGreen)` : isBlue ? `url(#${svgId}-arrowBlue)` : `url(#${svgId}-arrowDark)`
        const markerStart = isGreen ? `url(#${svgId}-arrowGreenReverse)` : isBlue ? `url(#${svgId}-arrowBlueReverse)` : `url(#${svgId}-arrowDarkReverse)`

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
    </>
  )
}
