import { useCallback, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, BackendUnavailableError, UnauthenticatedError } from '../../../lib/api'
import { saveDashboardCardsToStorage } from '../../../lib/dashboards/dashboardCardStorage'
import { getDefaultCardSize, getDemoCards, isLocalOnlyCard, type Card, type DashboardData } from '../dashboardUtils'
import type { CachedDashboard } from './types'

interface PendingRestoreCard {
  cardType: string
  cardTitle?: string
  config?: Record<string, unknown>
}

interface UseDashboardLoadingProps {
  localCards: Card[]
  setLocalCards: React.Dispatch<React.SetStateAction<Card[]>>
  setDashboard: (dashboard: DashboardData | null) => void
  setIsLoading: (loading: boolean) => void
  isLoading: boolean
  dashboardCache: CachedDashboard | null
  setDashboardCache: (cache: CachedDashboard | null) => void
  storageKey: string
  showToast: (message: string, type: 'success' | 'error' | 'info') => void
  dashboard: DashboardData | null
  snapshot: (cards: Card[]) => void
  recordCardAdded: (
    id: string,
    cardType: string,
    title: string | undefined,
    config: Record<string, unknown>,
    dashboardId?: string,
    dashboardName?: string,
  ) => void
  pendingRestoreCard?: PendingRestoreCard | null
  clearPendingRestoreCard?: () => void
}

export function useDashboardLoading({
  localCards,
  setLocalCards,
  setDashboard,
  setIsLoading,
  isLoading,
  dashboardCache,
  setDashboardCache,
  storageKey,
  showToast,
  dashboard,
  snapshot,
  recordCardAdded,
  pendingRestoreCard,
  clearPendingRestoreCard,
}: UseDashboardLoadingProps) {
  const { t } = useTranslation()
  const location = useLocation()

  const loadDashboard = useCallback(async (isBackground = false) => {
    if (!isBackground) {
      setIsLoading(true)
    }

    try {
      const { data: dashboardsData } = await api.get<DashboardData[]>('/api/dashboards')
      if (dashboardsData && dashboardsData.length > 0) {
        const defaultDashboard = dashboardsData.find(item => item.is_default) || dashboardsData[0]
        const { data } = await api.get<DashboardData>(`/api/dashboards/${defaultDashboard.id}`)
        const apiCards = data.cards && data.cards.length > 0 ? data.cards : getDemoCards()
        setDashboard(data)

        setLocalCards(previousCards => {
          const apiCardIds = new Set(apiCards.map(card => card.id))
          const localOnlyCards = previousCards.filter(card => isLocalOnlyCard(card.id) && !apiCardIds.has(card.id))
          return localOnlyCards.length > 0 ? [...localOnlyCards, ...apiCards] : apiCards
        })
        setDashboardCache({ dashboard: data, cards: apiCards, timestamp: Date.now() })
      } else if (!isBackground) {
        const cards = getDemoCards()
        setLocalCards(cards)
        setDashboardCache({ dashboard: null, cards, timestamp: Date.now() })
      }
    } catch (error: unknown) {
      const isExpectedFailure = error instanceof BackendUnavailableError
        || error instanceof UnauthenticatedError
        || (error instanceof Error && (
          error.message.includes('Request timeout')
          || error.message.includes('Failed to fetch')
          || error.message.includes('NetworkError')
          || error.message.includes('Load failed')
          || error.message.includes('HTTP request to an HTTPS server')
          || error.message.includes('API error:')
          || error.message.includes('Invalid JSON')
        ))

      if (!isExpectedFailure) {
        console.error('Failed to load dashboard:', error)
        if (!isBackground) {
          showToast(t('dashboard.toast.loadFailed', 'Failed to load dashboard'), 'error')
        }
      }

      if (!isBackground) {
        setLocalCards(previousCards => {
          if (previousCards.length > 0) {
            return previousCards
          }
          const cards = getDemoCards()
          setDashboardCache({ dashboard: null, cards, timestamp: Date.now() })
          return cards
        })
      }
    } finally {
      setIsLoading(false)
    }
  }, [setDashboard, setDashboardCache, setIsLoading, setLocalCards, showToast, t])

  useEffect(() => {
    const isHomeDashboard = location.pathname === '/' || location.pathname === ''
    if (!isHomeDashboard) return

    const hasCachedOrLocalCards = ((dashboardCache?.cards?.length ?? 0) > 0) || localCards.length > 0
    loadDashboard(hasCachedOrLocalCards)
  }, [dashboardCache?.cards?.length, loadDashboard, localCards.length, location.key, location.pathname])

  useEffect(() => {
    if (localCards.length > 0) {
      if (dashboardCache) {
        setDashboardCache({ ...dashboardCache, cards: localCards, timestamp: Date.now() })
      }
      saveDashboardCardsToStorage(storageKey, localCards)
    }
  }, [dashboardCache, localCards, setDashboardCache, storageKey])

  useEffect(() => {
    if (pendingRestoreCard && !isLoading && clearPendingRestoreCard) {
      const size = getDefaultCardSize(pendingRestoreCard.cardType)
      const newCard: Card = {
        id: `restored-${Date.now()}`,
        card_type: pendingRestoreCard.cardType,
        config: pendingRestoreCard.config || {},
        position: { x: 0, y: 0, ...size },
        title: pendingRestoreCard.cardTitle,
      }
      recordCardAdded(
        newCard.id,
        newCard.card_type,
        newCard.title,
        newCard.config,
        dashboard?.id,
        dashboard?.name,
      )
      snapshot(localCards)
      setLocalCards(previous => [newCard, ...previous])
      clearPendingRestoreCard()
      showToast(
        t('dashboard.toast.cardRestored', 'Restored "{{name}}" card', {
          name: pendingRestoreCard.cardTitle || pendingRestoreCard.cardType,
        }),
        'success',
      )
    }
  }, [clearPendingRestoreCard, dashboard, isLoading, localCards, pendingRestoreCard, recordCardAdded, setLocalCards, showToast, snapshot, t])
}
