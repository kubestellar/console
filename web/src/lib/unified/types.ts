/**
 * Unified Component Types — barrel re-export.
 *
 * All type definitions have been split into focused sub-files (tracked by #15790):
 *   - card.types.ts      — UnifiedCard and all supporting card types
 *   - stat.types.ts      — UnifiedStatBlock / UnifiedStatsSection types
 *   - dashboard.types.ts — UnifiedDashboard types
 *   - registry.types.ts  — Registry types and component prop types
 *
 * Every `from '@/lib/unified/types'` import continues to resolve correctly.
 */

export type * from './card.types'
export type * from './stat.types'
export type * from './dashboard.types'
export type * from './registry.types'
