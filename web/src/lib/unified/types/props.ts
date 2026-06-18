/**
 * Unified component prop type definitions.
 */

import type { StatBlockValue } from '../../stats/types'
import type { UnifiedCardConfig } from './card'
import type { UnifiedStatBlockConfig, UnifiedStatsSectionConfig } from './stats'
import type { UnifiedDashboardConfig } from './dashboard'

/**
 * Props for UnifiedCard component
 */
export interface UnifiedCardProps {
  /** Card configuration */
  config: UnifiedCardConfig
  /** Instance-specific config overrides */
  instanceConfig?: Record<string, unknown>
  /** Title override */
  title?: string
  /** Additional className */
  className?: string
  /** Override data for demo/testing purposes (bypasses data source) */
  overrideData?: unknown[]
}

/**
 * Props for UnifiedStatBlock component
 */
export interface UnifiedStatBlockProps {
  /** Stat block configuration */
  config: UnifiedStatBlockConfig
  /** Data object to resolve values from */
  data?: unknown
  /** Override value getter */
  getValue?: () => StatBlockValue
  /** Loading state */
  isLoading?: boolean
}

/**
 * Props for UnifiedStatsSection component
 */
export interface UnifiedStatsSectionProps {
  /** Stats section configuration */
  config: UnifiedStatsSectionConfig
  /** Data to resolve values from */
  data?: unknown
  /** Custom value getter by block ID */
  getStatValue?: (blockId: string) => StatBlockValue
  /** Whether data is loaded */
  hasData?: boolean
  /** Loading state */
  isLoading?: boolean
  /** Last updated timestamp */
  lastUpdated?: Date | null
  /** Additional className */
  className?: string
}

/**
 * Props for UnifiedDashboard component
 */
export interface UnifiedDashboardProps {
  /** Dashboard configuration */
  config: UnifiedDashboardConfig
  /** Stats data */
  statsData?: unknown
  /** Additional className */
  className?: string
}
