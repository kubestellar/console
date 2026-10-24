/**
 * Card Configuration Registry
 *
 * Adding a new card? Update ALL of these:
 *
 * 1. Create config:       src/config/cards/<card-name>.ts
 * 2. Register config:     src/config/cards/cardConfigRegistry.ts (import + add to CARD_CONFIGS)
 *    Optionally re-export: src/config/cards/cardConfigExports.ts
 * 3. Create component:    src/components/cards/<CardName>.tsx
 * 4. Register component:  src/components/cards/cardRegistry.ts (lazy import + add to CARD_COMPONENTS)
 * 5. Add to browse catalog: src/components/dashboard/AddCardModal.tsx (add to CARD_CATALOG)
 *    ↑ WITHOUT THIS the card won't appear in the "Add Cards" browse dialog.
 */

import type { UnifiedCardConfig, CardConfigRegistry } from '../../lib/unified/types'
import { isVisibleForProject } from '../../lib/project/context'
import { CARD_CONFIGS } from './cardConfigRegistry'
import { CARD_PROJECT_TAGS } from './cardProjectTags'

export { CARD_CONFIGS } from './cardConfigRegistry'
export { CARD_PROJECT_TAGS } from './cardProjectTags'

/**
 * Get the project tags for a card, checking both config file and fallback map.
 */
export function getCardProjectTags(cardType: string): string[] | undefined {
  const config = CARD_CONFIGS[cardType]
  if (config?.projects) return config.projects
  return CARD_PROJECT_TAGS[cardType]
}

export function getCardConfig(cardType: string): UnifiedCardConfig | undefined {
  return CARD_CONFIGS[cardType]
}

export function hasUnifiedConfig(cardType: string): boolean {
  // Use hasOwnProperty to avoid false positives from inherited Object.prototype
  // keys such as 'toString', 'constructor', '__proto__', etc.
  return Object.prototype.hasOwnProperty.call(CARD_CONFIGS, cardType)
}

export function getUnifiedCardTypes(): string[] {
  return Object.keys(CARD_CONFIGS)
}

/**
 * Get all card configs visible for the active project.
 * Checks both the config `projects` field and the CARD_PROJECT_TAGS fallback.
 */
export function getVisibleCardConfigs(): CardConfigRegistry {
  const result: CardConfigRegistry = {}
  for (const [key, config] of Object.entries(CARD_CONFIGS)) {
    const projects = config.projects || CARD_PROJECT_TAGS[key]
    if (isVisibleForProject(projects)) {
      result[key] = config
    }
  }
  return result
}

/**
 * Check if a card type (by ID) is visible for the active project.
 * Works for both config-based and component-only cards.
 */
export function isCardVisibleForProject(cardType: string): boolean {
  const projects = getCardProjectTags(cardType)
  return isVisibleForProject(projects)
}

export * from './cardConfigExports'
