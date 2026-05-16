import { useCallback } from 'react'
import { useLocalStorage } from './useLocalStorage'

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
const DEFAULT_HISTORY: CardHistoryEntry[] = []

function safeJsonParse<T>(raw: string, fallback: T, context: string): T {
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    console.warn(`[useCardHistory] Failed to parse ${context}, using default`, err)
    return fallback
  }
}

function deserializeHistory(raw: string): CardHistoryEntry[] {
  const parsed = safeJsonParse<unknown>(raw, [], 'card history')
  return Array.isArray(parsed) ? (parsed as CardHistoryEntry[]) : []
}

export function useCardHistory() {
  const [history, setHistory] = useLocalStorage<CardHistoryEntry[]>(STORAGE_KEY, DEFAULT_HISTORY, {
    deserialize: deserializeHistory,
  })

  const addEntry = (entry: Omit<CardHistoryEntry, 'id' | 'timestamp'>) => {
    setHistory((prev) => {
      const newEntry: CardHistoryEntry = {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: Date.now() }
      return [newEntry, ...prev].slice(0, MAX_HISTORY)
    })
  }

  const recordCardRemoved = (
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
      dashboardName })
  }

  const recordCardAdded = (
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
      dashboardName })
  }

  const recordCardReplaced = (
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
      previousCardType })
  }

  const recordCardConfigured = (
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
      dashboardName })
  }

  const getRemovedCards = useCallback(() => {
    return history.filter((entry) => entry.action === 'removed')
  }, [history])

  const clearHistory = () => {
    setHistory([])
  }

  const removeEntry = (entryId: string) => {
    setHistory((prev) => prev.filter((entry) => entry.id !== entryId))
  }

  return {
    history,
    addEntry,
    recordCardRemoved,
    recordCardAdded,
    recordCardReplaced,
    recordCardConfigured,
    getRemovedCards,
    clearHistory,
    removeEntry }
}
