import { useState, useEffect, useCallback } from 'react'

export interface SnoozedSwap {
  id: string
  originalCardId: string
  originalCardType: string
  originalCardTitle: string
  newCardType: string
  newCardTitle: string
  reason: string
  snoozedAt: Date
  snoozedUntil: Date
}

// Simple in-memory store - in production this would sync with backend
let snoozedSwaps: SnoozedSwap[] = []
const listeners: Set<() => void> = new Set()

function notifyListeners() {
  listeners.forEach((listener) => listener())
}

export function useSnoozedCards() {
  const [swaps, setSwaps] = useState<SnoozedSwap[]>(snoozedSwaps)

  useEffect(() => {
    const listener = () => setSwaps([...snoozedSwaps])
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const snoozeSwap = useCallback((swap: Omit<SnoozedSwap, 'id' | 'snoozedAt' | 'snoozedUntil'>, durationMs: number = 3600000) => {
    const newSwap: SnoozedSwap = {
      ...swap,
      id: `snooze-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      snoozedAt: new Date(),
      snoozedUntil: new Date(Date.now() + durationMs),
    }
    snoozedSwaps = [...snoozedSwaps, newSwap]
    notifyListeners()
    return newSwap
  }, [])

  const unsnoozeSwap = useCallback((id: string) => {
    const swap = snoozedSwaps.find((s) => s.id === id)
    snoozedSwaps = snoozedSwaps.filter((s) => s.id !== id)
    notifyListeners()
    return swap
  }, [])

  const dismissSwap = useCallback((id: string) => {
    snoozedSwaps = snoozedSwaps.filter((s) => s.id !== id)
    notifyListeners()
  }, [])

  const getExpiredSwaps = useCallback(() => {
    const now = new Date()
    return snoozedSwaps.filter((s) => s.snoozedUntil <= now)
  }, [])

  const getActiveSwaps = useCallback(() => {
    const now = new Date()
    return snoozedSwaps.filter((s) => s.snoozedUntil > now)
  }, [])

  return {
    snoozedSwaps: swaps,
    snoozeSwap,
    unsnoozeSwap,
    dismissSwap,
    getExpiredSwaps,
    getActiveSwaps,
  }
}

// Helper to format time remaining
export function formatTimeRemaining(until: Date): string {
  const now = new Date()
  const diff = until.getTime() - now.getTime()

  if (diff <= 0) return 'Expired'

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}
