import { getDemoMode } from '../useDemoMode'
import { getUserTokenUsage, postTokenDelta, TokenUsageUnauthenticatedError, type UserTokenUsageRecord } from '../../lib/tokenUsageApi'
import { getNextResetDate, reconcileUsageBreakdown } from './accounting'
import type { TokenCategory, TokenUsage, TokenUsageByCategory } from './types'

/** localStorage key for the persisted last-known total token count (agent restart detection) */
export const LAST_KNOWN_USAGE_KEY = 'kc:tokenUsage:lastKnown'

/** localStorage key for the persisted agent session marker (agent restart detection) */
export const AGENT_SESSION_KEY = 'kc:tokenUsage:agentSession'

export const SETTINGS_KEY = 'kubestellar-token-settings'
export const CATEGORY_KEY = 'kubestellar-token-categories'
export const PERIOD_KEY = 'kubestellar-token-period'
export const SETTINGS_CHANGED_EVENT = 'kubestellar-token-settings-changed'
export const POLL_INTERVAL = 30_000

/**
 * Maximum age (ms) of an unflushed pending delta before it MUST be sent to the
 * backend even if the threshold-based trigger has not fired.
 */
export const TOKEN_USAGE_FLUSH_INTERVAL_MS = 30_000

/**
 * Minimum total tokens accumulated across pending deltas before triggering a
 * flush.
 */
export const TOKEN_USAGE_FLUSH_THRESHOLD = 100

const LOCAL_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })

export function getUsagePeriodKey(now = new Date()): string {
  return LOCAL_DATE_FORMATTER.format(now)
}

/**
 * Safely load the persisted last-known usage + agent session marker from
 * localStorage.
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
    return { lastKnown: null, sessionId: null }
  }
}

/**
 * Safely persist the last-known usage baseline + agent session marker to
 * localStorage.
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

type BackendSyncDeps = {
  getSharedUsage: () => TokenUsage
  updateSharedUsage: (updates: Partial<TokenUsage>, forceNotify?: boolean) => void
  getLastKnownSessionId: () => string | null
  setLastKnownSessionId: (id: string | null) => void
}

export function createBackendSync(deps: BackendSyncDeps) {
  let backendHydrated = false
  let backendUnauthenticated = false
  const pendingDeltas = new Map<TokenCategory, number>()
  let pendingDeltaTotal = 0
  let flushTimerId: ReturnType<typeof setTimeout> | null = null

  async function hydrateFromBackend(): Promise<void> {
    if (backendHydrated || backendUnauthenticated) return
    if (typeof window === 'undefined') return
    if (getDemoMode()) return

    try {
      const record: UserTokenUsageRecord = await getUserTokenUsage()
      backendHydrated = true
      const merged: TokenUsageByCategory = { ...deps.getSharedUsage().byCategory }
      for (const cat of ['missions', 'diagnose', 'insights', 'predictions', 'other'] as const) {
        const value = record.tokens_by_category?.[cat]
        if (typeof value === 'number' && Number.isFinite(value)) {
          merged[cat] = value
        }
      }
      if (record.last_agent_session_id) {
        deps.setLastKnownSessionId(record.last_agent_session_id)
      }
      const used = Math.max(deps.getSharedUsage().used, record.total_tokens)
      deps.updateSharedUsage({
        used,
        byCategory: reconcileUsageBreakdown(used, merged),
        resetDate: getNextResetDate(),
      }, true)
    } catch (err: unknown) {
      if (err instanceof TokenUsageUnauthenticatedError) {
        backendUnauthenticated = true
      }
    }
  }

  function queueBackendDelta(category: TokenCategory, delta: number): void {
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

  async function flushPendingDeltas(): Promise<void> {
    if (flushTimerId !== null) {
      clearTimeout(flushTimerId)
      flushTimerId = null
    }
    if (pendingDeltas.size === 0) return

    const snapshot = Array.from(pendingDeltas.entries())
    pendingDeltas.clear()
    pendingDeltaTotal = 0

    for (const [category, delta] of snapshot) {
      if (delta <= 0) continue
      try {
        await postTokenDelta({
          category,
          delta,
          agent_session_id: deps.getLastKnownSessionId() ?? '',
        })
      } catch (err: unknown) {
        if (err instanceof TokenUsageUnauthenticatedError) {
          backendUnauthenticated = true
          return
        }
        pendingDeltas.set(category, (pendingDeltas.get(category) ?? 0) + delta)
        pendingDeltaTotal += delta
      }
    }
  }

  function installPagehideHandler() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return

    const flushPendingDeltasOnPagehide = (): void => {
      if (backendUnauthenticated || pendingDeltas.size === 0) return
      if (typeof navigator.sendBeacon !== 'function') return

      for (const [category, delta] of pendingDeltas.entries()) {
        if (delta <= 0) continue
        const body = new Blob([
          JSON.stringify({ category, delta, agent_session_id: deps.getLastKnownSessionId() ?? '' }),
        ], { type: 'application/json' })
        try {
          navigator.sendBeacon('/api/token-usage/delta', body)
        } catch {
          // best effort
        }
      }
      pendingDeltas.clear()
      pendingDeltaTotal = 0
    }

    const globalWindow = window as unknown as { __kcTokenUsagePagehide?: () => void }
    if (globalWindow.__kcTokenUsagePagehide) {
      window.removeEventListener('pagehide', globalWindow.__kcTokenUsagePagehide)
    }
    window.addEventListener('pagehide', flushPendingDeltasOnPagehide)
    globalWindow.__kcTokenUsagePagehide = flushPendingDeltasOnPagehide
  }

  function clearPending() {
    if (flushTimerId !== null) {
      clearTimeout(flushTimerId)
      flushTimerId = null
    }
    pendingDeltas.clear()
    pendingDeltaTotal = 0
  }

  return {
    hydrateFromBackend,
    queueBackendDelta,
    clearPending,
    installPagehideHandler,
  }
}
