/**
 * Global upgrade state singleton.
 *
 * Lightweight pub/sub store (same pattern as demoMode.ts) so that
 * useSelfUpgrade() can publish upgrade progress and any component
 * (UpdateIndicator, Sidebar) can subscribe without a shared Context.
 */

// ============================================================================
// Types
// ============================================================================

export type UpgradePhase =
  | 'idle'
  | 'triggering'
  | 'restarting'
  | 'complete'
  | 'error'

export interface UpgradeState {
  phase: UpgradePhase
  /** Human-readable error message when phase === 'error' */
  errorMessage?: string
}

type Listener = (state: UpgradeState) => void

// ============================================================================
// Module-level singleton
// ============================================================================

const IDLE_STATE: UpgradeState = { phase: 'idle' }

let current: UpgradeState = IDLE_STATE
const listeners = new Set<Listener>()

// ============================================================================
// Public API
// ============================================================================

/** Read the current upgrade state (non-reactive — use subscribe for updates) */
export function getUpgradeState(): UpgradeState {
  return current
}

/** Update the upgrade state and notify all subscribers */
export function setUpgradeState(next: UpgradeState): void {
  current = next
  listeners.forEach((fn) => fn(current))
}

/** Subscribe to upgrade state changes. Returns an unsubscribe function. */
export function subscribeUpgradeState(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
