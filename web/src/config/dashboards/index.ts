/**
 * Dashboard Configuration Registry
 *
 * Central registry for all unified dashboard configurations.
 */

import type { UnifiedDashboardConfig, DashboardConfigRegistry } from '../../lib/unified/types'
import { mainDashboardConfig } from './main'

/**
 * Registry of all unified dashboard configurations
 */
export const DASHBOARD_CONFIGS: DashboardConfigRegistry = {
  main: mainDashboardConfig,
}

/**
 * Get a dashboard configuration by ID
 */
export function getDashboardConfig(dashboardId: string): UnifiedDashboardConfig | undefined {
  return DASHBOARD_CONFIGS[dashboardId]
}

/**
 * Check if a dashboard ID has a unified configuration
 */
export function hasUnifiedDashboardConfig(dashboardId: string): boolean {
  return dashboardId in DASHBOARD_CONFIGS
}

/**
 * Get all registered dashboard IDs
 */
export function getUnifiedDashboardIds(): string[] {
  return Object.keys(DASHBOARD_CONFIGS)
}

// Re-export individual configs
export { mainDashboardConfig }
