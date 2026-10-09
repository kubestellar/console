/**
 * Stats and value-getter registries used by StatsRuntime.
 */

import type { StatsDefinition, StatValueGetter } from './types'

// ============================================================================
// Stats Registry
// ============================================================================

const statsRegistry = new Map<string, StatsDefinition>()

export function registerStats(definition: StatsDefinition) {
  statsRegistry.set(definition.type, definition)
}

export function getStatsDefinition(type: string): StatsDefinition | undefined {
  return statsRegistry.get(type)
}

export function getAllStatsDefinitions(): StatsDefinition[] {
  return Array.from(statsRegistry.values())
}

/** Unregister a stats definition */
export function unregisterStats(type: string): boolean {
  const result = statsRegistry.delete(type)
  if (result) valueGetterRegistry.delete(type)
  return result
}

/** Get all registered stats type identifiers */
export function getAllStatsTypes(): string[] {
  return Array.from(statsRegistry.keys())
}

// ============================================================================
// Value Getter Registry
// ============================================================================

const valueGetterRegistry = new Map<string, StatValueGetter>()

export function registerStatValueGetter(statsType: string, getter: StatValueGetter) {
  valueGetterRegistry.set(statsType, getter)
}

export function getStatValueGetter(statsType: string): StatValueGetter | undefined {
  return valueGetterRegistry.get(statsType)
}
