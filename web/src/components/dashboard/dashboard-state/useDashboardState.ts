import { useState, useEffect, useRef, useCallback } from 'react'
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, BackendUnavailableError, UnauthenticatedError } from '../../../lib/api'
import { useDashboards } from '../../../hooks/useDashboards'
import { useClusters } from '../../../hooks/useMCP'
import { useCardHistory } from '../../../hooks/useCardHistory'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useDashboardContext } from '../../../hooks/useDashboardContext'
import { useToast } from '../../ui/Toast'
import { loadDashboardCardsFromStorage, saveDashboardCardsToStorage } from '../../../lib/dashboards/dashboardCardStorage'
import { useMissions } from '../../../hooks/useMissions'
import type { Card, DashboardData } from '../dashboardUtils'
import { getDefaultCardSize, getDemoCards } from '../dashboardUtils'
import { useDashboardReset } from '../../../hooks/useDashboardReset'
import { useDashboardUndoRedo } from '../../../hooks/useUndoRedo'
import { useRefreshIndicator } from '../../../hooks/useRefreshIndicator'
import { useContextualNudges } from '../../../hooks/useContextualNudges'
import { useDashboardScrollTracking } from '../../../hooks/useDashboardScrollTracking'
import { useCardPublish } from '../../../lib/cardEvents'
import { useDeployWorkload } from '../../../hooks/useWorkloads'
import { useCardGridNavigation } from '../../../hooks/useCardGridNavigation'
import { useModalState } from '../../../lib/modals'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { prefetchCardChunks } from '../../cards/cardRegistry'
import { isLocalOnlyCard } from '../dashboardUtils'
import {
  AUTO_REFRESH_INTERVAL_MS,
  DASHBOARD_STORAGE_KEY,
  DEFAULT_DASHBOARD_CARDS,
  getDashboardCache,
  setDashboardCache,
} from './constants'
import { useDashboardCardActions } from './useDashboardCardActions'
import { useDashboardDragAndDeploy } from './useDashboardDragAndDeploy'
import { useDashboardStats } from './useDashboardStats'

