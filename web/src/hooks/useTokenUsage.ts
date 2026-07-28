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
import {
  MAX_SINGLE_DELTA_TOKENS,
  MIN_STOP_THRESHOLD,
  LAST_KNOWN_USAGE_KEY,
  AGENT_SESSION_KEY,
  DEFAULT_CATEGORY_VALUE,
  TOKEN_USAGE_FLUSH_INTERVAL_MS,
  TOKEN_USAGE_FLUSH_THRESHOLD,
  SETTINGS_KEY,
  CATEGORY_KEY,
  PERIOD_KEY,
  SETTINGS_CHANGED_EVENT,
  POLL_INTERVAL_MS,
  DEFAULT_SETTINGS,
  DEFAULT_BY_CATEGORY,
  DEMO_TOKEN_USAGE,
  DEMO_BY_CATEGORY,
  type TokenCategory,
  type TokenUsage,
  type TokenUsageByCategory,
  type TokenAlertLevel,
} from './tokenUsage.types'
import {
  getTokenAlertLevel,
  reconcileUsageBreakdown,
  getNextResetDate,
  getUsagePeriodKey,
  loadPersistedUsage,
  persistUsage,
} from './tokenUsage.math'

export type { TokenCategory, TokenUsageByCategory, TokenUsage, TokenAlertLevel }
export { getTokenAlertLevel }

const DEFAULT_CATEGORY: TokenCategory = DEFAULT_CATEGORY_VALUE

// Singleton state - shared across all hook instances
let sharedUsage: TokenUsage = {
  used: 0,
  ...DEFAULT_SETTINGS,
  resetDate: getNextResetDate(),
  byCategory: { ...DEFAULT_BY_CATEGORY },
}
let currentUsagePeriod = getUsagePeriodKey()
let pollStarted = false
let pollIntervalId: ReturnType<typeof setInterval> | null = null
const subscribers = new Set<(usage: TokenUsage) => void>()

// Track all active AI operations for attributing token usage.
const activeCategoriesByOp = new Map<string, TokenCategory>()

// Persisted baseline for total token count reported by the local agent.
let lastKnownUsage: number | null = null
let lastKnownSessionId: string | null = null

/**
 * Set the active token category for a specific operation id.
 * The opId should be stable for the lifetime of the operation.
 */
export function setActiveTokenCategory(opId: string, category: TokenCategory) {
  activeCategoriesByOp.set(opId, category)
}

/** Clear the active token category for a specific operation id. */
export function clearActiveTokenCategory(opId: string) {
  activeCategoriesByOp.delete(opId)
}

/** Return the set of currently active categories. Exposed for debugging. */
export function getActiveTokenCategories(): TokenCategory[] {
  return Array.from(activeCategoriesByOp.values())
}

// --- Backend persistence layer -------------------------------------------------

/** True once we've successfully hydrated `sharedUsage` from the backend. */
let backendHydrated = false
/** True if a previous backend call returned 401 — disables further calls. */
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
    const merged: TokenUsageByCategory = { ...sharedUsage.byCategory }
    for (const cat of ['missions', 'diagnose', 'insights', 'predictions', 'other'] as const) {
      const v = record.tokens_by_category?.[cat]
      if (typeof v === 'number' && Number.isFinite(v)) merged[cat] = v
    }
    if (record.last_agent_session_id) lastKnownSessionId = record.last_agent_session_id
    const used = Math.max(sharedUsage.used, record.total_tokens)
    updateSharedUsage({ used, byCategory: reconcileUsageBreakdown(used, merged), resetDate: getNextResetDate() }, true)
  } catch (err: unknown) {
    if (err instanceof TokenUsageUnauthenticatedError) {
      backendUnauthenticated = true
    }
    // Network / 5xx — leave backendHydrated=false so we retry on the next mount.
  }
}

function queueBackendDelta(category: TokenCategory, delta: number): void {
  if (backendUnauthenticated || typeof window === 'undefined' || getDemoMode() || delta <= 0) return
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
  if (flushTimerId !== null) { clearTimeout(flushTimerId); flushTimerId = null }
  if (pendingDeltas.size === 0) return
  const snapshot = Array.from(pendingDeltas.entries())
  pendingDeltas.clear()
  pendingDeltaTotal = 0
  for (const [category, delta] of snapshot) {
    if (delta <= 0) continue
    try {
      await postTokenDelta({ category, delta, agent_session_id: lastKnownSessionId ?? '' })
    } catch (err: unknown) {
      if (err instanceof TokenUsageUnauthenticatedError) { backendUnauthenticated = true; return }
      pendingDeltas.set(category, (pendingDeltas.get(category) ?? 0) + delta)
      pendingDeltaTotal += delta
    }
  }
}

