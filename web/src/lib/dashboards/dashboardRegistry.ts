/**
 * Dashboard + stats-value-getter registries used by DashboardRuntime.
 *
 * Split out of DashboardRuntime.tsx (issue 23019) so the plain
 * registration/lookup logic isn't bundled with the React component.
 */

import { DashboardDefinition } from './types'
import { StatBlockValue } from '../../components/ui/StatsOverview'

/** Default auto-refresh interval (ms) used when a dashboard definition doesn't override it. */
export const DASHBOARD_DEFAULT_REFRESH_MS = 30_000

// ============================================================================
// Dashboard Registry
// ============================================================================

const dashboardRegistry = new Map<string, DashboardDefinition>()

export function registerDashboard(definition: DashboardDefinition) {
  dashboardRegistry.set(definition.id, definition)
}

export function getDashboardDefinition(id: string): DashboardDefinition | undefined {
  return dashboardRegistry.get(id)
}

export function getAllDashboardDefinitions(): DashboardDefinition[] {
  return Array.from(dashboardRegistry.values())
}

// ============================================================================
// Stats Value Getter Registry
// ============================================================================

type StatsValueGetter = (blockId: string, data: unknown) => StatBlockValue
const statsValueGetterRegistry = new Map<string, StatsValueGetter>()

export function registerStatsValueGetter(statsType: string, getter: StatsValueGetter) {
  statsValueGetterRegistry.set(statsType, getter)
}

/**
 * Resolves the stat value getter for a dashboard: prefers an explicit
 * `customGetStatValue` prop, falls back to a registered getter for the
 * dashboard's stats type, and finally to a static placeholder.
 */
export function resolveStatsValueGetter(
  statsType: string | undefined,
  data: unknown,
  customGetStatValue?: (blockId: string) => StatBlockValue
): (blockId: string) => StatBlockValue {
  if (customGetStatValue) return customGetStatValue

  if (statsType) {
    const getter = statsValueGetterRegistry.get(statsType)
    if (getter) {
      return (blockId: string) => getter(blockId, data)
    }
  }

  return () => ({ value: '-', sublabel: '' })
}

// ============================================================================
// YAML Parser (future implementation)
// ============================================================================

export function parseDashboardYAML(_yaml: string): DashboardDefinition {
  // YAML parsing intentionally not implemented - use registerDashboard() with JS objects
  // If YAML config becomes a requirement, add js-yaml library and implement parser here
  throw new Error('YAML parsing not yet implemented. Use registerDashboard() with JS objects.')
}