export function useDashboardState() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(() => getDashboardCache()?.dashboard || null)
  const [isLoading, setIsLoading] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const isActiveDashboard = location.pathname === '/' || location.pathname === ''
  const [searchParams, setSearchParams] = useSearchParams()
  const { isOpen: isConfigureCardOpen, open: openConfigureCard, close: closeConfigureCard } = useModalState()
  const { isOpen: isWidgetExportOpen, open: openWidgetExport, close: closeWidgetExport } = useModalState()

  const [localCards, setLocalCards] = useState<Card[]>(() => {
    if (getDashboardCache()?.cards?.length) return getDashboardCache()!.cards
    const restoredCards = loadDashboardCardsFromStorage<Card>(
      DASHBOARD_STORAGE_KEY,
      DEFAULT_DASHBOARD_CARDS,
      { requirePosition: true, requireGridCoordinates: true },
    )
    return restoredCards.length > 0 ? restoredCards : DEFAULT_DASHBOARD_CARDS
  })

  const {
    isAddCardModalOpen,
    closeAddCardModal,
    openAddCardModal,
    studioInitialSection,
    studioWidgetCardType,
    pendingOpenAddCardModal,
    setPendingOpenAddCardModal,
    pendingRestoreCard,
    clearPendingRestoreCard,
  } = useDashboardContext()

  const { openSidebar: openMissionSidebar, startMission } = useMissions()
  const { dashboards, moveCardToDashboard, createDashboard, exportDashboard } = useDashboards()
  const { showToast } = useToast()
  const { t } = useTranslation()
  const { recordCardRemoved, recordCardAdded, recordCardConfigured } = useCardHistory()
  const {
    deduplicatedClusters: clusters,
    isRefreshing: dataRefreshing,
    lastUpdated,
    refetch,
    isLoading: isClustersLoading,
    error: clustersError,
  } = useClusters()
  const { showIndicator, triggerRefresh } = useRefreshIndicator(refetch)
  const isRefreshing = dataRefreshing || showIndicator
  const isFetching = isClustersLoading || isRefreshing || showIndicator
  const { drillToAllClusters, drillToAllPods, drillToAllNodes } = useDrillDownActions()

  const { reset, isCustomized } = useDashboardReset({
    storageKey: DASHBOARD_STORAGE_KEY,
    defaultCards: DEFAULT_DASHBOARD_CARDS,
    setCards: setLocalCards,
    cards: localCards,
  })

  const localCardsRef = useRef(localCards)
  localCardsRef.current = localCards
  const { snapshot, undo, redo, canUndo, canRedo } = useDashboardUndoRedo<Card>(
    setLocalCards,
    () => localCardsRef.current,
    isActiveDashboard,
  )

  const { activeNudge, showDragHint, dismissNudge, actionNudge, recordVisit } = useContextualNudges(isCustomized)
  useDashboardScrollTracking()
  useEffect(() => { recordVisit() }, [recordVisit])

  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()
  const publishCardEvent = useCardPublish()
  const { mutate: deployWorkload } = useDeployWorkload()

  const stats = useDashboardStats({
    clusters,
    globalSelectedClusters,
    isAllClustersSelected,
    navigate,
    drillToAllClusters,
    drillToAllPods,
    drillToAllNodes,
  })

  const cardActions = useDashboardCardActions({
    dashboard,
    localCards,
    setLocalCards,
    snapshot,
    showToast,
    t,
    recordCardAdded,
    recordCardRemoved,
    recordCardConfigured,
    closeConfigureCard,
    closeAddCardModal,
    closeWidgetExport,
    exportDashboard,
  })

  const dragAndDeploy = useDashboardDragAndDeploy({
    localCards,
    snapshot,
    setLocalCards,
    moveCardToDashboard,
    createDashboard,
    showToast,
    t,
    deployWorkload,
    publishCardEvent,
  })

  const expandTriggersRef = useRef<Map<string, () => void>>(new Map())
  const handleExpandCard = (cardId: string) => {
    expandTriggersRef.current.get(cardId)?.()
  }
  const { registerCardRef, handleGridKeyDown } = useCardGridNavigation({
    cards: localCards,
    onExpandCard: handleExpandCard,
  })

  const handleRegisterExpandTrigger = useCallback((cardId: string, expand: () => void) => {
    expandTriggersRef.current.set(cardId, expand)
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const isLoadingRef = useRef(isLoading)
  isLoadingRef.current = isLoading

  useEffect(() => {
    stats.persistAutoRefresh(stats.autoRefresh)
  }, [stats.autoRefresh, stats.persistAutoRefresh])

  useEffect(() => {
    return () => {
      stats.persistAutoRefresh(true)
    }
  }, [stats.persistAutoRefresh])

  useEffect(() => {
    if (!stats.autoRefresh) return
    const intervalId = setInterval(() => {
      if (!isLoadingRef.current) {
        refetch()
      }
    }, AUTO_REFRESH_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [refetch, stats.autoRefresh])

  const loadDashboard = useCallback(async (isBackground = false) => {
    if (!isBackground) setIsLoading(true)
    try {
      const { data: dashboardsData } = await api.get<DashboardData[]>('/api/dashboards')
      if (dashboardsData && dashboardsData.length > 0) {
        const defaultDashboard = dashboardsData.find(item => item.is_default) || dashboardsData[0]
        const { data } = await api.get<DashboardData>(`/api/dashboards/${defaultDashboard.id}`)
        const apiCards = data.cards && data.cards.length > 0 ? data.cards : getDemoCards()
        setDashboard(data)
        setLocalCards(prevCards => {
          const apiCardIds = new Set(apiCards.map(card => card.id))
          const localOnlyCards = prevCards.filter(card => isLocalOnlyCard(card.id) && !apiCardIds.has(card.id))
          return localOnlyCards.length > 0 ? [...localOnlyCards, ...apiCards] : apiCards
        })
        setDashboardCache({ dashboard: data, cards: apiCards, timestamp: Date.now() })
      } else if (!isBackground) {
        const cards = getDemoCards()
        setLocalCards(cards)
        setDashboardCache({ dashboard: null, cards, timestamp: Date.now() })
      }
    } catch (error) {
      const isExpectedFailure = error instanceof BackendUnavailableError ||
        error instanceof UnauthenticatedError ||
        (error instanceof Error && (
          error.message.includes('Request timeout') ||
          error.message.includes('Failed to fetch') ||
          error.message.includes('NetworkError') ||
          error.message.includes('Load failed') ||
          error.message.includes('HTTP request to an HTTPS server') ||
          error.message.includes('API error:') ||
          error.message.includes('Invalid JSON')
        ))
      if (!isExpectedFailure) {
        console.error('Failed to load dashboard:', error)
        if (!isBackground) {
          showToast(t('dashboard.toast.loadFailed', 'Failed to load dashboard'), 'error')
        }
      }
      if (!isBackground) {
        setLocalCards(prevCards => {
          if (prevCards.length > 0) return prevCards
          const cards = getDemoCards()
          setDashboardCache({ dashboard: null, cards, timestamp: Date.now() })
          return cards
        })
      }
    } finally {
      setIsLoading(false)
    }
  }, [showToast, t])

  useEffect(() => {
    const isHomeDashboard = location.pathname === '/' || location.pathname === ''
    if (!isHomeDashboard) return
    const hasCachedOrLocalCards = ((getDashboardCache()?.cards?.length ?? 0) > 0) || localCards.length > 0
    loadDashboard(hasCachedOrLocalCards)
  }, [loadDashboard, location.key, location.pathname, localCards.length])

  useEffect(() => {
    if (localCards.length > 0) {
      const existingCache = getDashboardCache()
      if (existingCache) {
        setDashboardCache({ ...existingCache, cards: localCards, timestamp: Date.now() })
      }
      saveDashboardCardsToStorage(DASHBOARD_STORAGE_KEY, localCards)
    }
  }, [localCards])

  useEffect(() => {
    if (pendingRestoreCard && !isLoading) {
      const size = getDefaultCardSize(pendingRestoreCard.cardType)
      const newCard: Card = {
        id: `restored-${Date.now()}`,
        card_type: pendingRestoreCard.cardType,
        config: pendingRestoreCard.config || {},
        position: { x: 0, y: 0, ...size },
        title: pendingRestoreCard.cardTitle,
      }
      recordCardAdded(newCard.id, newCard.card_type, newCard.title, newCard.config, dashboard?.id, dashboard?.name)
      snapshot(localCards)
      setLocalCards(prev => [newCard, ...prev])
      clearPendingRestoreCard()
      showToast(t('dashboard.toast.cardRestored', 'Restored "{{name}}" card', { name: pendingRestoreCard.cardTitle || pendingRestoreCard.cardType }), 'success')
    }
  }, [clearPendingRestoreCard, dashboard?.id, dashboard?.name, isLoading, localCards, pendingRestoreCard, recordCardAdded, showToast, snapshot, t])

  useEffect(() => {
    if (pendingOpenAddCardModal && !isLoading) {
      openAddCardModal()
      setPendingOpenAddCardModal(false)
    }
  }, [isLoading, openAddCardModal, pendingOpenAddCardModal, setPendingOpenAddCardModal])

  useEffect(() => {
    if ((location.pathname !== '/' && location.pathname !== '') || searchParams.get('addCard') !== 'true') return
    cardActions.setAddCardSearch(searchParams.get('cardSearch') || '')
    openAddCardModal()
    const cleaned = new URLSearchParams(searchParams)
    cleaned.delete('addCard')
    cleaned.delete('cardSearch')
    setSearchParams(cleaned, { replace: true })
  }, [cardActions.setAddCardSearch, location.pathname, openAddCardModal, searchParams, setSearchParams])

  useEffect(() => {
    prefetchCardChunks(localCards.map(card => card.card_type))
  }, [localCards])

  const handleConfigureCard = useCallback((card: Card) => {
    cardActions.handleConfigureCard(card)
    openConfigureCard()
  }, [cardActions, openConfigureCard])

  const handleCreateDashboard = useCallback(() => {
    openAddCardModal('dashboards')
  }, [openAddCardModal])

  const handleInsertBefore = useCallback((index: number) => {
    cardActions.handleInsertBefore(index)
    openAddCardModal()
  }, [cardActions, openAddCardModal])

  const handleInsertAfter = useCallback((index: number) => {
    cardActions.handleInsertAfter(index)
    openAddCardModal()
  }, [cardActions, openAddCardModal])

  const handleCloseCustomizer = useCallback(() => {
    cardActions.handleCloseCustomizer()
  }, [cardActions])

  const handleCloseConfigureCard = useCallback(() => {
    cardActions.handleCloseConfigureCard()
  }, [cardActions])

  const handleCloseWidgetExport = useCallback(() => {
    cardActions.handleCloseWidgetExport()
  }, [cardActions])

  const handleNudgeAction = useCallback(() => {
    if (activeNudge === 'customize') {
      openAddCardModal()
    } else if (activeNudge === 'pwa-install') {
      openWidgetExport()
    }
    actionNudge()
  }, [actionNudge, activeNudge, openAddCardModal, openWidgetExport])

  const handleOpenDashboardCatalog = useCallback(() => {
    openAddCardModal('dashboards')
  }, [openAddCardModal])

  const handleRunHealthCheck = useCallback(() => {
    startMission({
      title: 'Cluster Health Check',
      description: 'AI-powered audit of your connected clusters',
      type: 'custom',
      initialPrompt: 'Run a comprehensive health check on all my connected clusters. Check for pod issues, resource constraints, and security concerns.',
    })
  }, [startMission])

  return {
    activeDragData: dragAndDeploy.activeDragData,
    activeId: dragAndDeploy.activeId,
    activeNudge,
    addCardSearch: cardActions.addCardSearch,
    autoRefresh: stats.autoRefresh,
    canRedo,
    canUndo,
    clusters,
    clustersError,
    collisionDetection: dragAndDeploy.collisionDetection,
    currentCardTypes: cardActions.currentCardTypes,
    dashboard,
    dashboards,
    dismissNudge,
    getStatValue: stats.getStatValue,
    handleAddCards: cardActions.handleAddCards,
    handleAddRecommendedCard: cardActions.handleAddRecommendedCard,
    handleAddSingleCard: cardActions.handleAddSingleCard,
    handleApplyTemplate: cardActions.handleApplyTemplate,
    handleCardConfigured: cardActions.handleCardConfigured,
    handleCloseConfigureCard,
    handleCloseCustomizer,
    handleCloseWidgetExport,
    handleConfirmDeploy: dragAndDeploy.handleConfirmDeploy,
    handleConfigureCard,
    handleCreateCardFromAI: cardActions.handleCreateCardFromAI,
    handleCreateDashboard,
    handleDragCancel: dragAndDeploy.handleDragCancel,
    handleDragEnd: dragAndDeploy.handleDragEnd,
    handleDragOver: dragAndDeploy.handleDragOver,
    handleDragStart: dragAndDeploy.handleDragStart,
    handleExportDashboard: cardActions.handleExportDashboard,
    handleGridKeyDown,
    handleHeightChange: cardActions.handleHeightChange,
    handleInsertAfter,
    handleInsertBefore,
    handleNudgeAction,
    handleOpenDashboardCatalog,
    handleRegisterExpandTrigger,
    handleRemoveCard: cardActions.handleRemoveCard,
    handleRunHealthCheck,
    handleSetPendingDeploy: dragAndDeploy.setPendingDeploy,
    handleWidthChange: cardActions.handleWidthChange,
    isAddCardModalOpen,
    isClustersLoading,
    isConfigureCardOpen,
    isCustomized,
    isDragging: dragAndDeploy.isDragging,
    isFetching,
    isLoading,
    isRefreshing,
    isWidgetExportOpen,
    lastUpdated,
    localCards,
    navigate,
    openAddCardModal,
    openMissionSidebar,
    pendingDeploy: dragAndDeploy.pendingDeploy,
    redo,
    refetch,
    registerCardRef,
    reset,
    selectedCard: cardActions.selectedCard,
    sensors,
    setAutoRefresh: stats.setAutoRefresh,
    showDragHint,
    studioInitialSection,
    studioWidgetCardType,
    triggerRefresh,
    undo,
  }
}

export type DashboardState = ReturnType<typeof useDashboardState>
