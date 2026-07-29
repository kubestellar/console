import type {
  DashboardStatsType as DashboardStatsTypeDefinition,
  StatBlockConfig as StatBlockConfigDefinition,
  StatDisplayMode as StatDisplayModeDefinition,
} from './StatsBlockDefinitions'

export type StatBlockConfig = StatBlockConfigDefinition
export type DashboardStatsType = DashboardStatsTypeDefinition
export type StatDisplayMode = StatDisplayModeDefinition

/**
 * Value and metadata for a single stat block
 */
export interface StatBlockValue {
  value: string | number
  sublabel?: string
  /** Optional machine-readable semantic value for live canary groundtruth checks. */
  groundtruthField?: string
  /** Optional semantic values when one visible card represents multiple live facts. */
  groundtruthFields?: Record<string, string | number | null | undefined>
  onClick?: () => void
  isClickable?: boolean
  /** Whether this stat uses demo/mock data (shows yellow border + badge) */
  isDemo?: boolean
  /** Raw numerator used by progress-style visualizations when the displayed value should stay different. */
  progressValue?: number
  /** For gauge/ring modes: the max value (default 100) */
  max?: number
  /** For gauge mode: threshold config */
  thresholds?: { warning: number; critical: number }
  /** Hint to the display mode picker about what modes are appropriate */
  modeHints?: StatDisplayMode[]
  /** Optional formatter for display — when value is numeric but should display as a string (e.g., "30.5 TB") */
  format?: (value: number) => string
}
