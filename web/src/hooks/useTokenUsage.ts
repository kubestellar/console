import { useState, useEffect } from 'react'
import { isAgentUnavailable, reportAgentDataSuccess, reportAgentDataError } from './useLocalAgent'
import { getDemoMode } from './useDemoMode'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { QUICK_ABORT_TIMEOUT_MS } from '../lib/constants/network'

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

const SETTINGS_KEY = 'kubestellar-token-settings'
const CATEGORY_KEY = 'kubestellar-token-categories'
const SETTINGS_CHANGED_EVENT = 'kubestellar-token-settings-changed'
const POLL_INTERVAL = 30000 // Poll every 30 seconds

const DEFAULT_SETTINGS = {
  limit: 500000000, // 500M tokens monthly default
  warningThreshold: 0.7, // 70%
  criticalThreshold: 0.9, // 90%
  stopThreshold: 1.0, // 100%
}

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

// Hydrate the in-memory baseline from localStorage at module init so that
// page reloads and new tabs don't mis-attribute the entire current usage
// count as fresh delta on the first poll.
{
  const persisted = loadPersistedUsage()
  lastKnownUsage = persisted.lastKnown
  lastKnownSessionId = persisted.sessionId
}

// Initialize from localStorage
if (typeof window !== 'undefined') {
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
  // Load persisted category data
  try {
    const categoryData = localStorage.getItem(CATEGORY_KEY)
    if (categoryData) {
      const parsedCategories = JSON.parse(categoryData)
      sharedUsage.byCategory = { ...DEFAULT_BY_CATEGORY, ...parsedCategories }
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
    byCategoryChanged

  if (hasChanged) {
    // Persist category data to localStorage
    if (byCategoryChanged && typeof window !== 'undefined' && !getDemoMode()) {
      localStorage.setItem(CATEGORY_KEY, JSON.stringify(sharedUsage.byCategory))
    }
    notifySubscribers()
  }
}

// Fetch token usage from local agent (singleton - only runs once)
async function fetchTokenUsage() {
  // Use demo data when in demo mode
  if (getDemoMode()) {
    // Simulate slow token accumulation in demo mode
    const randomIncrease = Math.floor(Math.random() * 5000) // 0-5000 tokens
    updateSharedUsage({ used: DEMO_TOKEN_USAGE + randomIncrease })
    return
  }

  // Skip if agent is known to be unavailable (uses shared state from useLocalAgent)
  if (isAgentUnavailable()) {
    return
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), QUICK_ABORT_TIMEOUT_MS)
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
          updateSharedUsage({ used: totalUsed })
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
              updateSharedUsage({ used: totalUsed, byCategory: newByCategory })
            } else if (activeCount === 1) {
              // Single operation — attribute the entire delta to it.
              const category = activeCategoriesByOp.values().next().value as TokenCategory
              const newByCategory = { ...sharedUsage.byCategory }
              newByCategory[category] += delta
              updateSharedUsage({ used: totalUsed, byCategory: newByCategory })
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
                newByCategory[category] += perOp + (first ? remainder : 0)
                first = false
              }
              updateSharedUsage({ used: totalUsed, byCategory: newByCategory })
            }
          } else {
            console.warn(`[TokenUsage] Skipping large delta ${delta} - likely initialization`)
            updateSharedUsage({ used: totalUsed })
          }
        } else {
          // totalUsed === lastKnownUsage — nothing to attribute.
          updateSharedUsage({ used: totalUsed })
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
  const getAlertLevel = (): TokenAlertLevel => {
    if (usage.limit <= 0) return 'normal'
    const percentage = usage.used / usage.limit
    // Guard: stopThreshold must be positive — 0 would falsely disable AI at 0% usage
    const stop = usage.stopThreshold > 0 ? usage.stopThreshold : DEFAULT_SETTINGS.stopThreshold
    if (percentage >= stop) return 'stopped'
    if (percentage >= usage.criticalThreshold) return 'critical'
    if (percentage >= usage.warningThreshold) return 'warning'
    return 'normal'
  }

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
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return nextMonth.toISOString()
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
