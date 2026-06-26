/**
 * Orbit (Recurring Maintenance) Constants
 *
 * Named constants for all orbit mission timing, thresholds, and limits.
 */

import type { OrbitCadence } from '../missions/types'

/** Hours between runs for each cadence level */
export const ORBIT_CADENCE_HOURS: Record<OrbitCadence, number> = {
  daily: 24,
  weekly: 168,
  monthly: 720,
}

/** Grace period (hours) before a mission is considered overdue */
export const ORBIT_OVERDUE_GRACE_HOURS = 4

/** Maximum number of run history entries stored per orbit mission */
export const ORBIT_MAX_HISTORY_ENTRIES = 50

/** Default cadence for new orbit missions */
export const ORBIT_DEFAULT_CADENCE: OrbitCadence = 'weekly'

/** Default dashboard name template — {project} is replaced at runtime */
export const GROUND_CONTROL_DASHBOARD_NAME_TEMPLATE = 'Ground Control — {project}'

/** How often (ms) the auto-run check scans for due orbit missions */
export const ORBIT_AUTORUN_CHECK_INTERVAL_MS = 60_000
