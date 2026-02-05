import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'kubestellar-snoozed-alerts'

// Snooze duration options in milliseconds
export const SNOOZE_DURATIONS = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
} as const

export type SnoozeDuration = keyof typeof SNOOZE_DURATIONS

export interface SnoozedAlert {
  alertId: string
  snoozedAt: number // timestamp
  expiresAt: number // timestamp
  duration: SnoozeDuration
}

interface StoredState {
  snoozed: SnoozedAlert[]
}

// Module-level state for cross-component sharing
let state: StoredState = { snoozed: [] }
const listeners: Set<() => void> = new Set()

function notifyListeners() {
  listeners.forEach((listener) => listener())
}

function loadState(): StoredState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Clean up expired snoozes
      const now = Date.now()
      parsed.snoozed = (parsed.snoozed || []).filter(
        (s: SnoozedAlert) => s.expiresAt > now
      )
      return parsed
    }
  } catch {
    // Ignore parse errors
  }
  return { snoozed: [] }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

// Initialize on module load
state = loadState()

export function useSnoozedAlerts() {
  const [localState, setLocalState] = useState<StoredState>(state)

  useEffect(() => {
    const listener = () => setLocalState({ ...state })
    listeners.add(listener)

    // Set up timer to auto-refresh when snoozes expire
    const checkExpired = () => {
      const now = Date.now()
      const hadExpired = state.snoozed.some(s => s.expiresAt <= now)
      if (hadExpired) {
        state.snoozed = state.snoozed.filter(s => s.expiresAt > now)
        saveState()
        notifyListeners()
      }
    }

    // Check every minute
    const intervalId = setInterval(checkExpired, 60000)

    return () => {
      listeners.delete(listener)
      clearInterval(intervalId)
    }
  }, [])

  const snoozeAlert = useCallback((alertId: string, duration: SnoozeDuration = '1h') => {
    // Remove existing snooze if present
    state.snoozed = state.snoozed.filter(s => s.alertId !== alertId)

    const now = Date.now()
    const newSnoozed: SnoozedAlert = {
      alertId,
      snoozedAt: now,
      expiresAt: now + SNOOZE_DURATIONS[duration],
      duration,
    }
    state.snoozed = [...state.snoozed, newSnoozed]
    saveState()
    notifyListeners()
    return newSnoozed
  }, [])

  const snoozeMultiple = useCallback((alertIds: string[], duration: SnoozeDuration = '1h') => {
    const now = Date.now()
    const expiresAt = now + SNOOZE_DURATIONS[duration]

    // Remove existing snoozes for these alerts
    state.snoozed = state.snoozed.filter(s => !alertIds.includes(s.alertId))

    // Add new snoozes
    const newSnoozed: SnoozedAlert[] = alertIds.map(alertId => ({
      alertId,
      snoozedAt: now,
      expiresAt,
      duration,
    }))

    state.snoozed = [...state.snoozed, ...newSnoozed]
    saveState()
    notifyListeners()
  }, [])

  const unsnoozeAlert = useCallback((alertId: string) => {
    state.snoozed = state.snoozed.filter(s => s.alertId !== alertId)
    saveState()
    notifyListeners()
  }, [])

  const isSnoozed = useCallback((alertId: string): boolean => {
    const now = Date.now()
    return state.snoozed.some(s => s.alertId === alertId && s.expiresAt > now)
  }, [])

  const getSnoozedAlert = useCallback((alertId: string): SnoozedAlert | null => {
    const now = Date.now()
    return state.snoozed.find(s => s.alertId === alertId && s.expiresAt > now) || null
  }, [])

  const clearAllSnoozed = useCallback(() => {
    state.snoozed = []
    saveState()
    notifyListeners()
  }, [])

  // Get time remaining on snooze
  const getSnoozeRemaining = useCallback((alertId: string): number | null => {
    const snoozed = state.snoozed.find(s => s.alertId === alertId)
    if (!snoozed) return null
    return Math.max(0, snoozed.expiresAt - Date.now())
  }, [])

  return {
    snoozedAlerts: localState.snoozed,
    snoozedCount: localState.snoozed.length,
    snoozeAlert,
    snoozeMultiple,
    unsnoozeAlert,
    isSnoozed,
    getSnoozedAlert,
    clearAllSnoozed,
    getSnoozeRemaining,
  }
}

// Helper to format time remaining
export function formatSnoozeRemaining(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000))
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m`
  }
  return '<1m'
}
