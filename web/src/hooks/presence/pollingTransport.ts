/**
 * HTTP polling transport — fetches active user counts from the API on an interval.
 * Implements a circuit breaker (stops after MAX_FAILURES, recovers after RECOVERY_DELAY)
 * and count-smoothing to handle Netlify Blobs eventual-consistency fluctuations.
 */

import { isJsonResponse, isAbortError, createAbortControllerWithTimeout } from './utils'

export interface ActiveUsersInfo {
  activeUsers: number
  totalConnections: number
}

export type ActiveUsersHookState = { loading?: boolean; error?: boolean; stale?: boolean }

export const ACTIVE_USERS_CACHE_TTL_MS = 10_000
export const POLL_INTERVAL = ACTIVE_USERS_CACHE_TTL_MS // Poll every 10 seconds
export const MAX_FAILURES = 3
export const RECOVERY_DELAY = 30_000 // Retry after circuit breaker trips
export const ACTIVE_USERS_FETCH_MIN_INTERVAL_MS = 2_000
export const SMOOTHING_WINDOW = 5 // Keep last 5 counts
/** Timeout for fetch() call to the active-users endpoint */
const ACTIVE_USERS_FETCH_TIMEOUT_MS = 5_000

// Singleton state to share across all hook instances
let sharedInfo: ActiveUsersInfo = { activeUsers: 0, totalConnections: 0 }
let pollStarted = false
let pollInterval: ReturnType<typeof setInterval> | null = null
let consecutiveFailures = 0
let hasFetchedOnce = false
/** Pending recovery timer — tracked to prevent duplicate recovery loops on rapid failures */
let recoveryTimer: ReturnType<typeof setTimeout> | null = null

export const subscribers = new Set<(info: ActiveUsersInfo) => void>()
export const stateSubscribers = new Set<(state: ActiveUsersHookState) => void>()

// Shared fetch coordination for route churn and duplicate subscribers
let activeUsersFetchPromise: Promise<void> | null = null
let activeUsersFetchController: AbortController | null = null
let activeUsersFetchTimer: ReturnType<typeof setTimeout> | null = null
let lastActiveUsersFetchAt = 0

// Smoothing for unstable Netlify Blobs counts (eventual consistency causes fluctuations)
const recentCounts: number[] = []

// ── State accessors ──

export function getSharedInfo(): ActiveUsersInfo { return sharedInfo }
export function getHasFetchedOnce(): boolean { return hasFetchedOnce }
export function getPollStarted(): boolean { return pollStarted }
export function resetConsecutiveFailures(): void { consecutiveFailures = 0 }

// ── Pub/sub ──

export function notifySubscribers(state?: ActiveUsersHookState): void {
  subscribers.forEach(fn => fn(sharedInfo))
  if (state) {
    stateSubscribers.forEach(fn => fn(state))
  }
}

// ── Fetch coordination ──

function scheduleActiveUsersFetch(delayMs: number): void {
  if (activeUsersFetchTimer) return

  activeUsersFetchTimer = setTimeout(() => {
    activeUsersFetchTimer = null
    void fetchActiveUsers(true)
  }, delayMs)
}

export function abortActiveUsersFetch(): void {
  if (activeUsersFetchTimer) { clearTimeout(activeUsersFetchTimer); activeUsersFetchTimer = null }
  if (activeUsersFetchController) { activeUsersFetchController.abort(); activeUsersFetchController = null }
  activeUsersFetchPromise = null
}

// ── Core fetch ──

