import type { DynamicCardDefinition } from './types'
import {
  registerDynamicCard,
  getAllDynamicCards,
  unregisterDynamicCard,
  clearDynamicCards,
} from './dynamicCardRegistry'

const STORAGE_KEY = 'kc-dynamic-cards'

/**
 * Load dynamic cards from localStorage and register them.
 *
 * #6681 — Previously this only iterated stored entries and called
 * registerDynamicCard for each, so entries that had been removed from
 * localStorage since the last load were left stuck in the in-memory
 * registry. We now perform an atomic replace: clear the registry and
 * re-register from storage so removals propagate on reload.
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
    const defs: DynamicCardDefinition[] = JSON.parse(raw)
    // Atomic replace: clear then re-register from storage.
    clearDynamicCards()
    defs.forEach(def => registerDynamicCard(def))
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

/** Save a single card (register + persist) */
export function saveDynamicCard(def: DynamicCardDefinition): void {
  registerDynamicCard(def)
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

/** Import dynamic cards from JSON string */
export function importDynamicCards(json: string): number {
  try {
    const defs: DynamicCardDefinition[] = JSON.parse(json)
    let count = 0
    defs.forEach(def => {
      if (def.id && def.title && def.tier) {
        registerDynamicCard(def)
        count++
      }
    })
    saveDynamicCards()
    return count
  } catch (err) {
    console.error('[DynamicCardStore] Failed to import:', err)
    return 0
  }
}