function flushPendingDeltasOnPagehide(): void {
  if (backendUnauthenticated || pendingDeltas.size === 0) return
  if (typeof navigator.sendBeacon !== 'function') return
  for (const [category, delta] of pendingDeltas.entries()) {
    if (delta <= 0) continue
    const body = new Blob(
      [JSON.stringify({ category, delta, agent_session_id: lastKnownSessionId ?? '' })],
      { type: 'application/json' },
    )
    try { navigator.sendBeacon('/api/token-usage/delta', body) } catch { /* best effort */ }
  }
  pendingDeltas.clear()
  pendingDeltaTotal = 0
}

if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
  const existing = (window as unknown as { __kcTokenUsagePagehide?: () => void }).__kcTokenUsagePagehide
  if (existing) window.removeEventListener('pagehide', existing)
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
      if (sharedUsage.limit <= 0) sharedUsage.limit = DEFAULT_SETTINGS.limit
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
  } catch { /* Corrupted settings JSON — fall back to defaults. */ }
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
  } catch { /* Ignore invalid data — start from zeroed byCategory. */ }
  if (getDemoMode()) {
    sharedUsage.used = DEMO_TOKEN_USAGE
    sharedUsage.byCategory = { ...DEMO_BY_CATEGORY }
  }
}

// Hydrate in-memory baseline from localStorage at module init
{
  const persisted = loadPersistedUsage()
  lastKnownUsage = persisted.lastKnown
  lastKnownSessionId = persisted.sessionId
}

function notifySubscribers() {
  subscribers.forEach(fn => fn(sharedUsage))
}

function updateSharedUsage(updates: Partial<TokenUsage>, forceNotify = false) {
  const prevUsage = sharedUsage
  const prevByCategory = { ...sharedUsage.byCategory }
  sharedUsage = { ...sharedUsage, ...updates }
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
    if (byCategoryChanged && typeof window !== 'undefined' && !getDemoMode()) {
      localStorage.setItem(CATEGORY_KEY, JSON.stringify(sharedUsage.byCategory))
      localStorage.setItem(PERIOD_KEY, currentUsagePeriod)
    }
    notifySubscribers()
  }
}

function resetUsagePeriodState(nextPeriod: string, forceNotify = false): void {
  currentUsagePeriod = nextPeriod
  sharedUsage = { ...sharedUsage, used: 0, resetDate: getNextResetDate(), byCategory: { ...DEFAULT_BY_CATEGORY } }
  lastKnownUsage = null
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CATEGORY_KEY)
    localStorage.removeItem(LAST_KNOWN_USAGE_KEY)
    localStorage.setItem(PERIOD_KEY, currentUsagePeriod)
  }
  if (flushTimerId !== null) { clearTimeout(flushTimerId); flushTimerId = null }
  pendingDeltas.clear()
  pendingDeltaTotal = 0
  if (forceNotify) notifySubscribers()
}

function rollOverUsagePeriodIfNeeded(forceNotify = false): void {
  const nextPeriod = getUsagePeriodKey()
  if (currentUsagePeriod === nextPeriod) return
  resetUsagePeriodState(nextPeriod, forceNotify)
}

async function fetchTokenUsage() {
  rollOverUsagePeriodIfNeeded(true)
  if (getDemoMode()) {
    const randomIncrease = Math.floor(Math.random() * 5000)
    const totalUsed = DEMO_TOKEN_USAGE + randomIncrease
    updateSharedUsage({
      used: totalUsed,
      byCategory: reconcileUsageBreakdown(totalUsed, { ...DEMO_BY_CATEGORY }),
      resetDate: getNextResetDate(),
    })
    return
  }
  if (isAgentUnavailable()) return
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), QUICK_ABORT_TIMEOUT_MS)
    const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (response.ok) {
      reportAgentDataSuccess()
      const data = await response.json().catch(() => null)
      if (!data) throw new Error('Invalid JSON response from health endpoint')
      if (data.claude?.tokenUsage?.today) {
        const todayTokens = data.claude.tokenUsage.today
        const resetDate = getNextResetDate()
        const totalUsed = (todayTokens.input || 0) + (todayTokens.output || 0)
        const reportedSessionId: string | null = data.claude?.agentSessionId ?? null
        const sessionChanged = reportedSessionId !== null && lastKnownSessionId !== null &&
          reportedSessionId !== lastKnownSessionId
        const wentBackwards = lastKnownUsage !== null && totalUsed < lastKnownUsage
        const isRestart = sessionChanged || wentBackwards
        if (isRestart || lastKnownUsage === null) {
          updateSharedUsage({
            used: totalUsed,
            byCategory: { missions: 0, diagnose: 0, insights: 0, predictions: 0, other: totalUsed },
            resetDate,
          })
        } else if (totalUsed > lastKnownUsage) {
          const delta = totalUsed - lastKnownUsage
          if (delta < MAX_SINGLE_DELTA_TOKENS) {
            const activeCount = activeCategoriesByOp.size
            if (activeCount === 0) {
              const newByCategory = { ...sharedUsage.byCategory }
              newByCategory[DEFAULT_CATEGORY] += delta
              updateSharedUsage({ used: totalUsed, byCategory: reconcileUsageBreakdown(totalUsed, newByCategory), resetDate })
              queueBackendDelta(DEFAULT_CATEGORY, delta)
            } else if (activeCount === 1) {
              const category = activeCategoriesByOp.values().next().value as TokenCategory
              const newByCategory = { ...sharedUsage.byCategory }
              newByCategory[category] += delta
              updateSharedUsage({ used: totalUsed, byCategory: reconcileUsageBreakdown(totalUsed, newByCategory), resetDate })
              queueBackendDelta(category, delta)
            } else {
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
              updateSharedUsage({ used: totalUsed, byCategory: reconcileUsageBreakdown(totalUsed, newByCategory), resetDate })
            }
          } else {
            console.warn(`[TokenUsage] Skipping large delta ${delta} - likely initialization`)
            updateSharedUsage({
              used: totalUsed,
              byCategory: { missions: 0, diagnose: 0, insights: 0, predictions: 0, other: totalUsed },
              resetDate,
            })
          }
        } else {
          updateSharedUsage({
            used: totalUsed,
            byCategory: reconcileUsageBreakdown(totalUsed, sharedUsage.byCategory),
            resetDate,
          })
        }
        lastKnownUsage = totalUsed
        if (reportedSessionId !== null) lastKnownSessionId = reportedSessionId
        persistUsage(totalUsed, reportedSessionId)
      }
    } else {
      reportAgentDataError('/health (token)', `HTTP ${response.status}`)
    }
  } catch {
    // Error will be tracked by useLocalAgent's health check
  }
}

