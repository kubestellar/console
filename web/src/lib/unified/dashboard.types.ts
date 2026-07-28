/**
 * UnifiedDashboard type definitions.
 *
 * Extracted from types.ts as part of the type-family split (tracked by #15790).
 * The root types.ts re-exports everything from here so all existing import
 * paths continue to work.
 */

import type { UnifiedStatsSectionConfig } from './stat.types'

// ============================================================================
// UnifiedDashboard Types
// ============================================================================

/**
 * Complete dashboard configuration
 */
export interface UnifiedDashboardConfig {
  /** Unique dashboard ID */
  id: string
  /** Display name */
  name: string
  /** Subtitle/description */
  subtitle?: string
  /** Route path */
  route?: string

  // Stats configuration
  /** Stats section type */
  statsType?: string
  /** Custom stats config */
  stats?: UnifiedStatsSectionConfig
  /** Custom value resolver function name */
  statsValueResolver?: string

  // Cards configuration
  /** Default cards for this dashboard */
  cards: DashboardCardPlacement[]
  /** Available card types for add menu */
  availableCardTypes?: string[]

  // Tab configuration (optional — when present, cards are organized into tabs)
  /** Dashboard tabs — each tab has its own set of cards */
  tabs?: DashboardTab[]

  // Features
  features?: DashboardFeatures

  // Persistence
  /** Storage key for card positions */
  storageKey?: string

  // White-label project context
  /**
   * Project contexts this dashboard belongs to.
   * ['*'] or omitted = universal (visible to all projects)
   * ['kubestellar'] = only visible when CONSOLE_PROJECT=kubestellar
   */
  projects?: string[]
}

export interface DashboardTab {
  /** Unique tab ID */
  id: string
  /** Display label */
  label: string
  /** Icon provider key (rendered via AgentIcon or lucide) */
  icon?: string
  /** Cards for this tab */
  cards: DashboardCardPlacement[]
  /** Whether this tab is disabled (e.g., platform not detected) */
  disabled?: boolean
  /** Install URL shown when tab is disabled */
  installUrl?: string
}

export interface DashboardCardPlacement {
  /** Unique placement ID */
  id: string
  /** Card type (references UnifiedCardConfig.type) */
  cardType: string
  /** Instance-specific config overrides */
  config?: Record<string, unknown>
  /** Title override */
  title?: string
  /** Grid position */
  position: {
    /** Width in grid columns (3-12) */
    w: number
    /** Height in grid rows */
    h: number
    /** X position (optional, for absolute positioning) */
    x?: number
    /** Y position (optional, for absolute positioning) */
    y?: number
  }
}

export interface DashboardFeatures {
  /** Enable drag-and-drop */
  dragDrop?: boolean
  /** Enable auto-refresh */
  autoRefresh?: boolean
  /** Auto-refresh interval in ms */
  autoRefreshInterval?: number
  /** Show add card button */
  addCard?: boolean
  /** Show templates button */
  templates?: boolean
  /** Show recommendations */
  recommendations?: boolean
  /** Show AI mission suggestions */
  missionSuggestions?: boolean
  /** Show floating action buttons */
  floatingActions?: boolean
  /** Enable card sections */
  cardSections?: boolean
}
