import { useState, useEffect, useCallback } from 'react'

export interface TokenUsage {
  used: number
  limit: number
  warningThreshold: number
  criticalThreshold: number
  stopThreshold: number
  resetDate: string
}

export type TokenAlertLevel = 'normal' | 'warning' | 'critical' | 'stopped'

const STORAGE_KEY = 'kubestellar-token-usage'
const SETTINGS_KEY = 'kubestellar-token-settings'

const DEFAULT_SETTINGS = {
  limit: 100000, // 100k tokens
  warningThreshold: 0.7, // 70%
  criticalThreshold: 0.9, // 90%
  stopThreshold: 1.0, // 100%
}

export function useTokenUsage() {
  const [usage, setUsage] = useState<TokenUsage>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY)
      const settings = localStorage.getItem(SETTINGS_KEY)
      const parsedSettings = settings ? JSON.parse(settings) : DEFAULT_SETTINGS

      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          // Check if reset date has passed
          const resetDate = new Date(parsed.resetDate)
          if (new Date() > resetDate) {
            // Reset usage for new month
            const newUsage = {
              used: 0,
              ...parsedSettings,
              resetDate: getNextResetDate(),
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newUsage))
            return newUsage
          }
          return { ...parsed, ...parsedSettings }
        } catch {
          return {
            used: 0,
            ...parsedSettings,
            resetDate: getNextResetDate(),
          }
        }
      }
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

  // Persist usage changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage))
  }, [usage])

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
