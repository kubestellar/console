import { useState, useEffect, useCallback } from 'react'
import { MissionSuggestion } from './useMissionSuggestions'

const STORAGE_KEY = 'kubestellar-snoozed-missions'
const SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000 // 24 hours

export interface SnoozedMission {
  id: string
  suggestion: MissionSuggestion
  snoozedAt: number // timestamp
  expiresAt: number // timestamp
}

export interface DismissedMission {
  id: string
  dismissedAt: number
}

interface StoredState {
  snoozed: SnoozedMission[]
  dismissed: string[] // just IDs for dismissed
}

// Module-level state for cross-component sharing
let state: StoredState = { snoozed: [], dismissed: [] }
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
        (s: SnoozedMission) => s.expiresAt > now
      )
      return parsed
    }
  } catch {
    // Ignore parse errors
  }
  return { snoozed: [], dismissed: [] }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

// Initialize on module load
state = loadState()

export function useSnoozedMissions() {
  const [localState, setLocalState] = useState<StoredState>(state)

  useEffect(() => {
    const listener = () => setLocalState({ ...state })
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const snoozeMission = useCallback((suggestion: MissionSuggestion, durationMs = SNOOZE_DURATION_MS) => {
    // Check if already snoozed
    if (state.snoozed.some(s => s.suggestion.id === suggestion.id)) {
      return null
    }

    const now = Date.now()
    const newSnoozed: SnoozedMission = {
      id: `snoozed-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      suggestion,
      snoozedAt: now,
      expiresAt: now + durationMs,
    }
    state.snoozed = [...state.snoozed, newSnoozed]
    saveState()
    notifyListeners()
    return newSnoozed
  }, [])

  const unsnoozeMission = useCallback((id: string) => {
    const mission = state.snoozed.find((s) => s.id === id)
    state.snoozed = state.snoozed.filter((s) => s.id !== id)
    saveState()
    notifyListeners()
    return mission
  }, [])

  const dismissMission = useCallback((suggestionId: string) => {
    if (!state.dismissed.includes(suggestionId)) {
      state.dismissed = [...state.dismissed, suggestionId]
      saveState()
      notifyListeners()
    }
  }, [])

  const undismissMission = useCallback((suggestionId: string) => {
    state.dismissed = state.dismissed.filter((id) => id !== suggestionId)
    saveState()
    notifyListeners()
  }, [])

  const isSnoozed = useCallback((suggestionId: string) => {
    const now = Date.now()
    return state.snoozed.some(s => s.suggestion.id === suggestionId && s.expiresAt > now)
  }, [])

  const isDismissed = useCallback((suggestionId: string) => {
    return state.dismissed.includes(suggestionId)
  }, [])

  const clearAllSnoozed = useCallback(() => {
    state.snoozed = []
    saveState()
    notifyListeners()
  }, [])

  const clearAllDismissed = useCallback(() => {
    state.dismissed = []
    saveState()
    notifyListeners()
  }, [])

  // Get time remaining on snooze
  const getSnoozeRemaining = useCallback((suggestionId: string): number | null => {
    const snoozed = state.snoozed.find(s => s.suggestion.id === suggestionId)
    if (!snoozed) return null
    return Math.max(0, snoozed.expiresAt - Date.now())
  }, [])

  return {
    snoozedMissions: localState.snoozed,
    dismissedMissions: localState.dismissed,
    snoozeMission,
    unsnoozeMission,
    dismissMission,
    undismissMission,
    isSnoozed,
    isDismissed,
    clearAllSnoozed,
    clearAllDismissed,
    getSnoozeRemaining,
  }
}

// Helper to format time remaining
export function formatTimeRemaining(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000))
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}
