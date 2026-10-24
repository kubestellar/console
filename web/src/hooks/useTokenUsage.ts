import { useState, useEffect } from 'react'
import { isAgentUnavailable, reportAgentDataSuccess, reportAgentDataError } from './useLocalAgent'
import { getDemoMode } from './useDemoMode'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { QUICK_ABORT_TIMEOUT_MS } from '../lib/constants/network'
import type { TokenCategory, TokenUsage, TokenAlertLevel } from './useTokenUsage.types'
import {
  DEFAULT_SETTINGS,
  DEFAULT_BY_CATEGORY,
  getTokenAlertLevel,
  reconcileUsageBreakdown,
  getUsagePeriodKey,
  getNextResetDate,
} from './useTokenUsage.math'
import {
  MAX_SINGLE_DELTA_TOKENS,
  MIN_STOP_THRESHOLD,
  LAST_KNOWN_USAGE_KEY,
  AGENT_SESSION_KEY,
  DEFAULT_CATEGORY,
  TOKEN_USAGE_FLUSH_INTERVAL_MS,
  TOKEN_USAGE_FLUSH_THRESHOLD,
  SETTINGS_KEY,
  CATEGORY_KEY,
  PERIOD_KEY,
  SETTINGS_CHANGED_EVENT,
  POLL_INTERVAL_MS,
  DEMO_TOKEN_USAGE,
  DEMO_BY_CATEGORY,
} from './useTokenUsage.constants'
import {
  tokenUsageState,
  subscribers,
  activeCategoriesByOp,
  loadPersistedUsage,
  persistUsage,
  resetUsagePeriodState,
  rollOverUsagePeriodIfNeeded,
  hydrateFromBackend,
  queueBackendDelta,
  updateSharedUsage,
} from './useTokenUsage.store'

export type { TokenCategory, TokenUsageByCategory, TokenUsage, TokenAlertLevel } from './useTokenUsage.types'
export { getTokenAlertLevel } from './useTokenUsage.math'
export {
  setActiveTokenCategory,
  clearActiveTokenCategory,
  getActiveTokenCategories,
} from './useTokenUsage.store'

let pollStarted = false
let pollIntervalId: ReturnType<typeof setInterval> | null = null

// Initialize from localStorage
if (typeof window !== 'undefined') {
  tokenUsageState.currentUsagePeriod = localStorage.getItem(PERIOD_KEY) || getUsagePeriodKey()
  try {
    const settings = localStorage.getItem(SETTINGS_KEY)
    if (settings) {
      const parsedSettings = JSON.parse(settings)
      tokenUsageState.sharedUsage = { ...tokenUsageState.sharedUsage, ...parsedSettings }
      // Ensure limit is never zero/negative (causes NaN in percentage calculations)
      if (tokenUsageState.sharedUsage.limit <= 0) tokenUsageState.sharedUsage.limit = DEFAULT_SETTINGS.limit
      // Ensure thresholds are sane — corrupted stopThreshold=0 causes "AI Disabled" at 0% usage
      if (!tokenUsageState.sharedUsage.stopThreshold || tokenUsageState.sharedUsage.stopThreshold < MIN_STOP_THRESHOLD) {
        tokenUsageState.sharedUsage.stopThreshold = DEFAULT_SETTINGS.stopThreshold
      }
      if (!tokenUsageState.sharedUsage.criticalThreshold || tokenUsageState.sharedUsage.criticalThreshold <= 0) {
        tokenUsageState.sharedUsage.criticalThreshold = DEFAULT_SETTINGS.criticalThreshold
      }
      if (!tokenUsageState.sharedUsage.warningThreshold || tokenUsageState.sharedUsage.warningThreshold <= 0) {
        tokenUsageState.sharedUsage.warningThreshold = DEFAULT_SETTINGS.warningThreshold
      }
    }
  } catch {
    // Corrupted settings JSON — fall back to defaults.
  }
  // Load persisted category data only for the active day.
  try {
    if (tokenUsageState.currentUsagePeriod === getUsagePeriodKey()) {
      const categoryData = localStorage.getItem(CATEGORY_KEY)
      if (categoryData) {
        const parsedCategories = JSON.parse(categoryData)
        tokenUsageState.sharedUsage.byCategory = { ...DEFAULT_BY_CATEGORY, ...parsedCategories }
      }
    } else {
      resetUsagePeriodState(getUsagePeriodKey())
    }
  } catch {
    // Ignore invalid data — start from zeroed byCategory.
  }
  // Set demo usage if in demo mode
  if (getDemoMode()) {
    tokenUsageState.sharedUsage.used = DEMO_TOKEN_USAGE
    tokenUsageState.sharedUsage.byCategory = { ...DEMO_BY_CATEGORY }
  }
}

