/**
 * UnifiedStatBlock and UnifiedStatsSection type definitions.
 *
 * Extracted from types.ts as part of the type-family split (tracked by #15790).
 * The root types.ts re-exports everything from here so all existing import
 * paths continue to work.
 */

// Re-export stat-primitive types we extend
export type {
  StatBlockColor,
  StatBlockValue,
  StatBlockConfig,
} from '../stats/types'

// ============================================================================
// UnifiedStatBlock Types
// ============================================================================

/**
 * Complete stat block configuration
 */
export interface UnifiedStatBlockConfig {
  /** Unique block ID */
  id: string
  /** Display name */
  name: string
  /** Icon name from lucide-react */
  icon: string
  /** Color variant */
  color: import('../stats/types').StatBlockColor
  /** Whether visible by default */
  visible?: boolean
  /** Display order */
  order?: number

  // Value resolution
  /** How to get the value */
  valueSource: StatValueSource
  /** Value format */
  format?: StatValueFormat
  /** Sublabel field */
  sublabelField?: string

  // Interaction
  /** Click action */
  onClick?: StatBlockAction
  /** Tooltip text */
  tooltip?: string
}

export type StatValueSource =
  | StatValueSourceField
  | StatValueSourceComputed
  | StatValueSourceHook
  | StatValueSourceAggregate

export interface StatValueSourceField {
  type: 'field'
  /** Dot-notation path to value (e.g., 'summary.healthyCount') */
  path: string
}

export interface StatValueSourceComputed {
  type: 'computed'
  /** Expression (e.g., 'filter:healthy|count', 'sum:pods') */
  expression: string
}

export interface StatValueSourceHook {
  type: 'hook'
  /** Hook name */
  hookName: string
  /** Field from hook result */
  field: string
}

export interface StatValueSourceAggregate {
  type: 'aggregate'
  /** Aggregation type */
  aggregation: 'sum' | 'count' | 'avg' | 'min' | 'max'
  /** Field to aggregate */
  field: string
  /** Filter before aggregating */
  filter?: string
}

export type StatValueFormat = 'number' | 'percentage' | 'bytes' | 'currency' | 'duration'

export interface StatBlockAction {
  /** Action type */
  type: 'drill' | 'filter' | 'navigate' | 'callback'
  /** Target (action name, filter field, or route) */
  target: string
  /** Parameters */
  params?: Record<string, string>
}

// ============================================================================
// UnifiedStatsSection Types
// ============================================================================

/**
 * Complete stats section configuration
 */
export interface UnifiedStatsSectionConfig {
  /** Section type identifier */
  type: string
  /** Section title */
  title?: string
  /** Stat blocks */
  blocks: UnifiedStatBlockConfig[]
  /** Default collapsed state */
  defaultCollapsed?: boolean
  /** Collapsible */
  collapsible?: boolean
  /** Storage key for collapsed state */
  storageKey?: string
  /** Show configure button */
  showConfigButton?: boolean
  /** Grid configuration */
  grid?: {
    columns?: number
    responsive?: {
      sm?: number
      md?: number
      lg?: number
    }
  }
}
