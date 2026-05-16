import { useState, useEffect, useCallback } from 'react'
import { POLL_INTERVAL_SLOW_MS } from '../lib/constants/network'
import { STORAGE_KEY_SNOOZED_CARDS } from '../lib/constants/storage'
import { MS_PER_HOUR, MS_PER_MINUTE, MINUTES_PER_HOUR, HOURS_PER_DAY } from '../lib/constants/time'
import { emitSnoozed, emitUnsnoozed } from '../lib/analytics'
import { useLocalStorage } from './useLocalStorage'

/** Default snooze duration: 1 hour */
const DEFAULT_SNOOZE_DURATION_MS = MS_PER_HOUR

function safeJsonParse<T>(raw: string, fallback: T, context: string): T {
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    console.warn(`[useSnoozedCards] Failed to parse ${context}, using default`, err)
    return fallback
  }
}

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

const DEFAULT_STATE: StoredState = { swaps: [] }

function deserializeStoredState(raw: string): StoredState {
  const parsed = safeJsonParse<StoredState>(raw, DEFAULT_STATE, 'snoozed cards')
  const now = Date.now()

  return {
    swaps: (parsed.swaps || []).filter((swap: SnoozedSwap) => swap.snoozedUntil > now),
  }
}

function cloneState(): StoredState {
  return {
    swaps: [...state.swaps],
  }
}

// Module-level state for cross-component sharing
let state: StoredState = DEFAULT_STATE
const listeners: Set<() => void> = new Set()

function notifyListeners() {
  listeners.forEach((listener) => listener())
}

export function useSnoozedCards() {
  const [storedState, setStoredState] = useLocalStorage<StoredState>(STORAGE_KEY_SNOOZED_CARDS, DEFAULT_STATE, {
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

    // Periodically clean up expired snoozes
    const checkExpired = () => {
      const now = Date.now()
      const activeSwaps = state.swaps.filter((swap) => swap.snoozedUntil > now)

      if (activeSwaps.length !== state.swaps.length) {
        persistState({ swaps: activeSwaps })
      }
    }

    const intervalId = setInterval(checkExpired, POLL_INTERVAL_SLOW_MS)

    return () => {
      listeners.delete(listener)
      clearInterval(intervalId)
    }
  }, [persistState])

  const snoozeSwap = (swap: Omit<SnoozedSwap, 'id' | 'snoozedAt' | 'snoozedUntil'>, durationMs: number = DEFAULT_SNOOZE_DURATION_MS) => {
    const now = Date.now()
    const newSwap: SnoozedSwap = {
      ...swap,
      id: `snooze-${now}-${Math.random().toString(36).slice(2)}`,
      snoozedAt: now,
      snoozedUntil: now + durationMs,
    }

    persistState({ swaps: [...state.swaps, newSwap] })
    emitSnoozed('card')
    return newSwap
  }

  const unsnoozeSwap = (id: string) => {
    const swap = state.swaps.find((entry) => entry.id === id)
    persistState({
      swaps: state.swaps.filter((entry) => entry.id !== id),
    })
    emitUnsnoozed('card')
    return swap
  }

  const dismissSwap = (id: string) => {
    persistState({
      swaps: state.swaps.filter((entry) => entry.id !== id),
    })
  }

  const getExpiredSwaps = () => {
    const now = Date.now()
    return state.swaps.filter((swap) => swap.snoozedUntil <= now)
  }

  const getActiveSwaps = () => {
    const now = Date.now()
    return state.swaps.filter((swap) => swap.snoozedUntil > now)
  }

  const isCardSnoozed = (cardId: string): boolean => {
    const now = Date.now()
    return state.swaps.some((swap) => swap.originalCardId === cardId && swap.snoozedUntil > now)
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