// Fetch token usage from local agent (singleton - only runs once)
async function fetchTokenUsage() {
  rollOverUsagePeriodIfNeeded(true)

  // Use demo data when in demo mode
  if (getDemoMode()) {
    // Simulate slow token accumulation in demo mode
    const randomIncrease = Math.floor(Math.random() * 5000) // 0-5000 tokens
    const totalUsed = DEMO_TOKEN_USAGE + randomIncrease
    updateSharedUsage({
      used: totalUsed,
      byCategory: reconcileUsageBreakdown(totalUsed, { ...DEMO_BY_CATEGORY }),
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
          tokenUsageState.lastKnownSessionId !== null &&
          reportedSessionId !== tokenUsageState.lastKnownSessionId
        const wentBackwards = tokenUsageState.lastKnownUsage !== null && totalUsed < tokenUsageState.lastKnownUsage
        const isRestart = sessionChanged || wentBackwards

        if (isRestart || tokenUsageState.lastKnownUsage === null) {
          // Reset baseline without attributing any delta. On first init
          // (lastKnownUsage === null) we also take this branch to establish
          // a baseline without pretending all current usage happened just now.
          // All usage is folded into "other" since we can't attribute it.
          updateSharedUsage({
            used: totalUsed,
            byCategory: { missions: 0, diagnose: 0, insights: 0, predictions: 0, other: totalUsed },
            resetDate,
          })
        } else if (totalUsed > tokenUsageState.lastKnownUsage) {
          const delta = totalUsed - tokenUsageState.lastKnownUsage
          // Sanity check: don't attribute more than MAX_SINGLE_DELTA_TOKENS
          // at once (likely a bug / init race).
          if (delta < MAX_SINGLE_DELTA_TOKENS) {
            const activeCount = activeCategoriesByOp.size
            if (activeCount === 0) {
              // No active operation — attribute to the default category.
              const newByCategory = { ...tokenUsageState.sharedUsage.byCategory }
              newByCategory[DEFAULT_CATEGORY] += delta
              updateSharedUsage({ used: totalUsed, byCategory: reconcileUsageBreakdown(totalUsed, newByCategory), resetDate })
              queueBackendDelta(DEFAULT_CATEGORY, delta)
            } else if (activeCount === 1) {
              // Single operation — attribute the entire delta to it.
              const category = activeCategoriesByOp.values().next().value as TokenCategory
              const newByCategory = { ...tokenUsageState.sharedUsage.byCategory }
              newByCategory[category] += delta
              updateSharedUsage({ used: totalUsed, byCategory: reconcileUsageBreakdown(totalUsed, newByCategory), resetDate })
              queueBackendDelta(category, delta)
            } else {
              // Multiple concurrent operations — split the delta evenly
              // across all active operations. This is a best-effort
              // heuristic: the local agent reports only an aggregate count,
              // so we cannot perfectly attribute per-operation usage. Any
              // remainder from integer division goes to the first operation.
              const perOp = Math.floor(delta / activeCount)
              const remainder = delta - perOp * activeCount
              const newByCategory = { ...tokenUsageState.sharedUsage.byCategory }
              let first = true
              for (const category of activeCategoriesByOp.values()) {
                const portion = perOp + (first ? remainder : 0)
                newByCategory[category] += portion
                queueBackendDelta(category, portion)
                first = false
              }
              updateSharedUsage({ used: totalUsed, byCategory: reconcileUsageBreakdown(totalUsed, newByCategory), resetDate })
            }
          } else {
            console.warn(`[TokenUsage] Skipping large delta ${delta} - likely initialization`)
            // Large delta is likely a restart or initialization - fold into "other"
            updateSharedUsage({
              used: totalUsed,
              byCategory: { missions: 0, diagnose: 0, insights: 0, predictions: 0, other: totalUsed },
              resetDate,
            })
          }
        } else {
          // totalUsed === lastKnownUsage — nothing to attribute.
          updateSharedUsage({
            used: totalUsed,
            byCategory: reconcileUsageBreakdown(totalUsed, tokenUsageState.sharedUsage.byCategory),
            resetDate,
          })
        }

        tokenUsageState.lastKnownUsage = totalUsed
        if (reportedSessionId !== null) {
          tokenUsageState.lastKnownSessionId = reportedSessionId
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
  pollIntervalId = setInterval(fetchTokenUsage, POLL_INTERVAL_MS)
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
  const [usage, setUsage] = useState<TokenUsage>(tokenUsageState.sharedUsage)

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
    setUsage(tokenUsageState.sharedUsage)

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
      if (!settings) {
        return
      }

      try {
        const parsedSettings = JSON.parse(settings)
        updateSharedUsage(parsedSettings)
      } catch (err) {
        // Non-critical: malformed optional storage event data; skip processing and continue
        console.error('[TokenUsage] Ignoring malformed settings JSON from storage event:', err)
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
    const newByCategory = { ...tokenUsageState.sharedUsage.byCategory }
    newByCategory[category] += tokens
    updateSharedUsage({
      used: tokenUsageState.sharedUsage.used + tokens,
      byCategory: newByCategory })
  }

  // Update settings
  const updateSettings = (settings: Partial<Omit<TokenUsage, 'used' | 'resetDate'>>) => {
      const newSettings = {
        // Use || (not ??) so that 0 falls back to defaults — 0 is never a valid threshold
        limit: settings.limit || tokenUsageState.sharedUsage.limit || DEFAULT_SETTINGS.limit,
        warningThreshold: settings.warningThreshold || tokenUsageState.sharedUsage.warningThreshold || DEFAULT_SETTINGS.warningThreshold,
        criticalThreshold: settings.criticalThreshold || tokenUsageState.sharedUsage.criticalThreshold || DEFAULT_SETTINGS.criticalThreshold,
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
      localStorage.setItem(PERIOD_KEY, tokenUsageState.currentUsagePeriod)
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

/**
 * Global function to add category tokens without needing a hook.
 * Use this from contexts/providers that can't call hooks directly.
 * Also increments the total `used` count so the widget reflects real usage
 * even when the kc-agent health poll doesn't return token data.
 * (The agent poll sets `used` to an absolute value, which corrects any drift.)
 */
export function addCategoryTokens(tokens: number, category: TokenCategory = 'other') {
  if (tokens <= 0) return
  const newByCategory = { ...tokenUsageState.sharedUsage.byCategory }
  newByCategory[category] += tokens
  updateSharedUsage({
    used: tokenUsageState.sharedUsage.used + tokens,
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
