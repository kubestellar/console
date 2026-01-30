import type { StatsDefinition, StatBlockDefinition } from '../stats/types'
import {
  registerStats,
  unregisterStats,
  getStatsDefinition,
} from '../stats/StatsRuntime'

/**
 * Dynamic stats registry — wraps the core stats registry
 * with persistence lifecycle and change notifications.
 *
 * Keeps track of which stat types were created dynamically
 * so they can be persisted and re-loaded on page refresh.
 */

const dynamicTypes = new Set<string>()

type Listener = () => void
const listeners = new Set<Listener>()

function notifyListeners() {
  listeners.forEach(fn => fn())
}

/** Register a dynamic stats definition (wraps core registerStats) */
export function registerDynamicStats(definition: StatsDefinition): void {
  dynamicTypes.add(definition.type)
  registerStats(definition)
  notifyListeners()
}

/** Unregister a dynamic stats definition */
export function unregisterDynamicStats(type: string): boolean {
  if (!dynamicTypes.has(type)) return false
  dynamicTypes.delete(type)
  unregisterStats(type)
  notifyListeners()
  return true
}

/** Get a dynamic stats definition */
export function getDynamicStats(type: string): StatsDefinition | undefined {
  if (!dynamicTypes.has(type)) return undefined
  return getStatsDefinition(type)
}

/** Get all dynamic stats definitions */
export function getAllDynamicStats(): StatsDefinition[] {
  return Array.from(dynamicTypes)
    .map(type => getStatsDefinition(type))
    .filter((d): d is StatsDefinition => d !== undefined)
}

/** Get all dynamic stats type identifiers */
export function getAllDynamicStatsTypes(): string[] {
  return Array.from(dynamicTypes)
}

/** Check if a stats type is dynamic */
export function isDynamicStats(type: string): boolean {
  return dynamicTypes.has(type)
}

/** Subscribe to dynamic stats changes */
export function onDynamicStatsChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Serializable format for persistence */
export interface DynamicStatsRecord {
  type: string
  title?: string
  blocks: StatBlockDefinition[]
  defaultCollapsed?: boolean
  grid?: StatsDefinition['grid']
}

/** Convert StatsDefinition to a serializable record */
export function toRecord(def: StatsDefinition): DynamicStatsRecord {
  return {
    type: def.type,
    title: def.title,
    blocks: def.blocks,
    defaultCollapsed: def.defaultCollapsed,
    grid: def.grid,
  }
}
