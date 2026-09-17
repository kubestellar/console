import type { ConnectionDef } from './TenantTopologyParts'
import {
  L2_UDN_CONNECTION_COLOR,
  L3_UDN_CONNECTION_COLOR,
  DEFAULT_NET_CONNECTION_COLOR,
} from './tenantTopology.constants'

interface TenantTopologyDefsProps {
  /** Unique prefix for SVG defs IDs to prevent collisions with multiple instances */
  svgId: string
  /** Connection paths rendered as invisible path references for offset-path animation */
  connections: ConnectionDef[]
}

/**
 * SVG `<defs>` block: glow/shadow filters, invisible path references used by
 * animated flow particles, and directional arrowhead markers for each
 * connection color.
 */
export function TenantTopologyDefs({ svgId, connections }: TenantTopologyDefsProps) {
  return (
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
        <path d="M 0 0 L 4 2 L 0 4 Z" fill={L3_UDN_CONNECTION_COLOR} opacity={0.7} />
      </marker>
      <marker id={`${svgId}-arrowBlueReverse`} markerWidth="4" markerHeight="4" refX="1" refY="2" orient="auto-start-reverse">
        <path d="M 0 0 L 4 2 L 0 4 Z" fill={L3_UDN_CONNECTION_COLOR} opacity={0.7} />
      </marker>

      <marker id={`${svgId}-arrowGreen`} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
        <path d="M 0 0 L 4 2 L 0 4 Z" fill={L2_UDN_CONNECTION_COLOR} opacity={0.7} />
      </marker>
      <marker id={`${svgId}-arrowGreenReverse`} markerWidth="4" markerHeight="4" refX="1" refY="2" orient="auto-start-reverse">
        <path d="M 0 0 L 4 2 L 0 4 Z" fill={L2_UDN_CONNECTION_COLOR} opacity={0.7} />
      </marker>

      <marker id={`${svgId}-arrowDark`} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
        <path d="M 0 0 L 4 2 L 0 4 Z" fill={DEFAULT_NET_CONNECTION_COLOR} opacity={0.7} />
      </marker>
      <marker id={`${svgId}-arrowDarkReverse`} markerWidth="4" markerHeight="4" refX="1" refY="2" orient="auto-start-reverse">
        <path d="M 0 0 L 4 2 L 0 4 Z" fill={DEFAULT_NET_CONNECTION_COLOR} opacity={0.7} />
      </marker>
    </defs>
  )
}
