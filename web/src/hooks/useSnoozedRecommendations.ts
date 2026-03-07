import { useState, useEffect, useCallback } from 'react'
import { CardRecommendation } from './useCardRecommendations'

export interface SnoozedRecommendation {
  id: string
  recommendation: CardRecommendation
  snoozedAt: Date
}

// Simple in-memory store - in production this would sync with backend
let snoozedRecs: SnoozedRecommendation[] = []
const dismissedRecIds: Set<string> = new Set()
const listeners: Set<() => void> = new Set()

function notifyListeners() {
  listeners.forEach((listener) => listener())
}

export function useSnoozedRecommendations() {
  const [recs, setRecs] = useState<SnoozedRecommendation[]>(snoozedRecs)

  useEffect(() => {
    const listener = () => setRecs([...snoozedRecs])
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const snoozeRecommendation = useCallback((recommendation: CardRecommendation) => {
    // Check if already snoozed
    if (snoozedRecs.some(r => r.recommendation.id === recommendation.id)) {
      return null
    }

    const newSnoozed: SnoozedRecommendation = {
      id: `snoozed-rec-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      recommendation,
      snoozedAt: new Date(),
    }
    snoozedRecs = [...snoozedRecs, newSnoozed]
    notifyListeners()
    return newSnoozed
  }, [])

  const unsnooozeRecommendation = useCallback((id: string) => {
    const rec = snoozedRecs.find((r) => r.id === id)
    snoozedRecs = snoozedRecs.filter((r) => r.id !== id)
    notifyListeners()
    return rec
  }, [])

  const dismissSnoozedRecommendation = useCallback((id: string) => {
    snoozedRecs = snoozedRecs.filter((r) => r.id !== id)
    notifyListeners()
  }, [])

  const isSnoozed = useCallback((recId: string) => {
    return snoozedRecs.some(r => r.recommendation.id === recId)
  }, [])

  const dismissRecommendation = useCallback((recId: string) => {
    dismissedRecIds.add(recId)
    notifyListeners()
  }, [])

  const isDismissed = useCallback((recId: string) => {
    return dismissedRecIds.has(recId)
  }, [])

  return {
    snoozedRecommendations: recs,
    snoozeRecommendation,
    unsnooozeRecommendation,
    dismissSnoozedRecommendation,
    dismissRecommendation,
    isSnoozed,
    isDismissed,
  }
}

// Time boundary constants for elapsed time formatting
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24

// Helper to format elapsed time since snooze
export function formatElapsedTime(since: Date): string {
  const now = new Date()
  const diff = now.getTime() - since.getTime()

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
