import { useState, useEffect } from 'react'
import { isAgentUnavailable, reportAgentDataSuccess, reportAgentDataError } from './useLocalAgent'
import { getDemoMode } from './useDemoMode'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { QUICK_ABORT_TIMEOUT_MS } from '../lib/constants/network'
import {
  getUserTokenUsage,
  postTokenDelta,
  TokenUsageUnauthenticatedError,
  type UserTokenUsageRecord,
} from '../lib/tokenUsageApi'

/** Maximum token delta to attribute in a single poll cycle (prevents init spikes) */
const MAX_SINGLE_DELTA_TOKENS = 50_000

/** Minimum valid stop threshold — prevents "AI Disabled" at 0% from corrupted localStorage */
const MIN_STOP_THRESHOLD = 0.01

/** localStorage key for the persisted last-known total token count (agent restart detection) */
const LAST_KNOWN_USAGE_KEY = 'kc:tokenUsage:lastKnown'

/** localStorage key for the persisted agent session marker (agent restart detection) */
const AGENT_SESSION_KEY = 'kc:tokenUsage:agentSession'

/** Default category used when a delta arrives with no active operation */
const DEFAULT_CATEGORY: TokenCategory = 'other'

/**
 * Maximum age (ms) of an unflushed pending delta before it MUST be sent to the
 * backend even if the threshold-based trigger has not fired. Keeping this short
 * means a logged-in user who closes the tab loses at most ~30s of attribution
 * if `sendBeacon` is unavailable.
 */
const TOKEN_USAGE_FLUSH_INTERVAL_MS = 30_000

/**
 * Minimum total tokens accumulated across pending deltas before triggering a
 * flush. Caps backend write traffic on heavy-usage sessions: ~1 POST per
 * `TOKEN_USAGE_FLUSH_THRESHOLD` tokens of activity, regardless of how many
 * individual deltas the local agent reports.
 */
const TOKEN_USAGE_FLUSH_THRESHOLD = 100

export type TokenCategory = 'missions' | 'diagnose' | 'insights' | 'predictions' | 'other'

export interface TokenUsageByCategory {
  missions: number
  diagnose: number
  insights: number
  predictions: number
  other: number
}

export interface TokenUsage {
  used: number
  limit: number
  warningThreshold: number
  criticalThreshold: number
  stopThreshold: number
  resetDate: string
  byCategory: TokenUsageByCategory
}

export type TokenAlertLevel = 'normal' | 'warning' | 'critical' | 'stopped'

export function getTokenAlertLevel(usage: Pick<TokenUsage, 'used' | 'limit' | 'warningThreshold' | 'criticalThreshold' | 'stopThreshold'>): TokenAlertLevel {
  if (usage.limit <= 0) return 'normal'

  const percentageUsed = usage.used / usage.limit
  const stopThreshold = usage.stopThreshold > 0 ? usage.stopThreshold : DEFAULT_SETTINGS.stopThreshold

  if (percentageUsed >= stopThreshold) return 'stopped'
  if (percentageUsed >= usage.criticalThreshold) return 'critical'
  if (percentageUsed >= usage.warningThreshold) return 'warning'
  return 'normal'
}

const SETTINGS_KEY = 'kubestellar-token-settings'
const CATEGORY_KEY = 'kubestellar-token-categories'
const PERIOD_KEY = 'kubestellar-token-period'
const SETTINGS_CHANGED_EVENT = 'kubestellar-token-settings-changed'
const POLL_INTERVAL = 30000 // Poll every 30 seconds
const LOCAL_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })

const DEFAULT_SETTINGS = {
  limit: 500000000, // 500M tokens daily default
  warningThreshold: 0.7, // 70%
  criticalThreshold: 0.9, // 90%
  stopThreshold: 1.0, // 100%
}

const NEXT_RESET_DAY_OFFSET = 1

const DEFAULT_BY_CATEGORY: TokenUsageByCategory = {
  missions: 0,
  diagnose: 0,
  insights: 0,
  predictions: 0,
  other: 0 }

// Demo mode token usage - simulate realistic usage
const DEMO_TOKEN_USAGE = 1247832 // ~25% of 5M limit
const DEMO_BY_CATEGORY: TokenUsageByCategory = {
  missions: 523000,
  diagnose: 312000,
  insights: 245832,
  predictions: 167000,
  other: 0 }

// Singleton state - shared across all hook instances
let sharedUsage: TokenUsage = {
  used: 0,
  ...DEFAULT_SETTINGS,
  resetDate: getNextResetDate(),
  byCategory: { ...DEFAULT_BY_CATEGORY } }
