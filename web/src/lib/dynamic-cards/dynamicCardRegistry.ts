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

/** Register a dynamic card definition.
 *
 * #6712 — Id-based dedup: if a definition with the same id is already
 * registered AND structurally identical (same serialized shape), skip
 * the notifyListeners() call. During HMR, modules that register cards at
 * the top level can otherwise trigger a cascade of listener fires that
 * remount every consumer of the registry even though nothing changed.
 */
export function registerDynamicCard(def: DynamicCardDefinition): void {
  const existing = registry.get(def.id)
  if (existing && JSON.stringify(existing) === JSON.stringify(def)) {
    // No-op replace — avoid remount wave on HMR.
    return
  }
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

// #6712 — HMR self-acceptance. Without this, any module that imports this
// registry at the top level bubbles HMR updates all the way up to the app
// root, causing a full tree remount every time a dynamic card source file
// is edited. Accepting here confines HMR replacement to this module; the
// id-based dedup in registerDynamicCard then keeps listener churn low.
if (import.meta.hot) {
  import.meta.hot.accept()
}