export async function fetchActiveUsers(bypassThrottle = false): Promise<void> {
  // Stop polling after too many consecutive failures, but schedule recovery
  if (consecutiveFailures >= MAX_FAILURES) {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; pollStarted = false }
    notifySubscribers({ error: true })
    // Schedule a single recovery attempt — clear any pending one first to prevent duplicates
    if (recoveryTimer) clearTimeout(recoveryTimer)
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null
      consecutiveFailures = 0
      startPolling()
    }, RECOVERY_DELAY)
    return
  }

  if (activeUsersFetchPromise) {
    return activeUsersFetchPromise
  }

  const elapsedSinceLastFetch = Date.now() - lastActiveUsersFetchAt
  if (!bypassThrottle && elapsedSinceLastFetch < ACTIVE_USERS_FETCH_MIN_INTERVAL_MS) {
    scheduleActiveUsersFetch(ACTIVE_USERS_FETCH_MIN_INTERVAL_MS - elapsedSinceLastFetch)
    return
  }

  lastActiveUsersFetchAt = Date.now()
  const { controller, timeoutId } = createAbortControllerWithTimeout(ACTIVE_USERS_FETCH_TIMEOUT_MS)
  activeUsersFetchController = controller

  activeUsersFetchPromise = (async () => {
    try {
      const resp = await fetch('/api/active-users', { signal: controller.signal })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      // Guard: if the response is HTML (e.g. Netlify SPA catch-all returning
      // index.html because MSW hasn't intercepted yet), skip JSON parsing
      // entirely to avoid SyntaxError: Unexpected token '<' console noise.
      if (!isJsonResponse(resp)) throw new Error('Non-JSON response (likely HTML fallback)')
      // Use .catch() on .json() to prevent Firefox from firing unhandledrejection
      // before the outer try/catch processes the rejection (microtask timing issue).
      const data = await resp.json().catch(() => null) as ActiveUsersInfo | null
      if (!data) throw new Error('Invalid JSON response')
      if (!Number.isFinite(data.activeUsers)) throw new Error('Invalid activeUsers value')
      consecutiveFailures = 0 // Reset on success

      // Smooth the count to handle Netlify Blobs eventual consistency fluctuations
      // Use the max of recent counts since undercounting is more common than overcounting
      recentCounts.push(data.activeUsers)
      if (recentCounts.length > SMOOTHING_WINDOW) recentCounts.shift()
      const smoothedCount = Math.max(...recentCounts)

      const smoothedData: ActiveUsersInfo = {
        activeUsers: smoothedCount,
        totalConnections: smoothedCount
      }

      const dataChanged = smoothedData.activeUsers !== sharedInfo.activeUsers ||
        smoothedData.totalConnections !== sharedInfo.totalConnections
      if (dataChanged) {
        sharedInfo = smoothedData
      }
      // Always notify on first success (clears loading state) or when data changes
      if (!hasFetchedOnce || dataChanged) {
        hasFetchedOnce = true
        notifySubscribers({ loading: false, error: false })
      }
    } catch (error) {
      if (isAbortError(error)) return

      consecutiveFailures++
      // API not available, keep current state
      notifySubscribers({ error: consecutiveFailures >= MAX_FAILURES })
    } finally {
      clearTimeout(timeoutId)
      if (activeUsersFetchController === controller) {
        activeUsersFetchController = null
      }
      activeUsersFetchPromise = null
    }
  })()

  return activeUsersFetchPromise
}

// ── Polling lifecycle ──

export function startPolling(): void {
  if (pollStarted) return
  pollStarted = true
  consecutiveFailures = 0 // Reset failures on new start

  // Cancel any pending recovery timer since we're starting fresh
  if (recoveryTimer) { clearTimeout(recoveryTimer); recoveryTimer = null }

  // Notify loading state
  notifySubscribers({ loading: true, error: false })

  // Initial fetch
  fetchActiveUsers()

  // Clear any orphaned interval before creating a new one (guards against zombie loops)
  if (pollInterval) clearInterval(pollInterval)
  pollInterval = setInterval(fetchActiveUsers, POLL_INTERVAL)
}

export function stopPolling(): void {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; pollStarted = false }
  if (recoveryTimer) { clearTimeout(recoveryTimer); recoveryTimer = null }
}

// ── State reset (tests only) ──

export function resetPollingState(): void {
  sharedInfo = { activeUsers: 0, totalConnections: 0 }
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
  if (recoveryTimer) { clearTimeout(recoveryTimer); recoveryTimer = null }
  pollStarted = false
  consecutiveFailures = 0
  hasFetchedOnce = false
  subscribers.clear()
  stateSubscribers.clear()
  if (activeUsersFetchTimer) { clearTimeout(activeUsersFetchTimer); activeUsersFetchTimer = null }
  if (activeUsersFetchController) { activeUsersFetchController.abort(); activeUsersFetchController = null }
  activeUsersFetchPromise = null
  lastActiveUsersFetchAt = 0
  recentCounts.length = 0
}
