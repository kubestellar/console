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

/**
 * #6749-C (Copilot on PR #6746) — Upper bound (chars) on the total
 * code-text length above which we skip the deep structural dedup check
 * in `registerDynamicCard`. Serializing and comparing two ~200 KB
 * `compiledCode` strings every time a card module is re-imported during
 * HMR is measurably slow; at that size the dedup optimization costs more
 * than the remount wave it was trying to prevent. Definitions larger than
 * this just re-register and accept the notify — a cheap single remount
 * beats an expensive JSON.stringify × 2 on every hot-reload.
 */
const DEDUP_MAX_CODE_LEN = 10_000

/**
 * #6749-C — Build a cheap structural fingerprint for dedup comparison.
 * Uses primitive fields and the length of `sourceCode`/`compiledCode`
 * instead of the full strings. A collision here only means we run the
 * full JSON.stringify compare as a second pass — it does not cause a
 * wrong-answer, only an extra check.
 */
function cheapFingerprint(def: DynamicCardDefinition): string {
  // `def as unknown as Record<string, unknown>` so we can read the
  // known optional fields without narrowing the public type.
  const rec = def as unknown as Record<string, unknown>
  const src = typeof rec.sourceCode === 'string' ? (rec.sourceCode as string).length : 0
  const compiled = typeof rec.compiledCode === 'string' ? (rec.compiledCode as string).length : 0
  return `${def.id}|${src}|${compiled}`
}

/** Register a dynamic card definition.
 *
 * #6712 — Id-based dedup: if a definition with the same id is already
 * registered AND structurally identical, skip the notifyListeners() call.
 * During HMR, modules that register cards at the top level can otherwise
 * trigger a cascade of listener fires that remount every consumer of the
 * registry even though nothing changed.
 *
 * #6749-C — Avoid the O(N) JSON.stringify compare on large definitions
 * (Dynamic cards can carry compiled output in the hundreds of KB). First
 * compare a cheap primitive fingerprint; only fall through to the full
 * structural compare on fingerprint match AND when the payload is small
 * enough that JSON.stringify × 2 is cheap. Oversized definitions just
 * re-register unconditionally.
 */
export function registerDynamicCard(def: DynamicCardDefinition): void {
  const existing = registry.get(def.id)
  if (existing) {
    const existingFp = cheapFingerprint(existing)
    const defFp = cheapFingerprint(def)
    if (existingFp === defFp) {
      // Fingerprint match. Decide whether to run the full compare.
      const rec = def as unknown as Record<string, unknown>
      const compiledLen = typeof rec.compiledCode === 'string' ? (rec.compiledCode as string).length : 0
      const sourceLen = typeof rec.sourceCode === 'string' ? (rec.sourceCode as string).length : 0
      const totalLen = compiledLen + sourceLen
      if (totalLen <= DEDUP_MAX_CODE_LEN) {
        // Small enough — do the strict compare to confirm true equality.
        if (JSON.stringify(existing) === JSON.stringify(def)) {
          return // No-op replace — avoid remount wave on HMR.
        }
      }
      // Large definitions: skip deep compare entirely and fall through
      // to register + notify. A single remount is cheaper than the
      // double stringify.
    }
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
