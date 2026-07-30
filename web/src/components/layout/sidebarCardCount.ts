import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export function getSidebarCardCount(config?: UnifiedDashboardConfig): number | null {
  if (!config) return null

  if (Array.isArray(config.cards) && config.cards.length > 0) {
    return config.cards.length
  }

  const firstTab = Array.isArray(config.tabs) ? config.tabs[0] : undefined
  if (firstTab && Array.isArray(firstTab.cards)) {
    return firstTab.cards.length
  }

  return Array.isArray(config.cards) ? config.cards.length : 0
}
