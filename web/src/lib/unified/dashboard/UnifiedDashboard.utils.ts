/**
 * Pure helpers for UnifiedDashboard.
 *
 * Extracted verbatim from UnifiedDashboard.tsx (#22979).
 */

import type { UnifiedDashboardConfig, DashboardCardPlacement } from '../types'

/** localStorage slot helpers for per-tab card placements (#6749-A). */
export const TAB_SLOT_SUFFIX = '::cards'

export function tabSlotPrefix(storageKey: string): string {
  return `${storageKey}::tab::`
}

export function tabCardsSlot(storageKey: string, tabId: string): string {
  return `${storageKey}::tab::${tabId}${TAB_SLOT_SUFFIX}`
}

/**
 * Check if the dashboard layout differs from the config defaults.
 *
 * #9383 — When `hasTabs` is true the flat `cards` array is irrelevant;
 * customization lives in `tabCards`. Compare each tab's current placements
 * against the defaults from `config.tabs`.
 */
export function computeIsCustomized(
  config: UnifiedDashboardConfig,
  hasTabs: boolean,
  cards: DashboardCardPlacement[],
  tabCards: Record<string, DashboardCardPlacement[]>
): boolean {
  if (hasTabs) {
    return (config.tabs ?? []).some((tab) => {
      const current = tabCards[tab.id] ?? []
      const defaults = tab.cards ?? []
      if (current.length !== defaults.length) return true
      return current.some((card, i) => {
        const defaultCard = defaults[i]
        return (
          card.id !== defaultCard?.id ||
          card.cardType !== defaultCard?.cardType ||
          card.position?.w !== defaultCard?.position?.w ||
          card.position?.h !== defaultCard?.position?.h
        )
      })
    })
  }
  if (cards.length !== config.cards.length) return true
  return cards.some((card, i) => {
    const defaultCard = config.cards[i]
    return (
      card.id !== defaultCard?.id ||
      card.cardType !== defaultCard?.cardType ||
      card.position?.w !== defaultCard?.position?.w ||
      card.position?.h !== defaultCard?.position?.h
    )
  })
}
