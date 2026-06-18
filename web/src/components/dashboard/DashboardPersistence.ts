import { useEffect, useRef, useState } from 'react'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'
import { STORAGE_KEY_DASHBOARD_AUTO_REFRESH } from '../../lib/constants'
import { loadDashboardCardsFromStorage, saveDashboardCardsToStorage } from '../../lib/dashboards/dashboardCardStorage'
import { setAutoRefreshPaused } from '../../lib/cache'
import type { Card, DashboardData } from './dashboardUtils'

const AUTO_REFRESH_INTERVAL_MS = 30_000

export interface CachedDashboard {
  dashboard: DashboardData | null
  cards: Card[]
  timestamp: number
}

let dashboardCache: CachedDashboard | null = null

export function getDashboardCache(): CachedDashboard | null {
  return dashboardCache
}

export function setDashboardCache(value: CachedDashboard | null): void {
  dashboardCache = value
}

export function initializeDashboardCards(storageKey: string, defaultCards: Card[]): Card[] {
  const restoredCards = loadDashboardCardsFromStorage<Card>(
    storageKey,
    defaultCards,
    { requirePosition: true, requireGridCoordinates: true },
  )

  if (restoredCards.length > 0) {
    return restoredCards
  }

  return defaultCards
}

export function updateCachedDashboardCards(cards: Card[]): void {
  if (dashboardCache) {
    dashboardCache = { ...dashboardCache, cards, timestamp: Date.now() }
  }
}

export function persistDashboardCards(storageKey: string, cards: Card[]): void {
  if (cards.length > 0) {
    updateCachedDashboardCards(cards)
    saveDashboardCardsToStorage(storageKey, cards)
  }
}

export function useDashboardPersistence(refetch: () => void, isLoading: boolean) {
  const [autoRefresh, setAutoRefresh] = useState(() => {
    const stored = safeGetItem(STORAGE_KEY_DASHBOARD_AUTO_REFRESH)
    return stored !== null ? stored === 'true' : true
  })
  const autoRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isLoadingRef = useRef(isLoading)
  isLoadingRef.current = isLoading

  useEffect(() => {
    safeSetItem(STORAGE_KEY_DASHBOARD_AUTO_REFRESH, String(autoRefresh))
    setAutoRefreshPaused(!autoRefresh)
    return () => {
      setAutoRefreshPaused(false)
    }
  }, [autoRefresh])

  useEffect(() => {
    if (!autoRefresh) return
    autoRefreshIntervalRef.current = setInterval(() => {
      if (!isLoadingRef.current) {
        refetch()
      }
    }, AUTO_REFRESH_INTERVAL_MS)
    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current)
        autoRefreshIntervalRef.current = null
      }
    }
  }, [autoRefresh, refetch])

  return {
    autoRefresh,
    setAutoRefresh,
  }
}
