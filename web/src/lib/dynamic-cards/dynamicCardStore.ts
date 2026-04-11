import type { DynamicCardDefinition } from './types'
import {
  registerDynamicCard,
  getAllDynamicCards,
  unregisterDynamicCard,
  clearDynamicCards,
} from './dynamicCardRegistry'
import { validateDynamicCardDefinition } from './validator'

const STORAGE_KEY = 'kc-dynamic-cards'

/** Result of an import operation, surfaced to the UI so invalid
 *  entries can be displayed back to the user. */
export interface ImportResult {
  /** Number of definitions successfully registered. */
  count: number
  /** Entries that failed validation, with an error message each. */
  invalid: Array<{ index: number; error: string }>
}

/**
 * Load dynamic cards from localStorage and register them.
 *
 * #6681 — Previously this only iterated stored entries and called
 * registerDynamicCard for each, so entries that had been removed from
 * localStorage since the last load were left stuck in the in-memory
 * registry. We now perform an atomic replace: clear the registry and
 * re-register from storage so removals propagate on reload.
 *
 * #6679 — Each entry is validated before registration; invalid entries
 * are dropped with a console warning so a single corrupt card cannot
 * prevent the rest from loading and a malicious stored definition cannot
 * register itself by bypassing schema checks.
 */
export function loadDynamicCards(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      // Storage is empty — wipe the in-memory registry so a removed
      // last-entry reconciles the same way multi-entry removals do.
      clearDynamicCards()
      return
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      console.warn('[DynamicCardStore] Stored value is not an array; ignoring')
      return
    }
    // Atomic replace: clear then re-register validated entries from storage.
    clearDynamicCards()
    parsed.forEach((entry, i) => {
      const result = validateDynamicCardDefinition(entry)
      if (result.valid && result.value) {
        registerDynamicCard(result.value)
      } else {
        console.warn(
          `[DynamicCardStore] Dropping invalid stored card at index ${i}: ${result.error}`,
        )
      }
    })
  } catch (err) {
    console.error('[DynamicCardStore] Failed to load from localStorage:', err)
  }
}

/** Save all registered dynamic cards to localStorage */
export function saveDynamicCards(): void {
  try {
    const defs = getAllDynamicCards()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defs))
  } catch (err) {
    console.error('[DynamicCardStore] Failed to save to localStorage:', err)
  }
}

/** Save a single card (register + persist).
 *  Validates the definition before registration — throws on invalid input. */
export function saveDynamicCard(def: DynamicCardDefinition): void {
  const result = validateDynamicCardDefinition(def)
  if (!result.valid || !result.value) {
    throw new Error(`Invalid dynamic card definition: ${result.error}`)
  }
  registerDynamicCard(result.value)
  saveDynamicCards()
}

/** Delete a card (unregister + persist) */
export function deleteDynamicCard(id: string): boolean {
  const result = unregisterDynamicCard(id)
  if (result) saveDynamicCards()
  return result
}

/** Export all dynamic cards as JSON string */
export function exportDynamicCards(): string {
  return JSON.stringify(getAllDynamicCards(), null, 2)
}

/** Import dynamic cards from JSON string.
 *  Each entry is schema-validated; invalid entries are reported in
 *  `invalid` so the UI can surface them to the user. */
export function importDynamicCards(json: string): ImportResult {
  const result: ImportResult = { count: 0, invalid: [] }
  try {
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) {
      result.invalid.push({ index: -1, error: 'Top-level value is not an array' })
      return result
    }
    parsed.forEach((entry, i) => {
      const v = validateDynamicCardDefinition(entry)
      if (v.valid && v.value) {
        registerDynamicCard(v.value)
        result.count++
      } else {
        result.invalid.push({ index: i, error: v.error ?? 'Unknown validation error' })
      }
    })
    saveDynamicCards()
    return result
  } catch (err) {
    console.error('[DynamicCardStore] Failed to import:', err)
    const message = err instanceof Error ? err.message : String(err)
    result.invalid.push({ index: -1, error: `Parse error: ${message}` })
    return result
  }
}
