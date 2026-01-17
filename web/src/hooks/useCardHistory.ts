import { useState, useEffect, useCallback } from 'react'

export interface CardHistoryEntry {
  id: string
  cardId: string
  cardType: string
  cardTitle?: string
  config: Record<string, unknown>
  action: 'added' | 'removed' | 'replaced' | 'configured'
  timestamp: number
  dashboardId?: string
  dashboardName?: string
  previousCardType?: string // For replacements
}

const STORAGE_KEY = 'kubestellar-card-history'
const MAX_HISTORY = 100

export function useCardHistory() {
  const [history, setHistory] = useState<CardHistoryEntry[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  }, [history])

  const addEntry = useCallback((entry: Omit<CardHistoryEntry, 'id' | 'timestamp'>) => {
    setHistory((prev) => {
      const newEntry: CardHistoryEntry = {
        ...entry,
        id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
      }
      return [newEntry, ...prev].slice(0, MAX_HISTORY)
    })
  }, [])

  const recordCardRemoved = useCallback((
    cardId: string,
    cardType: string,
    cardTitle?: string,
    config?: Record<string, unknown>,
    dashboardId?: string,
    dashboardName?: string
  ) => {
    addEntry({
      cardId,
      cardType,
      cardTitle,
      config: config || {},
      action: 'removed',
      dashboardId,
      dashboardName,
    })
  }, [addEntry])

  const recordCardAdded = useCallback((
    cardId: string,
    cardType: string,
    cardTitle?: string,
    config?: Record<string, unknown>,
    dashboardId?: string,
    dashboardName?: string
  ) => {
    addEntry({
      cardId,
      cardType,
      cardTitle,
      config: config || {},
      action: 'added',
      dashboardId,
      dashboardName,
    })
  }, [addEntry])

  const recordCardReplaced = useCallback((
    cardId: string,
    newCardType: string,
    previousCardType: string,
    cardTitle?: string,
    config?: Record<string, unknown>,
    dashboardId?: string,
    dashboardName?: string
  ) => {
    addEntry({
      cardId,
      cardType: newCardType,
      cardTitle,
      config: config || {},
      action: 'replaced',
      dashboardId,
      dashboardName,
      previousCardType,
    })
  }, [addEntry])

  const recordCardConfigured = useCallback((
    cardId: string,
    cardType: string,
    cardTitle?: string,
    config?: Record<string, unknown>,
    dashboardId?: string,
    dashboardName?: string
  ) => {
    addEntry({
      cardId,
      cardType,
      cardTitle,
      config: config || {},
      action: 'configured',
      dashboardId,
      dashboardName,
    })
  }, [addEntry])

  const getRemovedCards = useCallback(() => {
    return history.filter((entry) => entry.action === 'removed')
  }, [history])

  const clearHistory = useCallback(() => {
    setHistory([])
  }, [])

  const removeEntry = useCallback((entryId: string) => {
    setHistory((prev) => prev.filter((entry) => entry.id !== entryId))
  }, [])

  return {
    history,
    addEntry,
    recordCardRemoved,
    recordCardAdded,
    recordCardReplaced,
    recordCardConfigured,
    getRemovedCards,
    clearHistory,
    removeEntry,
  }
}