function startPolling() {
  if (pollStarted) return
  pollStarted = true
  void hydrateFromBackend()
  fetchTokenUsage()
  pollIntervalId = setInterval(fetchTokenUsage, POLL_INTERVAL_MS)
}

function stopPolling() {
  if (!pollStarted) return
  if (pollIntervalId !== null) { clearInterval(pollIntervalId); pollIntervalId = null }
  pollStarted = false
}

export function useTokenUsage() {
  const [usage, setUsage] = useState<TokenUsage>(sharedUsage)

  useEffect(() => {
    startPolling()
    const handleUpdate = (newUsage: TokenUsage) => { setUsage(newUsage) }
    subscribers.add(handleUpdate)
    setUsage(sharedUsage)
    return () => {
      subscribers.delete(handleUpdate)
      if (subscribers.size === 0) stopPolling()
    }
  }, [])

  useEffect(() => {
    const handleSettingsChange = () => {
      const settings = localStorage.getItem(SETTINGS_KEY)
      if (!settings) return
      try {
        const parsedSettings = JSON.parse(settings)
        updateSharedUsage(parsedSettings)
      } catch (err) {
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

  const getAlertLevel = (): TokenAlertLevel => getTokenAlertLevel(usage)

  const addTokens = (tokens: number, category: TokenCategory = 'other') => {
    const newByCategory = { ...sharedUsage.byCategory }
    newByCategory[category] += tokens
    updateSharedUsage({ used: sharedUsage.used + tokens, byCategory: newByCategory })
  }

  const updateSettings = (settings: Partial<Omit<TokenUsage, 'used' | 'resetDate'>>) => {
    const newSettings = {
      limit: settings.limit || sharedUsage.limit || DEFAULT_SETTINGS.limit,
      warningThreshold: settings.warningThreshold || sharedUsage.warningThreshold || DEFAULT_SETTINGS.warningThreshold,
      criticalThreshold: settings.criticalThreshold || sharedUsage.criticalThreshold || DEFAULT_SETTINGS.criticalThreshold,
      stopThreshold: DEFAULT_SETTINGS.stopThreshold,
    }
    updateSharedUsage(newSettings)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings))
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT))
    window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
  }

  const resetUsage = () => {
    updateSharedUsage({ used: 0, resetDate: getNextResetDate(), byCategory: { ...DEFAULT_BY_CATEGORY } }, true)
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CATEGORY_KEY)
      localStorage.setItem(PERIOD_KEY, currentUsagePeriod)
    }
  }

  const isAIDisabled = () => getAlertLevel() === 'stopped'
  const alertLevel = getAlertLevel()
  const percentage = usage.limit > 0 ? Math.min((usage.used / usage.limit) * 100, 100) : 0
  const remaining = Math.max(usage.limit - usage.used, 0)
  const isDemoData = getDemoMode()

  return { usage, alertLevel, percentage, remaining, addTokens, updateSettings, resetUsage, isAIDisabled, isDemoData }
}

/**
 * Global function to add category tokens without needing a hook.
 */
export function addCategoryTokens(tokens: number, category: TokenCategory = 'other') {
  if (tokens <= 0) return
  const newByCategory = { ...sharedUsage.byCategory }
  newByCategory[category] += tokens
  updateSharedUsage({ used: sharedUsage.used + tokens, byCategory: newByCategory })
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
