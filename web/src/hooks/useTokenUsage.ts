import { useState, useEffect, useCallback, useRef } from 'react'

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
const LOCAL_AGENT_URL = 'http://127.0.0.1:8585'
const POLL_INTERVAL = 2000 // Poll every 2 seconds for real-time updates

const DEFAULT_SETTINGS = {
  limit: 5000000, // 5M tokens (realistic for Claude usage)
  warningThreshold: 0.7, // 70%
  criticalThreshold: 0.9, // 90%
  stopThreshold: 1.0, // 100%
}

export function useTokenUsage() {
  const [usage, setUsage] = useState<TokenUsage>(() => {
    if (typeof window !== 'undefined') {
      const settings = localStorage.getItem(SETTINGS_KEY)
      const parsedSettings = settings ? JSON.parse(settings) : DEFAULT_SETTINGS
      return {
        used: 0,
        ...parsedSettings,
        resetDate: getNextResetDate(),
      }
    }
    return {
      used: 0,
      ...DEFAULT_SETTINGS,
      resetDate: getNextResetDate(),
    }
  })

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll local agent for real-time token usage
  const fetchTokenUsage = useCallback(async () => {
    try {
      const response = await fetch(`${LOCAL_AGENT_URL}/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      })
      if (response.ok) {
        const data = await response.json()
        if (data.claude?.tokenUsage?.today) {
          // Use today's output tokens - stable and increases throughout the day
          const todayTokens = data.claude.tokenUsage.today
          // Output tokens are the primary metric (what Claude generates)
          setUsage(prev => ({
            ...prev,
            used: todayTokens.output,
          }))
        }
      }
    } catch {
      // Local agent not available, keep current usage
    }
  }, [])

  // Start polling on mount
  useEffect(() => {
    // Initial fetch
    fetchTokenUsage()

    // Set up polling interval
    pollIntervalRef.current = setInterval(fetchTokenUsage, POLL_INTERVAL)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [fetchTokenUsage])

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
    setUsage((prev) => ({
      ...prev,
      used: prev.used + tokens,
    }))
  }, [])

  // Update settings
  const updateSettings = useCallback(
    (settings: Partial<Omit<TokenUsage, 'used' | 'resetDate'>>) => {
      setUsage((prev) => ({
        ...prev,
        ...settings,
      }))
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          limit: settings.limit ?? usage.limit,
          warningThreshold: settings.warningThreshold ?? usage.warningThreshold,
          criticalThreshold: settings.criticalThreshold ?? usage.criticalThreshold,
          stopThreshold: settings.stopThreshold ?? usage.stopThreshold,
        })
      )
    },
    [usage]
  )

  // Reset usage
  const resetUsage = useCallback(() => {
    setUsage((prev) => ({
      ...prev,
      used: 0,
      resetDate: getNextResetDate(),
    }))
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
