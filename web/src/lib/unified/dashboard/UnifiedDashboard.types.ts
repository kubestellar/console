/**
 * Shared types for the UnifiedDashboard module.
 *
 * Extracted verbatim from UnifiedDashboard.tsx so the hook and the
 * presentational sub-components can share them without a circular import.
 */

/** Card suggestion type from AddCardModal */
export interface CardSuggestion {
  type: string
  title: string
  description: string
  visualization: string
  config: Record<string, unknown>
}

/** Card type for ConfigureCardModal */
export interface ConfigurableCard {
  id: string
  card_type: string
  config: Record<string, unknown>
  title?: string
}
