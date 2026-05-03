import { useState, useEffect } from 'react'
import { POLL_INTERVAL_SLOW_MS } from '../lib/constants/network'
import { STORAGE_KEY_SNOOZED_CARDS } from '../lib/constants/storage'
import { MS_PER_HOUR, MS_PER_MINUTE, MINUTES_PER_HOUR, HOURS_PER_DAY } from '../lib/constants/time'
import { emitSnoozed, emitUnsnoozed } from '../lib/analytics'

/** Default snooze duration: 1 hour */
const DEFAULT_SNOOZE_DURATION_MS = MS_PER_HOUR

export interface SnoozedSwap {
  id: string
  originalCardId: string
  originalCardType: string
  originalCardTitle: string
  newCardType: string
  newCardTitle: string
  reason: string
  snoozedAt: number // timestamp (ms)
  snoozedUntil: number // timestamp (ms)
}

interface StoredState {
  swaps: SnoozedSwap[]
}

// Module-level state for cross-component sharing
let state: StoredState = { swaps: [] }
const listeners: Set<() => void> = new Set()

function notifyListeners() {
  listeners.forEach((listener) => listener())
}

function loadState(): StoredState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SNOOZED_CARDS)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Clean up expired snoozes on load
      const now = Date.now()
      parsed.swaps = (parsed.swaps || []).filter(
        (s: SnoozedSwap) => s.snoozedUntil > now
      )
      return parsed
    }
  } catch {
    // Ignore parse errors
  }
  return { swaps: [] }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY_SNOOZED_CARDS, JSON.stringify(state))
  } catch {
    // Ignore write errors (e.g. private browsing, quota exceeded)
  }
}

// Initialize on module load
state = loadState()

export function useSnoozedCards() {
  const [localState, setLocalState] = useState<StoredState>(state)

  useEffect(() => {
    const listener = () => setLocalState({ ...state })
    listeners.add(listener)

    // Periodically clean up expired snoozes
    const checkExpired = () => {
      const now = Date.now()
      const hadExpired = state.swaps.some(s => s.snoozedUntil <= now)
      if (hadExpired) {
        state.swaps = state.swaps.filter(s => s.snoozedUntil > now)
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

  const snoozeSwap = (swap: Omit<SnoozedSwap, 'id' | 'snoozedAt' | 'snoozedUntil'>, durationMs: number = DEFAULT_SNOOZE_DURATION_MS) => {
    const now = Date.now()
    const newSwap: SnoozedSwap = {
      ...swap,
      id: `snooze-${now}-${Math.random().toString(36).slice(2)}`,
      snoozedAt: now,
      snoozedUntil: now + durationMs,
    }
    state.swaps = [...state.swaps, newSwap]
    saveState()
    notifyListeners()
    emitSnoozed('card')
    return newSwap
  }

  const unsnoozeSwap = (id: string) => {
    const swap = state.swaps.find((s) => s.id === id)
    state.swaps = state.swaps.filter((s) => s.id !== id)
    saveState()
    notifyListeners()
    emitUnsnoozed('card')
    return swap
  }

  const dismissSwap = (id: string) => {
    state.swaps = state.swaps.filter((s) => s.id !== id)
    saveState()
    notifyListeners()
  }

  const getExpiredSwaps = () => {
    const now = Date.now()
    return state.swaps.filter((s) => s.snoozedUntil <= now)
  }

  const getActiveSwaps = () => {
    const now = Date.now()
    return state.swaps.filter((s) => s.snoozedUntil > now)
  }

  const isCardSnoozed = (cardId: string): boolean => {
    const now = Date.now()
    return state.swaps.some(s => s.originalCardId === cardId && s.snoozedUntil > now)
  }

  return {
    snoozedSwaps: localState.swaps,
    snoozeSwap,
    unsnoozeSwap,
    dismissSwap,
    getExpiredSwaps,
    getActiveSwaps,
    isCardSnoozed,
  }
}

// Helper to format time remaining
export function formatTimeRemaining(until: Date | number): string {
  const untilMs = typeof until === 'number' ? until : until.getTime()
  const now = Date.now()
  const diff = untilMs - now

  if (diff <= 0) return 'Expired'

  const minutes = Math.floor(diff / MS_PER_MINUTE)
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  const days = Math.floor(hours / HOURS_PER_DAY)

  if (days > 0) return `${days}d ${hours % HOURS_PER_DAY}h`
  if (hours > 0) return `${hours}h ${minutes % MINUTES_PER_HOUR}m`
  return `${minutes}m`
}
