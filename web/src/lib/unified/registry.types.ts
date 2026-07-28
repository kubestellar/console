/**
 * Registry types and component prop types for the unified component system.
 *
 * Extracted from types.ts as part of the type-family split (tracked by #15790).
 * The root types.ts re-exports everything from here so all existing import
 * paths continue to work.
 */

import type React from 'react'
import type { UnifiedCardConfig, CardColumnConfig } from './card.types'
import type { UnifiedStatBlockConfig, UnifiedStatsSectionConfig } from './stat.types'
import type { UnifiedDashboardConfig } from './dashboard.types'
import type { StatBlockValue } from '../stats/types'

// ============================================================================
// Registry Types
// ============================================================================

/**
 * Card configuration registry
 */
export type CardConfigRegistry = Record<string, UnifiedCardConfig>

/**
 * Stats configuration registry
 */
export type StatsConfigRegistry = Record<string, UnifiedStatsSectionConfig>

/**
 * Dashboard configuration registry
 */
export type DashboardConfigRegistry = Record<string, UnifiedDashboardConfig>

/**
 * Renderer function type
 */
export type RendererFunction<T = unknown> = (
  value: T,
  item: Record<string, unknown>,
  column: CardColumnConfig
) => React.ReactNode

/**
 * Renderer registry
 */
export type RendererRegistry = Record<string, RendererFunction>

/**
 * Data hook type
 */
export type DataHookFunction = (
  params?: Record<string, unknown>
) => {
  data: unknown[] | unknown | undefined
  isLoading: boolean
  error: Error | null
  refetch?: () => void
  isDemoData?: boolean
}

/**
 * Data hook registry
 */
export type DataHookRegistry = Record<string, DataHookFunction>

// ============================================================================
// Component Props Types
// ============================================================================

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
