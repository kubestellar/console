/**
 * Stats Types - Type definitions for YAML-based Stat Block Builder
 *
 * Future: stat blocks will be defined declaratively in YAML like:
 *
 * ```yaml
 * type: clusters
 * title: Cluster Stats
 *
 * blocks:
 *   - id: clusters
 *     label: Clusters
 *     icon: Server
 *     color: purple
 *     valueSource:
 *       field: clusterCount
 *     onClick:
 *       action: drill
 *       target: allClusters
 *
 *   - id: healthy
 *     label: Healthy
 *     icon: CheckCircle2
 *     color: green
 *     valueSource:
 *       field: healthyCount
 *     onClick:
 *       action: filter
 *       target: status
 *       params:
 *         value: healthy
 *
 *   - id: cpus
 *     label: CPUs
 *     icon: Cpu
 *     color: blue
 *     valueSource:
 *       field: totalCpus
 *       format: number
 *     tooltip: Total CPU cores across all clusters
 * ```
 */

// ============================================================================
// Stats Definition Types
// ============================================================================

/**
 * Complete stats definition - future YAML format
 */
export interface StatsDefinition {
  /** Stats type identifier (e.g., 'clusters', 'workloads') */
  type: string
  /** Display title for the stats section */
  title?: string
  /** Stat blocks in this definition */
  blocks: StatBlockDefinition[]
  /** Default collapsed state */
  defaultCollapsed?: boolean
  /** Grid configuration */
  grid?: {
    /** Number of columns */
    columns?: number
    /** Responsive breakpoints */
    responsive?: {
      sm?: number
      md?: number
      lg?: number
    }
  }
}

/**
 * Single stat block definition
 */
export interface StatBlockDefinition {
  /** Unique block ID */
  id: string
  /** Display label */
  label: string
  /** Icon name from lucide-react */
  icon: string
  /** Color variant */
  color: StatBlockColor
  /** Value source configuration */
  valueSource?: StatBlockValueSource
  /** Click action configuration */
  onClick?: StatBlockAction
  /** Tooltip text */
  tooltip?: string
  /** Whether visible by default */
  visible?: boolean
  /** Order index */
  order?: number
}

export type StatBlockColor =
  | 'purple'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'cyan'
  | 'gray'
  | 'indigo'

export interface StatBlockValueSource {
  /** Field in data object */
  field: string
  /** Value format */
  format?: 'number' | 'percent' | 'bytes' | 'currency' | 'duration'
  /** Suffix to add */
  suffix?: string
  /** Prefix to add */
  prefix?: string
  /** Field for sublabel */
  sublabelField?: string
}

export interface StatBlockAction {
  /** Action type */
  type: 'drill' | 'filter' | 'navigate' | 'callback'
  /** Target (drill action name, filter field, or route) */
  target: string
  /** Parameters to pass */
  params?: Record<string, string>
}

// ============================================================================
// Runtime Types
// ============================================================================

/**
 * Value returned by getStatValue function
 */
export interface StatBlockValue {
  /** Display value */
  value: string | number
  /** Sublabel below value */
  sublabel?: string
  /** Click handler */
  onClick?: () => void
  /** Whether clickable (defaults to true if onClick provided) */
  isClickable?: boolean
  /** Tooltip override */
  tooltip?: string
  /** Color override */
  color?: StatBlockColor
  /** Whether this stat uses demo/mock data */
  isDemo?: boolean
}

/**
 * Type for getStatValue function
 */
export type StatValueGetter = (blockId: string, data: unknown) => StatBlockValue

/**
 * Props for StatsRuntime component
 */
export interface StatsRuntimeProps {
  /** Stats definition (from YAML or registry) */
  definition: StatsDefinition
  /** Data to get values from */
  data?: unknown
  /** Custom value getter (if not using valueSource) */
  getStatValue?: (blockId: string) => StatBlockValue
  /** Whether data is loaded */
  hasData?: boolean
  /** Whether loading */
  isLoading?: boolean
  /** Last updated timestamp */
  lastUpdated?: Date | null
  /** Whether collapsible */
  collapsible?: boolean
  /** Default expanded state */
  defaultExpanded?: boolean
  /** Storage key for collapsed state */
  collapsedStorageKey?: string
  /** Whether to show config button */
  showConfigButton?: boolean
  /** Additional className */
  className?: string
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * User-configurable stat block (order, visibility)
 */
export interface StatBlockConfig {
  id: string
  name: string
  icon: string
  color: string
  visible: boolean
  order?: number
}

/**
 * Hook result for stats configuration
 */
export interface UseStatsConfigResult {
  /** All blocks with user configuration */
  blocks: StatBlockConfig[]
  /** Visible blocks only */
  visibleBlocks: StatBlockConfig[]
  /** Default block configuration */
  defaultBlocks: StatBlockConfig[]
  /** Save updated configuration */
  saveBlocks: (blocks: StatBlockConfig[]) => void
  /** Reset to defaults */
  resetBlocks: () => void
}

// ============================================================================
// Color Configuration
// ============================================================================

export const COLOR_CLASSES: Record<StatBlockColor, string> = {
  purple: 'text-purple-400',
  blue: 'text-blue-400',
  green: 'text-green-400',
  yellow: 'text-yellow-400',
  orange: 'text-orange-400',
  red: 'text-red-400',
  cyan: 'text-cyan-400',
  gray: 'text-gray-400',
  indigo: 'text-indigo-400',
}

export const VALUE_COLORS: Record<string, string> = {
  healthy: 'text-green-400',
  passing: 'text-green-400',
  deployed: 'text-green-400',
  bound: 'text-green-400',
  normal: 'text-blue-400',
  unhealthy: 'text-orange-400',
  warning: 'text-yellow-400',
  pending: 'text-yellow-400',
  unreachable: 'text-yellow-400',
  critical: 'text-red-400',
  failed: 'text-red-400',
  failing: 'text-red-400',
  errors: 'text-red-400',
  issues: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-blue-400',
  privileged: 'text-red-400',
  root: 'text-orange-400',
}

// ============================================================================
// Format Helpers
// ============================================================================

/**
 * Format a number with K/M suffix
 */
export function formatStatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return value.toString()
}

/**
 * Format memory/storage values
 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(1)} TB`
  }
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${bytes} B`
}

/**
 * Format percentage values
 */
export function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

/**
 * Format currency values
 */
export function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`
  }
  return `$${value.toFixed(2)}`
}

/**
 * Format duration values
 */
export function formatDuration(seconds: number): string {
  if (seconds >= 86400) {
    return `${Math.floor(seconds / 86400)}d`
  }
  if (seconds >= 3600) {
    return `${Math.floor(seconds / 3600)}h`
  }
  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)}m`
  }
  return `${seconds}s`
}

/**
 * Format value based on format type
 */
export function formatValue(
  value: number,
  format?: StatBlockValueSource['format']
): string {
  switch (format) {
    case 'number':
      return formatStatNumber(value)
    case 'percent':
      return formatPercent(value)
    case 'bytes':
      return formatBytes(value)
    case 'currency':
      return formatCurrency(value)
    case 'duration':
      return formatDuration(value)
    default:
      return String(value)
  }
}
