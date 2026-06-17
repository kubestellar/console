import { getDefaultCardsForDashboard } from '../../config/dashboards'
import { STORAGE_KEY_MAIN_DASHBOARD_CARDS } from '../../lib/constants/storage'
import { isClusterHealthy } from '../clusters/utils'
import type { DashboardTemplate } from './templates'
import type {
  DashboardCardSuggestion,
  DashboardClusterStats,
  PendingRestoreCardLike,
} from './DashboardTypes'
import type { Card } from './dashboardUtils'
import { getDefaultCardSize, mapVisualizationToCardType } from './dashboardUtils'

export const AUTO_REFRESH_INTERVAL_MS = 30_000
export const DASHBOARD_STORAGE_KEY = STORAGE_KEY_MAIN_DASHBOARD_CARDS
export const DEFAULT_DASHBOARD_CARDS: Card[] = getDefaultCardsForDashboard('main')

export function calculateClusterStats(clusters: Array<{
  name: string
  nodeCount?: number
  podCount?: number
  namespaces?: string[]
}>): DashboardClusterStats {
  return clusters.reduce<DashboardClusterStats>((stats, cluster) => {
    stats.clusterCount += 1
    if (isClusterHealthy(cluster)) {
      stats.healthyClusters += 1
      stats.healthyNodes += cluster.nodeCount || 0
    } else {
      stats.unhealthyClusters += 1
    }
    stats.totalPods += cluster.podCount || 0
    stats.totalNamespaces += cluster.namespaces?.length || 0
    stats.totalNodes += cluster.nodeCount || 0
    return stats
  }, {
    clusterCount: 0,
    healthyClusters: 0,
    unhealthyClusters: 0,
    healthyNodes: 0,
    totalPods: 0,
    totalNamespaces: 0,
    totalNodes: 0,
  })
}

export function isExpectedDashboardLoadFailure(error: unknown): boolean {
  return error instanceof Error && (
    error.message.includes('Request timeout') ||
    error.message.includes('Failed to fetch') ||
    error.message.includes('NetworkError') ||
    error.message.includes('Load failed') ||
    error.message.includes('HTTP request to an HTTPS server') ||
    error.message.includes('API error:') ||
    error.message.includes('Invalid JSON')
  )
}

export function createRestoredCard(pendingRestoreCard: PendingRestoreCardLike): Card {
  const size = getDefaultCardSize(pendingRestoreCard.cardType)
  return {
    id: `restored-${Date.now()}`,
    card_type: pendingRestoreCard.cardType,
    config: pendingRestoreCard.config || {},
    position: { x: 0, y: 0, ...size },
    title: pendingRestoreCard.cardTitle,
  }
}

export function createCardsFromSuggestions(suggestions: DashboardCardSuggestion[]): Card[] {
  const timestamp = Date.now()
  return suggestions.map((suggestion, index) => {
    const cardType = mapVisualizationToCardType(suggestion.visualization, suggestion.type)
    const size = getDefaultCardSize(cardType)
    return {
      id: `new-${timestamp}-${index}`,
      card_type: cardType,
      config: suggestion.config,
      position: { x: 0, y: 0, ...size },
      title: suggestion.title,
    }
  })
}

export function createDashboardCard(cardType: string, config: Record<string, unknown> = {}, title?: string, idPrefix: string = 'rec'): Card {
  const size = getDefaultCardSize(cardType)
  return {
    id: `${idPrefix}-${Date.now()}`,
    card_type: cardType,
    config,
    position: { x: 0, y: 0, ...size },
    title,
  }
}

export function createTemplateCards(template: DashboardTemplate): Card[] {
  const timestamp = Date.now()
  return template.cards.map((templateCard, index) => ({
    id: `template-${timestamp}-${index}`,
    card_type: templateCard.card_type,
    config: templateCard.config || {},
    position: { x: 0, y: 0, w: templateCard.position?.w || 4, h: templateCard.position?.h || 2 },
    title: templateCard.title,
  }))
}

export function buildDashboardExportFilename(name?: string): string {
  return `${(name || 'dashboard').replace(/\s+/g, '-').toLowerCase()}.json`
}
