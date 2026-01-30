import type { StatsDefinition } from '../stats/types'
import {
  registerDynamicStats,
  getAllDynamicStats,
  unregisterDynamicStats,
  toRecord,
} from './dynamicStatsRegistry'

const STORAGE_KEY = 'kc-dynamic-stats'

/** Load dynamic stats definitions from localStorage and register them */
export function loadDynamicStats(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const defs: StatsDefinition[] = JSON.parse(raw)
    defs.forEach(def => registerDynamicStats(def))
  } catch (err) {
    console.error('[DynamicStatsStore] Failed to load from localStorage:', err)
  }
}

/** Save all registered dynamic stats to localStorage */
export function saveDynamicStats(): void {
  try {
    const defs = getAllDynamicStats().map(toRecord)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defs))
  } catch (err) {
    console.error('[DynamicStatsStore] Failed to save to localStorage:', err)
  }
}

/** Save a single stats definition (register + persist) */
export function saveDynamicStatsDefinition(def: StatsDefinition): void {
  registerDynamicStats(def)
  saveDynamicStats()
}

/** Delete a dynamic stats definition (unregister + persist) */
export function deleteDynamicStatsDefinition(type: string): boolean {
  const result = unregisterDynamicStats(type)
  if (result) saveDynamicStats()
  return result
}

/** Export all dynamic stats as JSON string */
export function exportDynamicStats(): string {
  return JSON.stringify(getAllDynamicStats().map(toRecord), null, 2)
}

/** Import dynamic stats from JSON string */
export function importDynamicStats(json: string): number {
  try {
    const defs: StatsDefinition[] = JSON.parse(json)
    let count = 0
    defs.forEach(def => {
      if (def.type && def.blocks && Array.isArray(def.blocks)) {
        registerDynamicStats(def)
        count++
      }
    })
    saveDynamicStats()
    return count
  } catch (err) {
    console.error('[DynamicStatsStore] Failed to import:', err)
    return 0
  }
}
