import { useState, useEffect, useCallback } from 'react'
import { POLL_INTERVAL_SLOW_MS } from '../lib/constants/network'
import { MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../lib/constants/time'
import { emitSnoozed, emitUnsnoozed } from '../lib/analytics'
import { useLocalStorage } from './useLocalStorage'

const STORAGE_KEY = 'kubestellar-snoozed-alerts'

function safeJsonParse<T>(raw: string, fallback: T, context: string): T {
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    console.warn(`[useSnoozedAlerts] Failed to parse ${context}, using default`, err)
    return fallback
  }
}

// Snooze duration options in milliseconds
export const SNOOZE_DURATIONS = {
  '5m': 5 * MS_PER_MINUTE,
  '15m': 15 * MS_PER_MINUTE,
  '1h': MS_PER_HOUR,
  '4h': 4 * MS_PER_HOUR,
  '24h': MS_PER_DAY } as const

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

const DEFAULT_STATE: StoredState = { snoozed: [] }

function deserializeStoredState(raw: string): StoredState {
  const parsed = safeJsonParse<StoredState>(raw, DEFAULT_STATE, 'snoozed alerts')
  const now = Date.now()

  return {
    snoozed: (parsed.snoozed || []).filter((snoozedAlert: SnoozedAlert) => snoozedAlert.expiresAt > now),
  }
}

function cloneState(): StoredState {
  return {
    snoozed: [...state.snoozed],
  }
}

// Module-level state for cross-component sharing
let state: StoredState = DEFAULT_STATE
const listeners: Set<() => void> = new Set()

function notifyListeners() {
  listeners.forEach((listener) => listener())
}

export function useSnoozedAlerts() {
  const [storedState, setStoredState] = useLocalStorage<StoredState>(STORAGE_KEY, DEFAULT_STATE, {
    deserialize: deserializeStoredState,
  })
  const [localState, setLocalState] = useState<StoredState>(storedState)

  useEffect(() => {
    state = storedState
    setLocalState(storedState)
  }, [storedState])

  const persistState = useCallback((nextState: StoredState) => {
    state = nextState
    setLocalState(nextState)
    setStoredState(nextState)
    notifyListeners()
  }, [setStoredState])

  useEffect(() => {
    const listener = () => setLocalState(cloneState())
    listeners.add(listener)

    // Set up timer to auto-refresh when snoozes expire
    const checkExpired = () => {
      const now = Date.now()
      const activeSnoozes = state.snoozed.filter((snoozedAlert) => snoozedAlert.expiresAt > now)

      if (activeSnoozes.length !== state.snoozed.length) {
        persistState({ snoozed: activeSnoozes })
      }
    }

    // Check every minute
    const intervalId = setInterval(checkExpired, POLL_INTERVAL_SLOW_MS)

    return () => {
      listeners.delete(listener)
      clearInterval(intervalId)
    }
  }, [persistState])

  const snoozeAlert = (alertId: string, duration: SnoozeDuration = '1h') => {
    const now = Date.now()
    const nextSnoozed = state.snoozed.filter((snoozedAlert) => snoozedAlert.alertId !== alertId)
    const newSnoozed: SnoozedAlert = {
      alertId,
      snoozedAt: now,
      expiresAt: now + SNOOZE_DURATIONS[duration],
      duration }

    persistState({ snoozed: [...nextSnoozed, newSnoozed] })
    emitSnoozed('alert', duration)
    return newSnoozed
  }

  const snoozeMultiple = (alertIds: string[], duration: SnoozeDuration = '1h') => {
    const now = Date.now()
    const expiresAt = now + SNOOZE_DURATIONS[duration]
    const remainingSnoozes = state.snoozed.filter((snoozedAlert) => !alertIds.includes(snoozedAlert.alertId))

    const newSnoozed: SnoozedAlert[] = alertIds.map((alertId) => ({
      alertId,
      snoozedAt: now,
      expiresAt,
      duration }))

    persistState({ snoozed: [...remainingSnoozes, ...newSnoozed] })
  }

  const unsnoozeAlert = (alertId: string) => {
    persistState({
      snoozed: state.snoozed.filter((snoozedAlert) => snoozedAlert.alertId !== alertId),
    })
    emitUnsnoozed('alert')
  }

  const isSnoozed = useCallback((alertId: string): boolean => {
    const now = Date.now()
    return state.snoozed.some((snoozedAlert) => snoozedAlert.alertId === alertId && snoozedAlert.expiresAt > now)
  }, [localState])

  const getSnoozedAlert = useCallback((alertId: string): SnoozedAlert | null => {
    const now = Date.now()
    return state.snoozed.find((snoozedAlert) => snoozedAlert.alertId === alertId && snoozedAlert.expiresAt > now) || null
  }, [localState])

  const clearAllSnoozed = () => {
    persistState(DEFAULT_STATE)
  }

  // Get time remaining on snooze
  const getSnoozeRemaining = (alertId: string): number | null => {
    const snoozedAlert = state.snoozed.find((entry) => entry.alertId === alertId)
    if (!snoozedAlert) return null
    return Math.max(0, snoozedAlert.expiresAt - Date.now())
  }

  return {
    snoozedAlerts: localState.snoozed,
    snoozedCount: localState.snoozed.length,
    snoozeAlert,
    snoozeMultiple,
    unsnoozeAlert,
    isSnoozed,
    getSnoozedAlert,
    clearAllSnoozed,
    getSnoozeRemaining }
}

// Helper to format time remaining
export function formatSnoozeRemaining(ms: number): string {
  const hours = Math.floor(ms / MS_PER_HOUR)
  const minutes = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m`
  }
  return '<1m'
}
