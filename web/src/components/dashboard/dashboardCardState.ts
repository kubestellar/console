import { getDefaultCardsForDashboard } from '../../config/dashboards'
import { loadDashboardCardsFromStorage } from '../../lib/dashboards/dashboardCardStorage'
import { STORAGE_KEY_MAIN_DASHBOARD_CARDS } from '../../lib/constants/storage'
import type { Card, DashboardData } from './dashboardUtils'

export interface CachedDashboard {
  dashboard: DashboardData | null
  cards: Card[]
  timestamp: number
}

export interface PendingDeploy {
  workloadName: string
  namespace: string
  sourceCluster: string
  targetClusters: string[]
  groupName: string
}

const DASHBOARD_STORAGE_KEY = STORAGE_KEY_MAIN_DASHBOARD_CARDS
const DEFAULT_DASHBOARD_CARDS: Card[] = getDefaultCardsForDashboard('main')

let dashboardCache: CachedDashboard | null = null

export function getDashboardStorageKey() {
  return DASHBOARD_STORAGE_KEY
}

export function getDefaultDashboardCards() {
  return DEFAULT_DASHBOARD_CARDS
}

export function getDashboardCache() {
  return dashboardCache
}

export function setDashboardCache(cache: CachedDashboard | null) {
  dashboardCache = cache
}

export function getInitialDashboardCards() {
  if (dashboardCache?.cards?.length) return dashboardCache.cards

  const restoredCards = loadDashboardCardsFromStorage<Card>(
    DASHBOARD_STORAGE_KEY,
    DEFAULT_DASHBOARD_CARDS,
    { requirePosition: true, requireGridCoordinates: true },
  )

  if (restoredCards.length > 0) {
    return restoredCards
  }

  return DEFAULT_DASHBOARD_CARDS
}
