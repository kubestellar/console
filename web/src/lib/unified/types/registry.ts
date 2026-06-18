/**
 * Unified registry type definitions.
 */

import type { CardColumnConfig, UnifiedCardConfig } from './card'
import type { UnifiedStatsSectionConfig } from './stats'
import type { UnifiedDashboardConfig } from './dashboard'

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
