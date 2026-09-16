/**
 * Card Definition Registry - Store card definitions
 */

import { CardDefinition } from '../types'

const cardDefinitionRegistry = new Map<string, CardDefinition>()

export function registerCard(definition: CardDefinition) {
  cardDefinitionRegistry.set(definition.type, definition)
}

export function getCardDefinition(type: string): CardDefinition | undefined {
  return cardDefinitionRegistry.get(type)
}

export function getAllCardDefinitions(): CardDefinition[] {
  return Array.from(cardDefinitionRegistry.values())
}

// ============================================================================
// YAML Parser (future implementation)
// ============================================================================

export function parseCardYAML(_yaml: string): CardDefinition {
  // YAML parsing intentionally not implemented - use registerCard() with JS objects
  // If YAML config becomes a requirement, add js-yaml library and implement parser here
  throw new Error('YAML parsing not yet implemented. Use registerCard() with JS objects.')
}
