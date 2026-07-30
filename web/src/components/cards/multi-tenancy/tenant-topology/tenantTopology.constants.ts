// ============================================================================
// SVG ViewBox & Layout Constants
// ============================================================================

/** ViewBox dimensions for landscape topology */
export const VIEWBOX_WIDTH = 240
export const VIEWBOX_HEIGHT = 160

// ============================================================================
// Node Position Constants (viewBox units)
// ============================================================================

/** Outer tenant boundary (dashed) — y pushed up to fit "Tenant 1" label above L2 UDN */
export const TENANT_X = 3
export const TENANT_Y = 4
export const TENANT_W = 185
export const TENANT_H = 153

/** Layer-2 Cluster UDN (Secondary) — top zone inside tenant */
export const L2_UDN_X = 20
export const L2_UDN_Y = 18
export const L2_UDN_W = 145
export const L2_UDN_H = 20

/** Namespace-1 container (holds two K3s Agent Pods) */
export const NS1_X = 10
export const NS1_Y = 44
export const NS1_W = 100
export const NS1_H = 70

/** Namespace-2 container (holds K3s Server Pod) */
export const NS2_X = 120
export const NS2_Y = 44
export const NS2_W = 60
export const NS2_H = 70

/** K3s Agent Pod 1 (KubeVirt) — left pod in namespace-1 */
export const AGENT1_X = 17
export const AGENT1_Y = 58
export const AGENT1_W = 40
export const AGENT1_H = 40

/** K3s Agent Pod 2 (KubeVirt) — right pod in namespace-1 */

export const AGENT2_X = 63
export const AGENT2_Y = 58
export const AGENT2_W = 40
export const AGENT2_H = 40

/** K3s Server Pod — in namespace-2 */
export const K3S_X = 127
export const K3S_Y = 58
export const K3S_W = 46
export const K3S_H = 40

/** Layer-3 UDN (Primary) — bottom zone */
export const L3_UDN_X = 10
export const L3_UDN_Y = 125
export const L3_UDN_W = 100
export const L3_UDN_H = 16

/** KubeFlex Controller node — top-right, outside tenant boundary */
export const KUBEFLEX_X = 193
export const KUBEFLEX_Y = 3
export const KUBEFLEX_W = 44
export const KUBEFLEX_H = 16

/** "Default k8s Network" label — right side between namespace-2 and KubeFlex */
export const DEFAULT_NET_LABEL_X = 178
export const DEFAULT_NET_LABEL_Y = 48

// ============================================================================
// Styling Constants
// ============================================================================

/** Rounded corner radius for nodes */
export const NODE_CORNER_RADIUS = 3

/** Rounded corner radius for zone containers */
export const ZONE_CORNER_RADIUS = 4

/** Stroke width for node borders */
export const NODE_STROKE_WIDTH = 0.8

/** Stroke width for zone borders */
export const ZONE_STROKE_WIDTH = 0.6

/** Stroke width for connection lines */
export const CONNECTION_STROKE_WIDTH = 1

/** Status dot radius */
export const STATUS_DOT_RADIUS = 2

/** Status dot offset from node top-right corner */
export const STATUS_DOT_OFFSET_X = 4
export const STATUS_DOT_OFFSET_Y = 4

/** Font sizes in viewBox units */
export const FONT_SIZE_TITLE = 3.5
export const FONT_SIZE_LABEL = 3.0
export const FONT_SIZE_BADGE = 2.3
export const FONT_SIZE_LEGEND = 2.6
export const FONT_SIZE_TENANT = 4.5
/** Font size for throughput labels on connections */
export const FONT_SIZE_THROUGHPUT = 2.2
/** Font size for sub-labels (e.g., "(KubeVirt)") */
export const FONT_SIZE_SUBLABEL = 2.3

/** Interface badge dimensions */
export const BADGE_W = 10
export const BADGE_H = 4.5
export const BADGE_CORNER_RADIUS = 1.5

/** Animation duration for pulse effect (seconds) */
export const PULSE_ANIMATION_DURATION_S = 2

/** Dash array for undetected/dashed connections */
export const DASHED_PATTERN = '2,2'

