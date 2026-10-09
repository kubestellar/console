/**
 * Helpers for building stats definitions declaratively.
 */

import type { StatsDefinition, StatBlockDefinition } from './types'

// ============================================================================
// YAML Parser (future implementation)
// ============================================================================

export function parseStatsYAML(_yaml: string): StatsDefinition {
  // YAML parsing intentionally not implemented - use registerStats() with JS objects
  // If YAML config becomes a requirement, add js-yaml library and implement parser here
  throw new Error('YAML parsing not yet implemented. Use registerStats() with JS objects.')
}

// ============================================================================
// Preset Helpers
// ============================================================================

/**
 * Create a simple stat block definition
 */
export function createStatBlock(
  id: string,
  label: string,
  icon: string,
  color: StatBlockDefinition['color'],
  options?: Partial<StatBlockDefinition>
): StatBlockDefinition {
  return {
    id,
    label,
    icon,
    color,
    visible: true,
    ...options }
}

/**
 * Create a stats definition from blocks
 */
export function createStatsDefinition(
  type: string,
  blocks: StatBlockDefinition[],
  options?: Partial<StatsDefinition>
): StatsDefinition {
  return {
    type,
    blocks,
    ...options }
}