let currentUsagePeriod = getUsagePeriodKey()
let pollStarted = false
let pollIntervalId: ReturnType<typeof setInterval> | null = null
const subscribers = new Set<(usage: TokenUsage) => void>()

// Track all active AI operations for attributing token usage.
// Keyed by a stable operation id (e.g. missionId, analyze-call uuid) so
// concurrent operations across multiple tabs/cards don't clobber each
// other — the previous module-level `let activeCategory` variable caused
// bug #6016 where starting a second operation rerouted the first one's
// tokens to the wrong category.
const activeCategoriesByOp = new Map<string, TokenCategory>()

// Persisted baseline for total token count reported by the local agent.
// This is loaded from localStorage on module init so that an agent restart
// (which resets `today` counters to a lower value) can be distinguished from
// real usage growth — see bug #6015 and the restart-detection logic below.
let lastKnownUsage: number | null = null
let lastKnownSessionId: string | null = null

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
function loadPersistedUsage(): { lastKnown: number | null; sessionId: string | null } {
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
function persistUsage(lastKnown: number, sessionId: string | null): void {
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

function getUsagePeriodKey(now = new Date()): string {
  return LOCAL_DATE_FORMATTER.format(now)
}

function resetUsagePeriodState(nextPeriod: string, forceNotify = false): void {
  currentUsagePeriod = nextPeriod
  sharedUsage = {
    ...sharedUsage,
    used: 0,
    resetDate: getNextResetDate(),
    byCategory: { ...DEFAULT_BY_CATEGORY },
  }
  lastKnownUsage = null
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CATEGORY_KEY)
    localStorage.removeItem(LAST_KNOWN_USAGE_KEY)
    localStorage.setItem(PERIOD_KEY, currentUsagePeriod)
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

function rollOverUsagePeriodIfNeeded(forceNotify = false): void {
  const nextPeriod = getUsagePeriodKey()
  if (currentUsagePeriod === nextPeriod) return
  resetUsagePeriodState(nextPeriod, forceNotify)
}

// Hydrate the in-memory baseline from localStorage at module init so that
// page reloads and new tabs don't mis-attribute the entire current usage
// count as fresh delta on the first poll.
{
  const persisted = loadPersistedUsage()
  lastKnownUsage = persisted.lastKnown
  lastKnownSessionId = persisted.sessionId
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
async function hydrateFromBackend(): Promise<void> {
  if (backendHydrated || backendUnauthenticated) return
  if (typeof window === 'undefined') return
  if (getDemoMode()) return
  try {
    const record: UserTokenUsageRecord = await getUserTokenUsage()
    backendHydrated = true
    // Merge: any byCategory keys present on the server overwrite local
    // counters; categories the server doesn't know about (e.g. localStorage
    // from a stale build) are preserved so we don't drop in-flight totals.
    const merged: TokenUsageByCategory = { ...sharedUsage.byCategory }
    for (const cat of ['missions', 'diagnose', 'insights', 'predictions', 'other'] as const) {
      const v = record.tokens_by_category?.[cat]
      if (typeof v === 'number' && Number.isFinite(v)) {
        merged[cat] = v
      }
    }
    // The backend marker overrides the localStorage one — server wins.
    if (record.last_agent_session_id) {
      lastKnownSessionId = record.last_agent_session_id
    }
    updateSharedUsage({ byCategory: merged, resetDate: getNextResetDate() }, true)
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
        agent_session_id: lastKnownSessionId ?? '',
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
      [JSON.stringify({ category, delta, agent_session_id: lastKnownSessionId ?? '' })],
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

// Initialize from localStorage
if (typeof window !== 'undefined') {
  currentUsagePeriod = localStorage.getItem(PERIOD_KEY) || getUsagePeriodKey()
  try {
    const settings = localStorage.getItem(SETTINGS_KEY)
    if (settings) {
      const parsedSettings = JSON.parse(settings)
      sharedUsage = { ...sharedUsage, ...parsedSettings }
      // Ensure limit is never zero/negative (causes NaN in percentage calculations)
      if (sharedUsage.limit <= 0) sharedUsage.limit = DEFAULT_SETTINGS.limit
      // Ensure thresholds are sane — corrupted stopThreshold=0 causes "AI Disabled" at 0% usage
      if (!sharedUsage.stopThreshold || sharedUsage.stopThreshold < MIN_STOP_THRESHOLD) {
        sharedUsage.stopThreshold = DEFAULT_SETTINGS.stopThreshold
      }
      if (!sharedUsage.criticalThreshold || sharedUsage.criticalThreshold <= 0) {
        sharedUsage.criticalThreshold = DEFAULT_SETTINGS.criticalThreshold
      }
      if (!sharedUsage.warningThreshold || sharedUsage.warningThreshold <= 0) {
        sharedUsage.warningThreshold = DEFAULT_SETTINGS.warningThreshold
      }
    }
  } catch {
    // Corrupted settings JSON — fall back to defaults.
  }
  // Load persisted category data only for the active day.
  try {
    if (currentUsagePeriod === getUsagePeriodKey()) {
      const categoryData = localStorage.getItem(CATEGORY_KEY)
      if (categoryData) {
        const parsedCategories = JSON.parse(categoryData)
        sharedUsage.byCategory = { ...DEFAULT_BY_CATEGORY, ...parsedCategories }
      }
    } else {
      resetUsagePeriodState(getUsagePeriodKey())
    }
  } catch {
    // Ignore invalid data — start from zeroed byCategory.
  }
  // Set demo usage if in demo mode
  if (getDemoMode()) {
    sharedUsage.used = DEMO_TOKEN_USAGE
    sharedUsage.byCategory = { ...DEMO_BY_CATEGORY }
  }
}

// Notify all subscribers
function notifySubscribers() {
  subscribers.forEach(fn => fn(sharedUsage))
}

// Update shared usage (only notifies if actually changed)
function updateSharedUsage(updates: Partial<TokenUsage>, forceNotify = false) {
  const prevUsage = sharedUsage
  const prevByCategory = { ...sharedUsage.byCategory }
  sharedUsage = { ...sharedUsage, ...updates }

  // Only notify if value actually changed (prevents UI flashing on background polls)
  const byCategoryChanged = updates.byCategory && (
    prevByCategory.missions !== sharedUsage.byCategory.missions ||
    prevByCategory.diagnose !== sharedUsage.byCategory.diagnose ||
    prevByCategory.insights !== sharedUsage.byCategory.insights ||
    prevByCategory.predictions !== sharedUsage.byCategory.predictions ||
    prevByCategory.other !== sharedUsage.byCategory.other
  )
  const hasChanged = forceNotify ||
    prevUsage.used !== sharedUsage.used ||
    prevUsage.limit !== sharedUsage.limit ||
    prevUsage.warningThreshold !== sharedUsage.warningThreshold ||
    prevUsage.criticalThreshold !== sharedUsage.criticalThreshold ||
    prevUsage.stopThreshold !== sharedUsage.stopThreshold ||
    prevUsage.resetDate !== sharedUsage.resetDate ||
    byCategoryChanged

  if (hasChanged) {
    // Persist category data to localStorage
    if (byCategoryChanged && typeof window !== 'undefined' && !getDemoMode()) {
      localStorage.setItem(CATEGORY_KEY, JSON.stringify(sharedUsage.byCategory))
      localStorage.setItem(PERIOD_KEY, currentUsagePeriod)
    }
    notifySubscribers()
  }
}

// Fetch token usage from local agent (singleton - only runs once)
async function fetchTokenUsage() {
  rollOverUsagePeriodIfNeeded(true)

  // Use demo data when in demo mode
  if (getDemoMode()) {
    // Simulate slow token accumulation in demo mode
    const randomIncrease = Math.floor(Math.random() * 5000) // 0-5000 tokens
    updateSharedUsage({
      used: DEMO_TOKEN_USAGE + randomIncrease,
      resetDate: getNextResetDate(),
    })
    return
  }

  // Skip if agent is known to be unavailable (uses shared state from useLocalAgent)
  if (isAgentUnavailable()) {
    return
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), QUICK_ABORT_TIMEOUT_MS)
    // Use plain fetch — /health does not require auth and avoids CORS
    // preflight failures from X-Requested-With header (#10459).
    const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal })
    clearTimeout(timeoutId)

    if (response.ok) {
      reportAgentDataSuccess()
      // Use .catch() on .json() to prevent Firefox from firing unhandledrejection
      // before the outer try/catch processes the rejection (microtask timing issue).
      const data = await response.json().catch(() => null)
      if (!data) throw new Error('Invalid JSON response from health endpoint')
      if (data.claude?.tokenUsage?.today) {
        const todayTokens = data.claude.tokenUsage.today
        const resetDate = getNextResetDate()
        // Track both input and output tokens
        const totalUsed = (todayTokens.input || 0) + (todayTokens.output || 0)

        // --- Agent restart detection (bug #6015) ----------------------------
        // The local kc-agent reports a `today` counter that resets to zero
        // whenever the agent process restarts. Without detecting restarts we
        // would either:
        //   (a) attribute the full new total as a single huge delta, or
        //   (b) silently swallow real usage because totalUsed < lastKnownUsage.
        // We detect a restart by either:
        //   1. The agent session marker changing (preferred — exact signal), or
        //   2. totalUsed going backwards compared to our persisted baseline.
        // On restart we reset the baseline without attributing a delta. The
        // baseline is also persisted to localStorage so a page reload doesn't
        // mis-attribute the current running total as fresh usage.
        const reportedSessionId: string | null = data.claude?.agentSessionId ?? null
        const sessionChanged =
          reportedSessionId !== null &&
          lastKnownSessionId !== null &&
          reportedSessionId !== lastKnownSessionId
        const wentBackwards = lastKnownUsage !== null && totalUsed < lastKnownUsage
        const isRestart = sessionChanged || wentBackwards

        if (isRestart || lastKnownUsage === null) {
          // Reset baseline without attributing any delta. On first init
          // (lastKnownUsage === null) we also take this branch to establish
          // a baseline without pretending all current usage happened just now.
          updateSharedUsage({ used: totalUsed, resetDate })
        } else if (totalUsed > lastKnownUsage) {
          const delta = totalUsed - lastKnownUsage
          // Sanity check: don't attribute more than MAX_SINGLE_DELTA_TOKENS
          // at once (likely a bug / init race).
          if (delta < MAX_SINGLE_DELTA_TOKENS) {
            const activeCount = activeCategoriesByOp.size
            if (activeCount === 0) {
              // No active operation — attribute to the default category.
              const newByCategory = { ...sharedUsage.byCategory }
              newByCategory[DEFAULT_CATEGORY] += delta
              updateSharedUsage({ used: totalUsed, byCategory: newByCategory, resetDate })
              queueBackendDelta(DEFAULT_CATEGORY, delta)
            } else if (activeCount === 1) {
              // Single operation — attribute the entire delta to it.
              const category = activeCategoriesByOp.values().next().value as TokenCategory
              const newByCategory = { ...sharedUsage.byCategory }
              newByCategory[category] += delta
              updateSharedUsage({ used: totalUsed, byCategory: newByCategory, resetDate })
              queueBackendDelta(category, delta)
            } else {
              // Multiple concurrent operations — split the delta evenly
              // across all active operations. This is a best-effort
              // heuristic: the local agent reports only an aggregate count,
              // so we cannot perfectly attribute per-operation usage. Any
              // remainder from integer division goes to the first operation.
              const perOp = Math.floor(delta / activeCount)
              const remainder = delta - perOp * activeCount
              const newByCategory = { ...sharedUsage.byCategory }
              let first = true
              for (const category of activeCategoriesByOp.values()) {
                const portion = perOp + (first ? remainder : 0)
                newByCategory[category] += portion
                queueBackendDelta(category, portion)
                first = false
              }
              updateSharedUsage({ used: totalUsed, byCategory: newByCategory, resetDate })
            }
          } else {
            console.warn(`[TokenUsage] Skipping large delta ${delta} - likely initialization`)
            updateSharedUsage({ used: totalUsed, resetDate })
          }
        } else {
          // totalUsed === lastKnownUsage — nothing to attribute.
          updateSharedUsage({ used: totalUsed, resetDate })
        }

        lastKnownUsage = totalUsed
        if (reportedSessionId !== null) {
          lastKnownSessionId = reportedSessionId
        }
        persistUsage(totalUsed, reportedSessionId)
      }
    } else {
      reportAgentDataError('/health (token)', `HTTP ${response.status}`)
    }
  } catch {
    // Error will be tracked by useLocalAgent's health check
  }
}

// Start singleton polling
function startPolling() {
  if (pollStarted) return
  pollStarted = true

  // One-shot backend hydrate before the first poll attribution. Demo mode
  // and unauth sessions are no-ops inside hydrateFromBackend.
  void hydrateFromBackend()

  // Initial fetch
  fetchTokenUsage()

  // Poll at interval — store the ID so we can clean up when all subscribers leave
  pollIntervalId = setInterval(fetchTokenUsage, POLL_INTERVAL)
}

// Stop singleton polling when no subscribers remain (prevents memory leaks)
function stopPolling() {
  if (!pollStarted) return
  if (pollIntervalId !== null) {
    clearInterval(pollIntervalId)
    pollIntervalId = null
  }
  pollStarted = false
}

export function useTokenUsage() {
  const [usage, setUsage] = useState<TokenUsage>(sharedUsage)

  // Subscribe to shared state updates
  useEffect(() => {
    // Start polling (only happens once across all instances)
    startPolling()

    // Subscribe to updates
    const handleUpdate = (newUsage: TokenUsage) => {
      setUsage(newUsage)
    }
    subscribers.add(handleUpdate)

    // Set initial state
    setUsage(sharedUsage)

    return () => {
      subscribers.delete(handleUpdate)
      // Stop polling when no components are subscribed (prevents memory leaks)
      if (subscribers.size === 0) {
        stopPolling()
      }
    }
  }, [])

  // Listen for settings changes from other components
  useEffect(() => {
    const handleSettingsChange = () => {
      const settings = localStorage.getItem(SETTINGS_KEY)
      if (settings) {
        const parsedSettings = JSON.parse(settings)
        updateSharedUsage(parsedSettings)
      }
    }
    window.addEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChange)
    const handleStorage = (e: StorageEvent) => { if (e.key === SETTINGS_KEY) handleSettingsChange() }
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChange)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  // Calculate alert level
  const getAlertLevel = (): TokenAlertLevel => getTokenAlertLevel(usage)

  // Add tokens used (optionally with category)
  const addTokens = (tokens: number, category: TokenCategory = 'other') => {
    const newByCategory = { ...sharedUsage.byCategory }
    newByCategory[category] += tokens
    updateSharedUsage({
      used: sharedUsage.used + tokens,
      byCategory: newByCategory })
  }

  // Update settings
  const updateSettings = (settings: Partial<Omit<TokenUsage, 'used' | 'resetDate'>>) => {
      const newSettings = {
        // Use || (not ??) so that 0 falls back to defaults — 0 is never a valid threshold
        limit: settings.limit || sharedUsage.limit || DEFAULT_SETTINGS.limit,
        warningThreshold: settings.warningThreshold || sharedUsage.warningThreshold || DEFAULT_SETTINGS.warningThreshold,
        criticalThreshold: settings.criticalThreshold || sharedUsage.criticalThreshold || DEFAULT_SETTINGS.criticalThreshold,
        stopThreshold: DEFAULT_SETTINGS.stopThreshold }
      updateSharedUsage(newSettings)
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings))
      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT))
      window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
    }

  // Reset usage
  const resetUsage = () => {
    updateSharedUsage({
      used: 0,
      resetDate: getNextResetDate(),
      byCategory: { ...DEFAULT_BY_CATEGORY } }, true) // Force notify
    // Clear persisted category data
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CATEGORY_KEY)
      localStorage.setItem(PERIOD_KEY, currentUsagePeriod)
    }
  }

  // Check if AI features should be disabled
  const isAIDisabled = () => {
    return getAlertLevel() === 'stopped'
  }

  const alertLevel = getAlertLevel()
  const percentage = usage.limit > 0 ? Math.min((usage.used / usage.limit) * 100, 100) : 0
  const remaining = Math.max(usage.limit - usage.used, 0)
  const isDemoData = getDemoMode()

  return {
    usage,
    alertLevel,
    percentage,
    remaining,
    addTokens,
    updateSettings,
    resetUsage,
    isAIDisabled,
    isDemoData }
}

