/**
 * Shared chart color constants for visualization components.
 *
 * Charting libraries (echarts, canvas) require raw hex values —
 * Tailwind classes don't work — so we centralize them here as named
 * constants to keep the codebase consistent and satisfy the ui-ux-standard
 * ratchet.
 */

// ── Base Tailwind-equivalent palette ─────────────────────────────────────────
// Individual named colors referenced by semantic groups below.

/** Tailwind purple-600 */
export const PURPLE_600 = '#9333ea'
/** Tailwind blue-500 */
export const BLUE_500 = '#3b82f6'
/** Tailwind emerald-500 / green-500 */
export const GREEN_500 = '#10b981'
/** Tailwind amber-500 */
export const AMBER_500 = '#f59e0b'
/** Tailwind red-500 */
export const RED_500 = '#ef4444'
/** Tailwind purple-500 */
export const PURPLE_500 = '#8b5cf6'
/** Tailwind cyan-500 */
export const CYAN_500 = '#06b6d4'
/** Tailwind lime-500 */
export const LIME_500 = '#84cc16'
/** Tailwind orange-500 */
export const ORANGE_500 = '#f97316'
/** Tailwind pink-500 */
export const PINK_500 = '#ec4899'
/** Tailwind teal-500 */
export const TEAL_500 = '#14b8a6'
/** Tailwind indigo-500 */
export const INDIGO_500 = '#6366f1'
/** Tailwind yellow-500 */
export const YELLOW_500 = '#eab308'
/** Tailwind green-500 (brighter variant used for "free/available" areas) */
export const GREEN_500_BRIGHT = '#22c55e'

// ── Chart palettes ───────────────────────────────────────────────────────────

/** 10-color palette for multi-series cluster charts (ClusterMetrics, etc.) */
export const CLUSTER_CHART_PALETTE: readonly string[] = [
  PURPLE_600, BLUE_500, GREEN_500, AMBER_500, RED_500,
  PURPLE_500, CYAN_500, LIME_500, ORANGE_500, PINK_500,
] as const

/** 10-color palette for cross-cluster event correlation timeline */
export const CROSS_CLUSTER_EVENT_PALETTE: readonly string[] = [
  BLUE_500, GREEN_500_BRIGHT, AMBER_500, RED_500, PURPLE_500,
  CYAN_500, PINK_500, TEAL_500, ORANGE_500, INDIGO_500,
] as const

/** 8-color palette for GPU type area series (GPUInventoryHistory) */
export const GPU_TYPE_CHART_PALETTE: readonly string[] = [
  PURPLE_600,   // purple-600
  BLUE_500,     // blue-500
  RED_500,      // red-500
  AMBER_500,    // amber-500
  CYAN_500,     // cyan-500
  PINK_500,     // pink-500
  LIME_500,     // lime-500
  PURPLE_500,   // purple-500
] as const

/** Color for the "free/available" GPU area series */
export const GPU_FREE_AREA_COLOR = GREEN_500_BRIGHT

// ── Metric-type colors (ClusterMetrics) ──────────────────────────────────────

/** CPU metric series color */
export const METRIC_CPU_COLOR = PURPLE_600
/** Memory metric series color */
export const METRIC_MEMORY_COLOR = BLUE_500
/** Pods metric series color */
export const METRIC_PODS_COLOR = GREEN_500
/** Nodes metric series color */
export const METRIC_NODES_COLOR = AMBER_500

// ── Status / threshold colors (ResourceImbalanceDetector, etc.) ──────────────

/** Bar fill for overloaded clusters (>75% usage) */
export const OVERLOADED_COLOR = RED_500
/** Bar fill for balanced clusters (30-75% usage) */
export const BALANCED_COLOR = GREEN_500_BRIGHT
/** Bar fill for underloaded clusters (<30% usage) */
export const UNDERLOADED_COLOR = BLUE_500
/** Reference-line color for the average value */
export const AVERAGE_LINE_COLOR = AMBER_500

// ── KubeBert game colors ─────────────────────────────────────────────────────

/** Unvisited tile — dark blue */
export const KUBEBERT_TILE_UNVISITED = '#1e3a5f'
/** Visited tile — Kubernetes blue */
export const KUBEBERT_TILE_VISITED = '#326ce5'
/** Target tile — bright green */
export const KUBEBERT_TILE_TARGET = '#00d4aa'
/** Player character — gold */
export const KUBEBERT_PLAYER = '#ffd700'
/** Coily enemy — red */
export const KUBEBERT_ENEMY_COILY = '#ff4444'
/** Bouncing-ball enemy — orange */
export const KUBEBERT_ENEMY_BALL = '#ff8800'
/** Game background — dark navy */
export const KUBEBERT_BG = '#0a1628'

// ── Kagent topology colors ───────────────────────────────────────────────────

/** Python runtime node color */
export const KAGENT_RUNTIME_PYTHON = '#60a5fa'
/** Go runtime node color */
export const KAGENT_RUNTIME_GO = '#34d399'
/** BYO / unknown runtime node color */
export const KAGENT_RUNTIME_BYO = '#9ca3af'
/** Agent-to-tool edge color */
export const KAGENT_EDGE_AGENT_TOOL = CYAN_500
/** Agent-to-model edge color */
export const KAGENT_EDGE_AGENT_MODEL = GREEN_500

// ── Utility ─────────────────────────────────────────────────────────────────

/** Number of hex digits per RGB channel */
const HEX_CHANNEL_LEN = 2
/** Start index of the red channel in a 7-char hex string (e.g. "#9333ea") */
const HEX_RED_START = 1
/** Start index of the green channel */
const HEX_GREEN_START = 3
/** Start index of the blue channel */
const HEX_BLUE_START = 5
/** Radix for parsing hex strings */
const HEX_RADIX = 16

/**
 * Convert a hex color to an rgba() string with the given alpha.
 * Accepts "#RRGGBB" format. Falls through to the raw hex if parsing fails.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(HEX_RED_START, HEX_RED_START + HEX_CHANNEL_LEN), HEX_RADIX)
  const g = parseInt(hex.slice(HEX_GREEN_START, HEX_GREEN_START + HEX_CHANNEL_LEN), HEX_RADIX)
  const b = parseInt(hex.slice(HEX_BLUE_START, HEX_BLUE_START + HEX_CHANNEL_LEN), HEX_RADIX)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex
  return `rgba(${r},${g},${b},${alpha})`
}
