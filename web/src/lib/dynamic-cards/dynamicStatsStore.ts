import type { StatsDefinition } from '../stats/types'
import {
  registerDynamicStats,
  getAllDynamicStats,
  unregisterDynamicStats,
  clearDynamicStats,
  toRecord,
} from './dynamicStatsRegistry'
import { validateStatsDefinition } from './validator'
import type { ImportResult } from './dynamicCardStore'

const STORAGE_KEY = 'kc-dynamic-stats'

/**
 * Load dynamic stats definitions from localStorage and register them.
 *
 * #6681 — Previously additive: entries removed from storage stayed in
 * the in-memory registry. We now perform an atomic replace (clear +
 * re-register from storage) so removals propagate on reload.
 *
 * #6679 — Each entry is validated before registration; invalid entries
 * are dropped with a console warning so a single corrupt entry cannot
 * prevent the rest from loading and a malicious stored definition cannot
 * register itself by bypassing schema checks.
 */
export function loadDynamicStats(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      clearDynamicStats()
      return
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      console.warn('[DynamicStatsStore] Stored value is not an array; ignoring')
      return
    }
    // Atomic replace: clear then re-register validated entries from storage.
    clearDynamicStats()
    parsed.forEach((entry, i) => {
      const result = validateStatsDefinition(entry)
      if (result.valid && result.value) {
        registerDynamicStats(result.value)
      } else {
        console.warn(
          `[DynamicStatsStore] Dropping invalid stored stats at index ${i}: ${result.error}`,
        )
      }
    })
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

/** Save a single stats definition (register + persist).
 *  Validates before registration — throws on invalid input. */
export function saveDynamicStatsDefinition(def: StatsDefinition): void {
  const result = validateStatsDefinition(def)
  if (!result.valid || !result.value) {
    throw new Error(`Invalid dynamic stats definition: ${result.error}`)
  }
  registerDynamicStats(result.value)
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

/** Import dynamic stats from JSON string.
 *  Each entry is schema-validated; invalid entries are reported in
 *  `invalid` so the UI can surface them to the user. */
export function importDynamicStats(json: string): ImportResult {
  const result: ImportResult = { count: 0, invalid: [] }
  try {
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) {
      result.invalid.push({ index: -1, error: 'Top-level value is not an array' })
      return result
    }
    parsed.forEach((entry, i) => {
      const v = validateStatsDefinition(entry)
      if (v.valid && v.value) {
        registerDynamicStats(v.value)
        result.count++
      } else {
        result.invalid.push({ index: i, error: v.error ?? 'Unknown validation error' })
      }
    })
    saveDynamicStats()
    return result
  } catch (err) {
    console.error('[DynamicStatsStore] Failed to import:', err)
    const message = err instanceof Error ? err.message : String(err)
    result.invalid.push({ index: -1, error: `Parse error: ${message}` })
    return result
  }
}
