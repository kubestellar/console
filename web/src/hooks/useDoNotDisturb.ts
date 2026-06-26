/**
 * Do Not Disturb (DND) + Quiet Hours for desktop notifications.
 *
 * Three suppression modes, checked in order:
 *   1. Explicit DND toggle (manual "pause all notifications")
 *   2. Timed DND (pause for 1h / 4h / until tomorrow morning)
 *   3. Quiet hours (recurring daily window, e.g. 22:00–08:00)
 *
 * State persisted in localStorage so it survives tab refreshes.
 * The module-level `isDNDActive()` function can be called from
 * non-React contexts (e.g. the notification dispatch in useDeepLink).
 */

import { useState, useEffect, useCallback } from 'react'
import { MS_PER_HOUR } from '../lib/constants/time'

const STORAGE_KEY = 'kc_dnd'

/** How often to re-check timed DND expiry (ms) */
const CHECK_INTERVAL_MS = 30_000

export type TimedDuration = '1h' | '4h' | 'tomorrow'

/** Stored DND state */
interface DNDState {
  /** Manual toggle — indefinite until turned off */
  manualDND: boolean
  /** Timed DND — epoch timestamp when it expires (0 = not active) */
  timedDNDUntil: number
  /** Quiet hours enabled */
  quietHoursEnabled: boolean
  /** Quiet hours start (24h format, e.g. "22:00") */
  quietHoursStart: string
  /** Quiet hours end (24h format, e.g. "08:00") */
  quietHoursEnd: string
}

const DEFAULT_STATE: DNDState = {
  manualDND: false,
  timedDNDUntil: 0,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
}

function loadState(): DNDState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<DNDState>
      return { ...DEFAULT_STATE, ...parsed }
    }
  } catch {
    // corrupt data
  }
  return { ...DEFAULT_STATE }
}

function saveState(state: DNDState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage unavailable
  }
}

/** Parse "HH:MM" to minutes since midnight */
function parseTime(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Check if the current time falls within the quiet hours window.
 *  Handles overnight windows (e.g. 22:00–08:00) correctly. */
function isInQuietHours(start: string, end: string): boolean {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const startMinutes = parseTime(start)
  const endMinutes = parseTime(end)

  if (startMinutes <= endMinutes) {
    // Same-day window (e.g. 09:00–17:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes
  }
  // Overnight window (e.g. 22:00–08:00)
  return currentMinutes >= startMinutes || currentMinutes < endMinutes
}

/**
 * Module-level check — callable from non-React contexts.
 * Returns true if ANY suppression mode is active.
 */
export function isDNDActive(): boolean {
  const state = loadState()
  if (state.manualDND) return true
  if (state.timedDNDUntil > 0 && Date.now() < state.timedDNDUntil) return true
  if (state.quietHoursEnabled && isInQuietHours(state.quietHoursStart, state.quietHoursEnd)) return true
  return false
}

/** Milliseconds remaining on timed DND (0 if not active) */
export function getDNDRemaining(): number {
  const state = loadState()
  if (state.timedDNDUntil > 0) {
    const remaining = state.timedDNDUntil - Date.now()
    return remaining > 0 ? remaining : 0
  }
  return 0
}

/**
 * React hook for DND state + controls.
 */
export function useDoNotDisturb() {
  const [state, setState] = useState<DNDState>(loadState)
  // Re-render periodically to update timed DND expiry display
  const [, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      const fresh = loadState()
      // Auto-clear expired timed DND
      if (fresh.timedDNDUntil > 0 && Date.now() >= fresh.timedDNDUntil) {
        fresh.timedDNDUntil = 0
        saveState(fresh)
      }
      setState(fresh)
      setTick(t => t + 1)
    }, CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  const setManualDND = useCallback((on: boolean) => {
    setState(prev => {
      const next = { ...prev, manualDND: on, timedDNDUntil: 0 }
      saveState(next)
      return next
    })
  }, [])

  const setTimedDND = useCallback((duration: TimedDuration) => {
    const now = Date.now()
    /** Milliseconds per hour — imported from lib/constants/time */
    let until: number
    switch (duration) {
      case '1h': until = now + MS_PER_HOUR; break
      case '4h': until = now + 4 * MS_PER_HOUR; break
      case 'tomorrow': {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        tomorrow.setHours(8, 0, 0, 0)
        until = tomorrow.getTime()
        break
      }
    }
    setState(prev => {
      const next = { ...prev, manualDND: false, timedDNDUntil: until }
      saveState(next)
      return next
    })
  }, [])

  const clearDND = useCallback(() => {
    setState(prev => {
      const next = { ...prev, manualDND: false, timedDNDUntil: 0 }
      saveState(next)
      return next
    })
  }, [])

  const setQuietHours = useCallback((enabled: boolean, start?: string, end?: string) => {
    setState(prev => {
      const next = {
        ...prev,
        quietHoursEnabled: enabled,
        ...(start !== undefined && { quietHoursStart: start }),
        ...(end !== undefined && { quietHoursEnd: end }),
      }
      saveState(next)
      return next
    })
  }, [])

  const isActive = state.manualDND ||
    (state.timedDNDUntil > 0 && Date.now() < state.timedDNDUntil) ||
    (state.quietHoursEnabled && isInQuietHours(state.quietHoursStart, state.quietHoursEnd))

  const remaining = state.timedDNDUntil > 0
    ? Math.max(0, state.timedDNDUntil - Date.now())
    : 0

  return {
    isActive,
    isManualDND: state.manualDND,
    timedDNDUntil: state.timedDNDUntil,
    remaining,
    quietHoursEnabled: state.quietHoursEnabled,
    quietHoursStart: state.quietHoursStart,
    quietHoursEnd: state.quietHoursEnd,
    setManualDND,
    setTimedDND,
    clearDND,
    setQuietHours,
  }
}
