import { useState, useEffect } from 'react'
import { CardRecommendation } from './useCardRecommendations'
import { POLL_INTERVAL_SLOW_MS } from '../lib/constants/network'
import { STORAGE_KEY_SNOOZED_RECOMMENDATIONS } from '../lib/constants/storage'
import { SECONDS_PER_MINUTE, MINUTES_PER_HOUR, HOURS_PER_DAY } from '../lib/constants/time'
import { emitSnoozed, emitUnsnoozed } from '../lib/analytics'

/** Default snooze duration for recommendations: 24 hours */
const DEFAULT_REC_SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000

export interface SnoozedRecommendation {
  id: string
  recommendation: CardRecommendation
  snoozedAt: number // timestamp (ms)
  expiresAt: number // timestamp (ms)
}

interface StoredState {
  recs: SnoozedRecommendation[]
  dismissed: string[] // recommendation IDs that are permanently dismissed
}

// Module-level state for cross-component sharing
let state: StoredState = { recs: [], dismissed: [] }
const listeners: Set<() => void> = new Set()

function notifyListeners() {
  listeners.forEach((listener) => listener())
}

function loadState(): StoredState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SNOOZED_RECOMMENDATIONS)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Clean up expired snoozes on load
      const now = Date.now()
      parsed.recs = (parsed.recs || []).filter(
        (r: SnoozedRecommendation) => r.expiresAt > now
      )
      parsed.dismissed = parsed.dismissed || []
      return parsed
    }
  } catch {
    // Ignore parse errors
  }
  return { recs: [], dismissed: [] }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY_SNOOZED_RECOMMENDATIONS, JSON.stringify(state))
  } catch {
    // Ignore write errors (e.g. private browsing, quota exceeded)
  }
}

// Initialize on module load
state = loadState()

export function useSnoozedRecommendations() {
  const [localState, setLocalState] = useState<StoredState>(state)

  useEffect(() => {
    const listener = () => setLocalState({ ...state })
    listeners.add(listener)

    // Periodically clean up expired snoozes
    const checkExpired = () => {
      const now = Date.now()
      const hadExpired = state.recs.some(r => r.expiresAt <= now)
      if (hadExpired) {
        state.recs = state.recs.filter(r => r.expiresAt > now)
        saveState()
        notifyListeners()
      }
    }

    const intervalId = setInterval(checkExpired, POLL_INTERVAL_SLOW_MS)

    return () => {
      listeners.delete(listener)
      clearInterval(intervalId)
    }
  }, [])

  const snoozeRecommendation = (recommendation: CardRecommendation, durationMs = DEFAULT_REC_SNOOZE_DURATION_MS) => {
    // Check if already snoozed
    if (state.recs.some(r => r.recommendation.id === recommendation.id)) {
      return null
    }

    const now = Date.now()
    const newSnoozed: SnoozedRecommendation = {
      id: `snoozed-rec-${now}-${Math.random().toString(36).slice(2)}`,
      recommendation,
      snoozedAt: now,
      expiresAt: now + durationMs,
    }
    state.recs = [...state.recs, newSnoozed]
    saveState()
    notifyListeners()
    emitSnoozed('recommendation')
    return newSnoozed
  }

  const unsnooozeRecommendation = (id: string) => {
    const rec = state.recs.find((r) => r.id === id)
    state.recs = state.recs.filter((r) => r.id !== id)
    saveState()
    notifyListeners()
    emitUnsnoozed('recommendation')
    return rec
  }

  const dismissSnoozedRecommendation = (id: string) => {
    state.recs = state.recs.filter((r) => r.id !== id)
    saveState()
    notifyListeners()
  }

  const isSnoozed = (recId: string) => {
    const now = Date.now()
    return state.recs.some(r => r.recommendation.id === recId && r.expiresAt > now)
  }

  const dismissRecommendation = (recId: string) => {
    if (!state.dismissed.includes(recId)) {
      state.dismissed = [...state.dismissed, recId]
      saveState()
      notifyListeners()
    }
  }

  const isDismissed = (recId: string) => {
    return state.dismissed.includes(recId)
  }

  return {
    snoozedRecommendations: localState.recs,
    snoozeRecommendation,
    unsnooozeRecommendation,
    dismissSnoozedRecommendation,
    dismissRecommendation,
    isSnoozed,
    isDismissed,
  }
}

// Time boundary constants for elapsed time formatting

// Helper to format elapsed time since snooze
export function formatElapsedTime(since: Date | number): string {
  const sinceMs = typeof since === 'number' ? since : since.getTime()
  const now = Date.now()
  const diff = now - sinceMs

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE)
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  const days = Math.floor(hours / HOURS_PER_DAY)

  if (seconds < SECONDS_PER_MINUTE) return 'now'
  if (minutes < MINUTES_PER_HOUR) return `${minutes}m`
  if (hours < HOURS_PER_DAY) return `${hours}h`
  if (days === 1) return '1 day'
  return `${days} days`
}
