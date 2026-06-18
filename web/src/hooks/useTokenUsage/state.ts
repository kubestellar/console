import { useEffect, useState } from 'react'
import { isAgentUnavailable, reportAgentDataError, reportAgentDataSuccess } from '../useLocalAgent'
import { getDemoMode } from '../useDemoMode'
import { LOCAL_AGENT_HTTP_URL } from '../../lib/constants'
import { QUICK_ABORT_TIMEOUT_MS } from '../../lib/constants/network'
import {
  DEFAULT_BY_CATEGORY,
  DEFAULT_CATEGORY,
  DEFAULT_SETTINGS,
  DEMO_BY_CATEGORY,
  DEMO_TOKEN_USAGE,
  MAX_SINGLE_DELTA_TOKENS,
  MIN_STOP_THRESHOLD,
  getNextResetDate,
  getTokenAlertLevel,
  reconcileUsageBreakdown,
} from './accounting'
import {
  CATEGORY_KEY,
  LAST_KNOWN_USAGE_KEY,
  PERIOD_KEY,
  POLL_INTERVAL,
  SETTINGS_CHANGED_EVENT,
  SETTINGS_KEY,
  createBackendSync,
  getUsagePeriodKey,
  loadPersistedUsage,
  persistUsage,
} from './persistence'
import type { TokenAlertLevel, TokenCategory, TokenUsage } from './types'

// Track all active AI operations for attributing token usage.
const activeCategoriesByOp = new Map<string, TokenCategory>()

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

let lastKnownUsage: number | null = null
let lastKnownSessionId: string | null = null

const backendSync = createBackendSync({
  getSharedUsage: () => sharedUsage,
  updateSharedUsage: (updates, forceNotify = false) => updateSharedUsage(updates, forceNotify),
  getLastKnownSessionId: () => lastKnownSessionId,
  setLastKnownSessionId: (id) => {
    lastKnownSessionId = id
  },
})
backendSync.installPagehideHandler()

{
  const persisted = loadPersistedUsage()
  lastKnownUsage = persisted.lastKnown
  lastKnownSessionId = persisted.sessionId
}

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
  } catch {
    // ignore corrupted settings
  }

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
    // ignore invalid category data
  }

  if (getDemoMode()) {
    sharedUsage.used = DEMO_TOKEN_USAGE
    sharedUsage.byCategory = { ...DEMO_BY_CATEGORY }
  }
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

  backendSync.clearPending()

  if (forceNotify) {
    notifySubscribers()
  }
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

  if (isAgentUnavailable()) {
    return
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), QUICK_ABORT_TIMEOUT_MS)
    const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      reportAgentDataError('/health (token)', `HTTP ${response.status}`)
      return
    }

    reportAgentDataSuccess()
    const data = await response.json().catch(() => null)
    if (!data) throw new Error('Invalid JSON response from health endpoint')

    if (!data.claude?.tokenUsage?.today) return

    const todayTokens = data.claude.tokenUsage.today
    const resetDate = getNextResetDate()
    const totalUsed = (todayTokens.input || 0) + (todayTokens.output || 0)

    const reportedSessionId: string | null = data.claude?.agentSessionId ?? null
    const sessionChanged =
      reportedSessionId !== null &&
      lastKnownSessionId !== null &&
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
          backendSync.queueBackendDelta(DEFAULT_CATEGORY, delta)
        } else if (activeCount === 1) {
          const category = activeCategoriesByOp.values().next().value as TokenCategory
          const newByCategory = { ...sharedUsage.byCategory }
          newByCategory[category] += delta
          updateSharedUsage({ used: totalUsed, byCategory: reconcileUsageBreakdown(totalUsed, newByCategory), resetDate })
          backendSync.queueBackendDelta(category, delta)
        } else {
          const perOp = Math.floor(delta / activeCount)
          const remainder = delta - perOp * activeCount
          const newByCategory = { ...sharedUsage.byCategory }
          let first = true
          for (const category of activeCategoriesByOp.values()) {
            const portion = perOp + (first ? remainder : 0)
            newByCategory[category] += portion
            backendSync.queueBackendDelta(category, portion)
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
    if (reportedSessionId !== null) {
      lastKnownSessionId = reportedSessionId
    }
    persistUsage(totalUsed, reportedSessionId)
  } catch {
    // tracked by useLocalAgent health check
  }
}

function startPolling() {
  if (pollStarted) return
  pollStarted = true

  void backendSync.hydrateFromBackend()
  void fetchTokenUsage()
  pollIntervalId = setInterval(fetchTokenUsage, POLL_INTERVAL)
}

function stopPolling() {
  if (!pollStarted) return
  if (pollIntervalId !== null) {
    clearInterval(pollIntervalId)
    pollIntervalId = null
  }
  pollStarted = false
}

export function setActiveTokenCategory(opId: string, category: TokenCategory) {
  activeCategoriesByOp.set(opId, category)
}

export function clearActiveTokenCategory(opId: string) {
  activeCategoriesByOp.delete(opId)
}

export function getActiveTokenCategories(): TokenCategory[] {
  return Array.from(activeCategoriesByOp.values())
}

export function addCategoryTokens(tokens: number, category: TokenCategory = 'other') {
  if (tokens <= 0) return
  const newByCategory = { ...sharedUsage.byCategory }
  newByCategory[category] += tokens
  updateSharedUsage({
    used: sharedUsage.used + tokens,
    byCategory: newByCategory,
  })
}

export function useTokenUsage() {
  const [usage, setUsage] = useState<TokenUsage>(sharedUsage)

  useEffect(() => {
    startPolling()

    const handleUpdate = (newUsage: TokenUsage) => {
      setUsage(newUsage)
    }
    subscribers.add(handleUpdate)
    setUsage(sharedUsage)

    return () => {
      subscribers.delete(handleUpdate)
      if (subscribers.size === 0) {
        stopPolling()
      }
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
    const handleStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY) handleSettingsChange()
    }
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
    updateSharedUsage({
      used: sharedUsage.used + tokens,
      byCategory: newByCategory,
    })
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
    updateSharedUsage({
      used: 0,
      resetDate: getNextResetDate(),
      byCategory: { ...DEFAULT_BY_CATEGORY },
    }, true)

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

  return {
    usage,
    alertLevel,
    percentage,
    remaining,
    addTokens,
    updateSettings,
    resetUsage,
    isAIDisabled,
    isDemoData,
  }
}
