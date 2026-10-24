import { getDemoMode } from './useDemoMode'
import {
  getUserTokenUsage,
  postTokenDelta,
  TokenUsageUnauthenticatedError,
  type UserTokenUsageRecord,
} from '../lib/tokenUsageApi'
import type { TokenCategory, TokenUsageByCategory, TokenUsage } from './useTokenUsage.types'
import {
  DEFAULT_SETTINGS,
  DEFAULT_BY_CATEGORY,
  reconcileUsageBreakdown,
  getUsagePeriodKey,
  getNextResetDate,
} from './useTokenUsage.math'
import {
  LAST_KNOWN_USAGE_KEY,
  AGENT_SESSION_KEY,
  TOKEN_USAGE_FLUSH_INTERVAL_MS,
  TOKEN_USAGE_FLUSH_THRESHOLD,
  CATEGORY_KEY,
  PERIOD_KEY,
} from './useTokenUsage.constants'

/**
 * Mutable singleton state shared across all useTokenUsage hook instances.
 * Held in one object so the hook module and this store module observe the
 * same values.
 */
export interface TokenUsageSingletonState {
  sharedUsage: TokenUsage
  currentUsagePeriod: string
  // Persisted baseline for total token count reported by the local agent.
  // This is loaded from localStorage on module init so that an agent restart
  // (which resets `today` counters to a lower value) can be distinguished from
  // real usage growth — see bug #6015 and the restart-detection logic.
  lastKnownUsage: number | null
  lastKnownSessionId: string | null
}

export const tokenUsageState: TokenUsageSingletonState = {
  sharedUsage: {
    used: 0,
    ...DEFAULT_SETTINGS,
    resetDate: getNextResetDate(),
    byCategory: { ...DEFAULT_BY_CATEGORY } },
  currentUsagePeriod: getUsagePeriodKey(),
  lastKnownUsage: null,
  lastKnownSessionId: null,
}

export const subscribers = new Set<(usage: TokenUsage) => void>()

// Track all active AI operations for attributing token usage.
// Keyed by a stable operation id (e.g. missionId, analyze-call uuid) so
// concurrent operations across multiple tabs/cards don't clobber each
// other — the previous module-level `let activeCategory` variable caused
// bug #6016 where starting a second operation rerouted the first one's
// tokens to the wrong category.
export const activeCategoriesByOp = new Map<string, TokenCategory>()


/**
 * Set the active token category for a specific operation id.
 * The opId should be stable for the lifetime of the operation (mission id,
 * analyze-call uuid, etc.) so concurrent operations are tracked separately.
 */
export function setActiveTokenCategory(opId: string, category: TokenCategory) {
  activeCategoriesByOp.set(opId, category)
}

/**
 * Clear the active token category for a specific operation id.
 * Call this when the operation completes (success, failure, or cancel).
 */
export function clearActiveTokenCategory(opId: string) {
  activeCategoriesByOp.delete(opId)
}

/**
 * Return the set of currently active categories. Exposed for debugging.
 */
export function getActiveTokenCategories(): TokenCategory[] {
  return Array.from(activeCategoriesByOp.values())
}

/**
 * Safely load the persisted last-known usage + agent session marker from
 * localStorage. Returns null fields if localStorage is unavailable (SSR,
 * private mode) or the stored data is corrupted.
 */
export function loadPersistedUsage(): { lastKnown: number | null; sessionId: string | null } {
  if (typeof window === 'undefined') return { lastKnown: null, sessionId: null }
  try {
    const rawLastKnown = localStorage.getItem(LAST_KNOWN_USAGE_KEY)
    const rawSession = localStorage.getItem(AGENT_SESSION_KEY)
    const lastKnown = rawLastKnown !== null ? Number(rawLastKnown) : null
    return {
      lastKnown: lastKnown !== null && Number.isFinite(lastKnown) ? lastKnown : null,
      sessionId: rawSession,
    }
  } catch {
    // localStorage may throw in private mode or when quota is exceeded.
    return { lastKnown: null, sessionId: null }
  }
}

/**
 * Safely persist the last-known usage baseline + agent session marker to
 * localStorage. Silently ignores quota/SSR/private-mode errors — persistence
 * is best-effort and losing it only degrades restart detection on the next
 * page load.
 */
export function persistUsage(lastKnown: number, sessionId: string | null): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LAST_KNOWN_USAGE_KEY, String(lastKnown))
    if (sessionId !== null) {
      localStorage.setItem(AGENT_SESSION_KEY, sessionId)
    }
  } catch {
    // Quota exceeded / private mode — ignore, this is best-effort.
  }
}

export function resetUsagePeriodState(nextPeriod: string, forceNotify = false): void {
  tokenUsageState.currentUsagePeriod = nextPeriod
  tokenUsageState.sharedUsage = {
    ...tokenUsageState.sharedUsage,
    used: 0,
    resetDate: getNextResetDate(),
    byCategory: { ...DEFAULT_BY_CATEGORY },
  }
  tokenUsageState.lastKnownUsage = null
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CATEGORY_KEY)
    localStorage.removeItem(LAST_KNOWN_USAGE_KEY)
    localStorage.setItem(PERIOD_KEY, tokenUsageState.currentUsagePeriod)
  }
  if (flushTimerId !== null) {
    clearTimeout(flushTimerId)
    flushTimerId = null
  }
  pendingDeltas.clear()
  pendingDeltaTotal = 0
  if (forceNotify) {
    notifySubscribers()
  }
}