function getNextResetDate(): string {
  const now = new Date()
  const nextReset = new Date(now.getFullYear(), now.getMonth(), now.getDate() + NEXT_RESET_DAY_OFFSET)
  return nextReset.toISOString()
}

/**
 * Global function to add category tokens without needing a hook.
 * Use this from contexts/providers that can't call hooks directly.
 * Also increments the total `used` count so the widget reflects real usage
 * even when the kc-agent health poll doesn't return token data.
 * (The agent poll sets `used` to an absolute value, which corrects any drift.)
 */
export function addCategoryTokens(tokens: number, category: TokenCategory = 'other') {
  if (tokens <= 0) return
  const newByCategory = { ...sharedUsage.byCategory }
  newByCategory[category] += tokens
  updateSharedUsage({
    used: sharedUsage.used + tokens,
    byCategory: newByCategory })
}

export const __testables = {
  loadPersistedUsage,
  persistUsage,
  getNextResetDate,
  MAX_SINGLE_DELTA_TOKENS,
  MIN_STOP_THRESHOLD,
  LAST_KNOWN_USAGE_KEY,
  AGENT_SESSION_KEY,
  DEFAULT_CATEGORY,
  TOKEN_USAGE_FLUSH_INTERVAL_MS,
  TOKEN_USAGE_FLUSH_THRESHOLD,
  DEFAULT_SETTINGS,
  DEFAULT_BY_CATEGORY,
  DEMO_TOKEN_USAGE,
  DEMO_BY_CATEGORY,
  PERIOD_KEY,
  getUsagePeriodKey,
}
