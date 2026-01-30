import type { DynamicCardDefinition } from './types'

/**
 * In-memory registry of dynamic card definitions.
 * Persisted to localStorage and optionally synced to backend.
 */
const registry = new Map<string, DynamicCardDefinition>()

/** Event listeners for registry changes */
type RegistryListener = () => void
const listeners = new Set<RegistryListener>()

function notifyListeners() {
  listeners.forEach(fn => fn())
}

/** Register a dynamic card definition */
export function registerDynamicCard(def: DynamicCardDefinition): void {
  registry.set(def.id, def)
  notifyListeners()
}

/** Get a dynamic card definition by ID */
export function getDynamicCard(id: string): DynamicCardDefinition | undefined {
  return registry.get(id)
}

/** Get all registered dynamic card definitions */
export function getAllDynamicCards(): DynamicCardDefinition[] {
  return Array.from(registry.values())
}

/** Unregister a dynamic card */
export function unregisterDynamicCard(id: string): boolean {
  const result = registry.delete(id)
  if (result) notifyListeners()
  return result
}

/** Check if a dynamic card is registered */
export function isDynamicCardRegistered(id: string): boolean {
  return registry.has(id)
}

/** Subscribe to registry changes */
export function onRegistryChange(listener: RegistryListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Clear all dynamic cards (for testing) */
export function clearDynamicCards(): void {
  registry.clear()
  notifyListeners()
}