// ============================================================================
// Throughput Animation Constants
// ============================================================================

/** Maximum throughput (bytes/sec) that maps to fastest animation / largest particle. */
export const MAX_THROUGHPUT_BYTES_PER_SEC = 102400

/** Slowest particle animation duration when throughput is near zero (seconds) */
export const FLOW_DURATION_MAX_S = 3.5

/** Fastest particle animation duration at MAX_THROUGHPUT (seconds) */
export const FLOW_DURATION_MIN_S = 0.8

/** Minimum particle radius (viewBox units) for low throughput */
export const PARTICLE_RADIUS_MIN = 0.8

/** Maximum particle radius (viewBox units) for high throughput */
export const PARTICLE_RADIUS_MAX = 2.0

/** Throughput label pill base width (without rx/tx prefix) */
export const THROUGHPUT_PILL_W = 18
/** Extra width added for the rx/tx arrow prefix */
export const THROUGHPUT_PREFIX_EXTRA_W = 4
/** Full pill width when rendered with rx/tx prefix */
export const THROUGHPUT_PILL_FULL_W = THROUGHPUT_PILL_W + THROUGHPUT_PREFIX_EXTRA_W
export const THROUGHPUT_PILL_H = 4
export const THROUGHPUT_PILL_RX = 1.5

// ============================================================================
// Color Constants
// ============================================================================

/** Layer-2 UDN (secondary) — green/lime theme */
export const L2_UDN_FILL = 'rgba(74, 222, 128, 0.08)'
export const L2_UDN_STROKE = 'rgba(74, 222, 128, 0.5)'
export const L2_UDN_CONNECTION_COLOR = '#4ade80'

/** Layer-3 UDN (primary) — blue theme */
export const L3_UDN_FILL = 'rgba(96, 165, 250, 0.08)'
export const L3_UDN_STROKE = 'rgba(96, 165, 250, 0.5)'
export const L3_UDN_CONNECTION_COLOR = '#60a5fa'

/** KubeFlex controller — dark blue/teal theme */
export const KUBEFLEX_FILL = 'rgba(20, 80, 120, 0.9)'
export const KUBEFLEX_STROKE = 'rgba(59, 130, 246, 0.6)'

/** Default K8s network — medium blue theme */
export const DEFAULT_NET_CONNECTION_COLOR = '#4a90c4'

/** Component node fill */
export const NODE_FILL = 'rgba(30, 41, 59, 0.8)'
export const NODE_STROKE = 'rgba(100, 116, 139, 0.4)'
export const NODE_FILL_INACTIVE = 'rgba(30, 41, 59, 0.3)'
export const NODE_STROKE_INACTIVE = 'rgba(100, 116, 139, 0.2)'

/** Namespace container styling */
export const NS_FILL = 'rgba(148, 163, 184, 0.03)'
export const NS_STROKE = 'rgba(148, 163, 184, 0.2)'

/** Tenant outer border */
export const TENANT_STROKE = 'rgba(96, 165, 250, 0.4)'

/** Status dot colors */
export const STATUS_HEALTHY = '#22c55e'
export const STATUS_UNHEALTHY = '#ef4444'
export const STATUS_UNKNOWN = '#6b7280'

/** Text colors */
export const TEXT_PRIMARY = 'rgba(248, 250, 252, 0.9)'
export const TEXT_SECONDARY = 'rgba(148, 163, 184, 0.8)'
export const TEXT_MUTED = 'rgba(148, 163, 184, 0.5)'

/** Throughput label background */
export const THROUGHPUT_PILL_FILL = 'rgba(15, 23, 42, 0.85)'
export const THROUGHPUT_PILL_STROKE = 'rgba(100, 116, 139, 0.25)'

/** Interface badge colors matching Braulio's diagram */
export const ETH0_BADGE_FILL = 'rgba(30, 41, 59, 0.9)'
export const ETH1_BADGE_FILL = 'rgba(34, 90, 50, 0.9)'
export const ETH1_BADGE_STROKE = 'rgba(74, 222, 128, 0.4)'
