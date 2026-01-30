import type { DynamicCardDefinition } from './types'
import {
  registerDynamicCard,
  getAllDynamicCards,
  unregisterDynamicCard,
} from './dynamicCardRegistry'

const STORAGE_KEY = 'kc-dynamic-cards'

/** Load dynamic cards from localStorage and register them */
export function loadDynamicCards(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const defs: DynamicCardDefinition[] = JSON.parse(raw)
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
