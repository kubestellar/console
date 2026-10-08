import type { StatDisplayMode } from './StatsBlockDefinitions'
import type { StatBlockValue } from './StatsOverview.types'

// Color mapping for dynamic rendering
export const COLOR_CLASSES: Record<string, string> = {
  primary: 'text-primary',
  purple: 'text-purple-400',
  green: 'text-green-400',
  orange: 'text-orange-400',
  yellow: 'text-yellow-400',
  cyan: 'text-cyan-400',
  blue: 'text-blue-400',
  red: 'text-red-400',
  gray: 'text-muted-foreground' }

// Value color mapping for specific stat types
export const VALUE_COLORS: Record<string, string> = {
  healthy: 'text-status-success',
  passing: 'text-status-success',
  deployed: 'text-status-success',
  bound: 'text-status-success',
  normal: 'text-status-info',
  unhealthy: 'text-status-error',
  warning: 'text-status-warning',
  pending: 'text-status-warning',
  unreachable: 'text-status-warning',
  critical: 'text-status-error',
  failed: 'text-status-error',
  failing: 'text-status-error',
  errors: 'text-status-error',
  issues: 'text-status-error',
  high: 'text-status-error',
  medium: 'text-status-warning',
  low: 'text-status-info',
  privileged: 'text-status-error',
  root: 'text-orange-400' }

/** Default denominator for percentage/progress visualizations. */
export const DEFAULT_PROGRESS_MAX = 100

/** Stat block IDs that represent percentage-type values (0-100) */
export const PERCENTAGE_STAT_IDS = new Set([
  'score', 'cis_score', 'nsa_score', 'pci_score', 'kubescape_score',
  'encryption_score', 'cpu_util', 'memory_util',
  'gdpr_score', 'hipaa_score', 'soc2_score',
])

/** Display modes that require a real denominator to scale correctly. */
export const PROGRESS_DISPLAY_MODES = new Set<StatDisplayMode>([
  'gauge',
  'ring-3',
  'mini-bar',
  'stacked-bar',
  'horseshoe',
])

export function hasExplicitProgressMax(data: StatBlockValue): data is StatBlockValue & { max: number } {
  return typeof data.max === 'number' && Number.isFinite(data.max) && data.max >= 0
}

export function isPercentageLikeStat(blockId: string, value: string | number): boolean {
  return PERCENTAGE_STAT_IDS.has(blockId) || String(value).includes('%')
}

export function supportsProgressScale(blockId: string, data: StatBlockValue): boolean {
  return hasExplicitProgressMax(data) || isPercentageLikeStat(blockId, data.value)
}

/** Determine which display modes are appropriate for a given stat block */
export function getAvailableModes(blockId: string, data: StatBlockValue): StatDisplayMode[] {
  if (data.modeHints && data.modeHints.length > 0) return data.modeHints

  const modes: StatDisplayMode[] = ['numeric']
  const numericValue = typeof data.value === 'number'
    ? data.value
    : parseFloat(String(data.value))
  const canScaleProgress = supportsProgressScale(blockId, data)

  if (!isNaN(numericValue)) {
    modes.push('sparkline', 'trend', 'heatmap')
    if (canScaleProgress) {
      modes.push('mini-bar', 'stacked-bar', 'gauge', 'horseshoe', 'ring-3')
    }
  }
  return modes
}

/** Height of the mini-bar progress bar in pixels */
export const MINI_BAR_HEIGHT_PX = 6

/** Size of the circular ring indicator in pixels */
export const RING_SIZE_PX = 64

/** Stroke width of the circular ring indicator in pixels */
export const RING_STROKE_PX = 6

/** Size of the horseshoe gauge in pixels */
export const HORSESHOE_SIZE_PX = 64

/** Stroke width of the horseshoe gauge */
export const HORSESHOE_STROKE_PX = 6

/** Angle span of the horseshoe arc in degrees (270 = 3/4 circle) */
export const HORSESHOE_ARC_DEG = 270

/** Heatmap intensity thresholds — maps value ranges to opacity */
const HEATMAP_THRESHOLDS = [
  { max: 0, opacity: 0 },
  { max: 1, opacity: 0.15 },
  { max: 5, opacity: 0.3 },
  { max: 10, opacity: 0.5 },
  { max: 25, opacity: 0.7 },
  { max: 50, opacity: 0.85 },
  { max: Infinity, opacity: 1.0 },
]

/** Minimum heatmap opacity where text should switch to high-contrast classes */
export const HEATMAP_CONTRAST_OPACITY_THRESHOLD = 0.5

/** Foreground classes used on high-intensity heatmap cards for readability */
export const HEATMAP_HIGH_CONTRAST_TEXT_CLASSES = {
  icon: 'text-white/90 drop-shadow-xs',
  label: 'text-white/90 drop-shadow-xs',
  value: 'text-white drop-shadow-xs',
  sublabel: 'text-white/80 drop-shadow-xs',
} as const

/** Get heatmap opacity for a value */
export function getHeatmapOpacity(value: number): number {
  for (const t of HEATMAP_THRESHOLDS) {
    if (value <= t.max) return t.opacity
  }
  return 1.0
}
