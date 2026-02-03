import { useState, useEffect, useCallback } from 'react'
import { isAgentUnavailable, reportAgentDataSuccess, reportAgentDataError } from './useLocalAgent'
import { getDemoMode } from './useDemoMode'

export interface TokenUsage {
  used: number
  limit: number
  warningThreshold: number
  criticalThreshold: number
  stopThreshold: number
  resetDate: string
}

export type TokenAlertLevel = 'normal' | 'warning' | 'critical' | 'stopped'

const SETTINGS_KEY = 'kubestellar-token-settings'
const SETTINGS_CHANGED_EVENT = 'kubestellar-token-settings-changed'
const LOCAL_AGENT_URL = 'http://127.0.0.1:8585'
const POLL_INTERVAL = 30000 // Poll every 30 seconds

const DEFAULT_SETTINGS = {
  limit: 5000000, // 5M tokens (realistic for Claude usage)
  warningThreshold: 0.7, // 70%
  criticalThreshold: 0.9, // 90%
  stopThreshold: 1.0, // 100%
}

// Demo mode token usage - simulate realistic usage
const DEMO_TOKEN_USAGE = 1247832 // ~25% of 5M limit

// Singleton state - shared across all hook instances
let sharedUsage: TokenUsage = {
  used: 0,
  ...DEFAULT_SETTINGS,
  resetDate: getNextResetDate(),
}
let pollStarted = false
const subscribers = new Set<(usage: TokenUsage) => void>()

// Initialize from localStorage
if (typeof window !== 'undefined') {
  const settings = localStorage.getItem(SETTINGS_KEY)
  if (settings) {
    const parsedSettings = JSON.parse(settings)
    sharedUsage = { ...sharedUsage, ...parsedSettings }
  }
  // Set demo usage if in demo mode
  if (getDemoMode()) {
    sharedUsage.used = DEMO_TOKEN_USAGE
  }
}

// Notify all subscribers
function notifySubscribers() {
  subscribers.forEach(fn => fn(sharedUsage))
}

// Update shared usage (only notifies if actually changed)
function updateSharedUsage(updates: Partial<TokenUsage>, forceNotify = false) {
  const prevUsage = sharedUsage
  sharedUsage = { ...sharedUsage, ...updates }

  // Only notify if value actually changed (prevents UI flashing on background polls)
  const hasChanged = forceNotify ||
    prevUsage.used !== sharedUsage.used ||
    prevUsage.limit !== sharedUsage.limit ||
    prevUsage.warningThreshold !== sharedUsage.warningThreshold ||
    prevUsage.criticalThreshold !== sharedUsage.criticalThreshold ||
    prevUsage.stopThreshold !== sharedUsage.stopThreshold

  if (hasChanged) {
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
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    const response = await fetch(`${LOCAL_AGENT_URL}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (response.ok) {
      reportAgentDataSuccess()
      const data = await response.json()
      if (data.claude?.tokenUsage?.today) {
        const todayTokens = data.claude.tokenUsage.today
        // Track both input and output tokens
        const totalUsed = (todayTokens.input || 0) + (todayTokens.output || 0)
        updateSharedUsage({ used: totalUsed })
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

  // Poll at interval
  setInterval(fetchTokenUsage, POLL_INTERVAL)
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
  const getAlertLevel = useCallback((): TokenAlertLevel => {
    const percentage = usage.used / usage.limit
    if (percentage >= usage.stopThreshold) return 'stopped'
    if (percentage >= usage.criticalThreshold) return 'critical'
    if (percentage >= usage.warningThreshold) return 'warning'
    return 'normal'
  }, [usage])

  // Add tokens used
  const addTokens = useCallback((tokens: number) => {
    updateSharedUsage({ used: sharedUsage.used + tokens })
  }, [])

  // Update settings
  const updateSettings = useCallback(
    (settings: Partial<Omit<TokenUsage, 'used' | 'resetDate'>>) => {
      const newSettings = {
        limit: settings.limit ?? sharedUsage.limit,
        warningThreshold: settings.warningThreshold ?? sharedUsage.warningThreshold,
        criticalThreshold: settings.criticalThreshold ?? sharedUsage.criticalThreshold,
        stopThreshold: settings.stopThreshold ?? sharedUsage.stopThreshold,
      }
      updateSharedUsage(newSettings)
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings))
      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT))
    },
    []
  )

  // Reset usage
  const resetUsage = useCallback(() => {
    updateSharedUsage({
      used: 0,
      resetDate: getNextResetDate(),
    })
  }, [])

  // Check if AI features should be disabled
  const isAIDisabled = useCallback(() => {
    return getAlertLevel() === 'stopped'
  }, [getAlertLevel])

  const alertLevel = getAlertLevel()
  const percentage = Math.min((usage.used / usage.limit) * 100, 100)
  const remaining = Math.max(usage.limit - usage.used, 0)

  return {
    usage,
    alertLevel,
    percentage,
    remaining,
    addTokens,
    updateSettings,
    resetUsage,
    isAIDisabled,
  }
}

function getNextResetDate(): string {
  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return nextMonth.toISOString()
}