export function rollOverUsagePeriodIfNeeded(forceNotify = false): void {
  const nextPeriod = getUsagePeriodKey()
  if (tokenUsageState.currentUsagePeriod === nextPeriod) return
  resetUsagePeriodState(nextPeriod, forceNotify)
}

// Hydrate the in-memory baseline from localStorage at module init so that
// page reloads and new tabs don't mis-attribute the entire current usage
// count as fresh delta on the first poll.
{
  const persisted = loadPersistedUsage()
  tokenUsageState.lastKnownUsage = persisted.lastKnown
  tokenUsageState.lastKnownSessionId = persisted.sessionId
}

// --- Backend persistence layer (folded into PR #6032) ----------------------
//
// localStorage remains the fast cache (kept from PR #6020) but the server is
// now the source of truth. On the first hook mount we hydrate from
// `GET /api/token-usage/me`; subsequent deltas are mirrored to
// `POST /api/token-usage/delta` via a debounced flusher so heavy-usage
// sessions don't pound the API. Demo mode and unauth sessions skip the
// backend entirely and continue to use localStorage only.

/** True once we've successfully hydrated `sharedUsage` from the backend. */
let backendHydrated = false
/** True if a previous backend call returned 401 — disables further calls. */
let backendUnauthenticated = false

/**
 * Pending per-category deltas accumulated since the last successful flush.
 * Counts are non-negative; we never push negative deltas to the server (that
 * would only happen on a baseline reset, which is handled by the
 * GET-on-mount path, not by mirroring deltas).
 */
const pendingDeltas = new Map<TokenCategory, number>()
let pendingDeltaTotal = 0
let flushTimerId: ReturnType<typeof setTimeout> | null = null

/**
 * Hydrate the singleton `sharedUsage.byCategory` map from a backend record.
 * Called from `startPolling` exactly once per session — not per hook instance.
 * Demo mode and unauth sessions skip this entirely.
 */
export async function hydrateFromBackend(): Promise<void> {
  if (backendHydrated || backendUnauthenticated) return
  if (typeof window === 'undefined') return
  if (getDemoMode()) return
  try {
    const record: UserTokenUsageRecord = await getUserTokenUsage()
    backendHydrated = true
    // Merge: any byCategory keys present on the server overwrite local
    // counters; categories the server doesn't know about (e.g. localStorage
    // from a stale build) are preserved so we don't drop in-flight totals.
    const merged: TokenUsageByCategory = { ...tokenUsageState.sharedUsage.byCategory }
    for (const cat of ['missions', 'diagnose', 'insights', 'predictions', 'other'] as const) {
      const v = record.tokens_by_category?.[cat]
      if (typeof v === 'number' && Number.isFinite(v)) {
        merged[cat] = v
      }
    }
    // The backend marker overrides the localStorage one — server wins.
    if (record.last_agent_session_id) {
      tokenUsageState.lastKnownSessionId = record.last_agent_session_id
    }
    const used = Math.max(tokenUsageState.sharedUsage.used, record.total_tokens)
    updateSharedUsage({
      used,
      byCategory: reconcileUsageBreakdown(used, merged),
      resetDate: getNextResetDate(),
    }, true)
  } catch (err: unknown) {
    if (err instanceof TokenUsageUnauthenticatedError) {
      backendUnauthenticated = true
      return
    }
    // Network / 5xx — leave backendHydrated=false so we retry on the next
    // hook mount, but don't crash polling.
  }
}

/**
 * Queue a per-category delta for backend flush. Called from the polling
 * attribution path immediately after `updateSharedUsage`. Skipped in demo
 * mode and after a 401.
 */
export function queueBackendDelta(category: TokenCategory, delta: number): void {
  if (backendUnauthenticated) return
  if (typeof window === 'undefined') return
  if (getDemoMode()) return
  if (delta <= 0) return

  pendingDeltas.set(category, (pendingDeltas.get(category) ?? 0) + delta)
  pendingDeltaTotal += delta

  if (pendingDeltaTotal >= TOKEN_USAGE_FLUSH_THRESHOLD) {
    void flushPendingDeltas()
    return
  }
  if (flushTimerId === null) {
    flushTimerId = setTimeout(() => { void flushPendingDeltas() }, TOKEN_USAGE_FLUSH_INTERVAL_MS)
  }
}

/**
 * Flush all accumulated per-category deltas to the backend. Each category is
 * sent as a separate `POST /api/token-usage/delta` so the server can track
 * the per-category totals atomically. Failures swallow silently — the
 * localStorage cache still has the data and the next page load will reconcile.
 */
async function flushPendingDeltas(): Promise<void> {
  if (flushTimerId !== null) {
    clearTimeout(flushTimerId)
    flushTimerId = null
  }
  if (pendingDeltas.size === 0) return
  // Snapshot and clear before awaiting so concurrent attributions don't
  // double-send the same numbers.
  const snapshot = Array.from(pendingDeltas.entries())
  pendingDeltas.clear()
  pendingDeltaTotal = 0

  for (const [category, delta] of snapshot) {
    if (delta <= 0) continue
    try {
      await postTokenDelta({
        category,
        delta,
        agent_session_id: tokenUsageState.lastKnownSessionId ?? '',
      })
    } catch (err: unknown) {
      if (err instanceof TokenUsageUnauthenticatedError) {
        backendUnauthenticated = true
        return
      }
      // Network blip — re-queue so the next flush picks it up.
      pendingDeltas.set(category, (pendingDeltas.get(category) ?? 0) + delta)
      pendingDeltaTotal += delta
    }
  }
}

// Best-effort flush on tab close. `sendBeacon` is keepalive so it survives
// the unload — but only if the user is authenticated and there is something
// pending. Browsers without sendBeacon fall back to the queued flush, which
// will run if the user reopens the tab.
//
// #6202: This used to register an anonymous arrow function as the listener,
// which made it impossible to remove. Vite HMR re-evaluates this module on
// every hot reload, so each reload accumulated another listener — closing
// the tab would fire all N copies and send N duplicate beacons. Now uses a
// named function reference and a module-level guard so re-evaluation under
// HMR replaces the listener instead of stacking copies. The guard also
// removes the prior listener using the captured reference (safe even if
// the previous run is gone, removeEventListener is a no-op for unknowns).
function flushPendingDeltasOnPagehide(): void {
  if (backendUnauthenticated || pendingDeltas.size === 0) return
  if (typeof navigator.sendBeacon !== 'function') return
  for (const [category, delta] of pendingDeltas.entries()) {
    if (delta <= 0) continue
    const body = new Blob(
      [JSON.stringify({ category, delta, agent_session_id: tokenUsageState.lastKnownSessionId ?? '' })],
      { type: 'application/json' }
    )
    try {
      navigator.sendBeacon('/api/token-usage/delta', body)
    } catch {
      // Ignore — best effort only.
    }
  }
  pendingDeltas.clear()
  pendingDeltaTotal = 0
}

if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
  // HMR cleanup — remove any stale listener from a previous module instance
  // before installing the new one.
  const existing = (window as unknown as { __kcTokenUsagePagehide?: () => void }).__kcTokenUsagePagehide
  if (existing) {
    window.removeEventListener('pagehide', existing)
  }
  window.addEventListener('pagehide', flushPendingDeltasOnPagehide)
  ;(window as unknown as { __kcTokenUsagePagehide?: () => void }).__kcTokenUsagePagehide = flushPendingDeltasOnPagehide
}

// Notify all subscribers
export function notifySubscribers() {
  subscribers.forEach(fn => fn(tokenUsageState.sharedUsage))
}

// Update shared usage (only notifies if actually changed)
export function updateSharedUsage(updates: Partial<TokenUsage>, forceNotify = false) {
  const prevUsage = tokenUsageState.sharedUsage
  const prevByCategory = { ...tokenUsageState.sharedUsage.byCategory }
  tokenUsageState.sharedUsage = { ...tokenUsageState.sharedUsage, ...updates }

  // Only notify if value actually changed (prevents UI flashing on background polls)
  const byCategoryChanged = updates.byCategory && (
    prevByCategory.missions !== tokenUsageState.sharedUsage.byCategory.missions ||
    prevByCategory.diagnose !== tokenUsageState.sharedUsage.byCategory.diagnose ||
    prevByCategory.insights !== tokenUsageState.sharedUsage.byCategory.insights ||
    prevByCategory.predictions !== tokenUsageState.sharedUsage.byCategory.predictions ||
    prevByCategory.other !== tokenUsageState.sharedUsage.byCategory.other
  )
  const hasChanged = forceNotify ||
    prevUsage.used !== tokenUsageState.sharedUsage.used ||
    prevUsage.limit !== tokenUsageState.sharedUsage.limit ||
    prevUsage.warningThreshold !== tokenUsageState.sharedUsage.warningThreshold ||
    prevUsage.criticalThreshold !== tokenUsageState.sharedUsage.criticalThreshold ||
    prevUsage.stopThreshold !== tokenUsageState.sharedUsage.stopThreshold ||
    prevUsage.resetDate !== tokenUsageState.sharedUsage.resetDate ||
    byCategoryChanged

  if (hasChanged) {
    // Persist category data to localStorage
    if (byCategoryChanged && typeof window !== 'undefined' && !getDemoMode()) {
      localStorage.setItem(CATEGORY_KEY, JSON.stringify(tokenUsageState.sharedUsage.byCategory))
      localStorage.setItem(PERIOD_KEY, tokenUsageState.currentUsagePeriod)
    }
    notifySubscribers()
  }
}
