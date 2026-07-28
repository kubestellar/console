import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import { emitCardDragged } from '../../lib/analytics'
import { useDashboards } from '../../hooks/useDashboards'
import { useClusters } from '../../hooks/useMCP'
import { useCardHistory } from '../../hooks/useCardHistory'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useDashboardContext } from '../../hooks/useDashboardContext'
import { useToast } from '../ui/Toast'
import { prefetchCardChunks } from '../cards/cardRegistry'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'
import { STORAGE_KEY_DASHBOARD_AUTO_REFRESH } from '../../lib/constants'
import { useMissions } from '../../hooks/useMissions'
import type { Card, DashboardData } from './dashboardUtils'
import { getDefaultCardSize } from './dashboardUtils'
import { useDashboardReset } from '../../hooks/useDashboardReset'
import { useDashboardUndoRedo } from '../../hooks/useUndoRedo'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { useContextualNudges } from '../../hooks/useContextualNudges'
import { useDashboardScrollTracking } from '../../hooks/useDashboardScrollTracking'
import { type StatBlockValue } from '../ui/StatsOverview'
import { useCardPublish } from '../../lib/cardEvents'
import { useDeployWorkload } from '../../hooks/useWorkloads'
import { useCardGridNavigation } from '../../hooks/useCardGridNavigation'
import { useModalState } from '../../lib/modals'
import { setAutoRefreshPaused } from '../../lib/cache'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import type { DashboardTemplate } from './templates'
import { dashboardCollisionDetection, POINTER_SENSOR_ACTIVATION_DISTANCE } from './layout'
import {
  AUTO_REFRESH_INTERVAL_MS,
  DASHBOARD_STORAGE_KEY,
  DEFAULT_DASHBOARD_CARDS,
  dashboardCache,
  initLocalCardsState,
  type PendingDeploy,
} from './persistence'

// Sub-module imports (extracted from this file as part of #15790)
import {
  computeFilteredClusters,
  computeClusterStats,
  resolveStatValue,
  computeCurrentCardTypes,
} from './dashboardState.selectors'
import {
  loadDashboardData,
  persistLocalCards,
  addCardsToBoard,
  removeCardFromBoard,
  updateCardWidth,
  updateCardHeight,
  updateCardConfig,
  addRecommendedCard,
  addCardFromAI,
  applyDashboardTemplate,
  addSingleCard,
  confirmDeployAction,
  exportDashboardAsFile,
  moveCardToDashboardAction,
  moveCardToNewDashboardAction,
} from './dashboardState.actions'

export function useDashboardState() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(() => dashboardCache?.dashboard || null)
  const [isLoading, setIsLoading] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const isActiveDashboard = location.pathname === '/' || location.pathname === ''
  const [searchParams, setSearchParams] = useSearchParams()
  const { isOpen: isConfigureCardOpen, open: openConfigureCard, close: closeConfigureCard } = useModalState()
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [localCards, setLocalCards] = useState<Card[]>(initLocalCardsState)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeDragData, setActiveDragData] = useState<Record<string, unknown> | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null)
  const [__dragOverDashboard, setDragOverDashboard] = useState<string | null>(null)
  const { isOpen: isWidgetExportOpen, open: openWidgetExport, close: closeWidgetExport } = useModalState()

  const {
    isAddCardModalOpen,
    closeAddCardModal,
    openAddCardModal,
    studioInitialSection,
    studioWidgetCardType,
    pendingOpenAddCardModal,
    setPendingOpenAddCardModal,
    isTemplatesModalOpen: _isTemplatesModalOpen,
    closeTemplatesModal: _closeTemplatesModal,
    openTemplatesModal: _openTemplatesModal,
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
  const [pendingDeploy, setPendingDeploy] = useState<PendingDeploy | null>(null)

  // ── Selectors ────────────────────────────────────────────────────────────

  const filteredClusters = useMemo(
    () => computeFilteredClusters(clusters || [], globalSelectedClusters, isAllClustersSelected),
    [clusters, globalSelectedClusters, isAllClustersSelected],
  )

  const {
    clusterCount,
    healthyClusters,
    unhealthyClusters,
    healthyNodes,
    totalPods,
    totalNamespaces,
    totalNodes,
  } = useMemo(() => computeClusterStats(filteredClusters), [filteredClusters])

  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue =>
    resolveStatValue(blockId, {
      clusterCount, healthyClusters, unhealthyClusters, healthyNodes,
      totalPods, totalNamespaces, totalNodes,
      drillToAllClusters, drillToAllNodes, drillToAllPods, navigate,
    }),
    [clusterCount, drillToAllClusters, drillToAllNodes, drillToAllPods, healthyClusters, healthyNodes, navigate, totalNamespaces, totalNodes, totalPods, unhealthyClusters],
  )

  const getStatValue = getDashboardStatValue

  // ── Auto-refresh ─────────────────────────────────────────────────────────

  const [autoRefresh, setAutoRefresh] = useState(() => {
    const stored = safeGetItem(STORAGE_KEY_DASHBOARD_AUTO_REFRESH)
    return stored !== null ? stored === 'true' : true
  })
  const autoRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    safeSetItem(STORAGE_KEY_DASHBOARD_AUTO_REFRESH, String(autoRefresh))
    setAutoRefreshPaused(!autoRefresh)
    return () => {
      setAutoRefreshPaused(false)
    }
  }, [autoRefresh])

  const isLoadingRef = useRef(isLoading)
  isLoadingRef.current = isLoading

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

  // ── Card grid navigation ─────────────────────────────────────────────────

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
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: POINTER_SENSOR_ACTIVATION_DISTANCE,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const collisionDetection = dashboardCollisionDetection

  // ── Drag handlers ────────────────────────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string
    const data = event.active.data.current as Record<string, unknown> | null
    setActiveId(id)
    setActiveDragData(data)
    setIsDragging(true)
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event
    if (over && (String(over.id).startsWith('dashboard-drop-') || String(over.id) === 'create-new-dashboard')) {
      const dashboardId = over.data?.current?.dashboardId
      setDragOverDashboard(dashboardId || null)
      return
    }
    setDragOverDashboard(null)
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    setActiveDragData(null)
    setIsDragging(false)
    setDragOverDashboard(null)

    if (!over) return

    if (
      active.data.current?.type === 'workload' &&
      String(over.id).startsWith('cluster-group-')
    ) {
      const workloadData = active.data.current.workload as {
        name: string
        namespace: string
        sourceCluster: string
        currentClusters: string[]
      }
      const groupData = over.data.current as {
        groupName: string
        clusters: string[]
      }

      if (groupData?.clusters?.length > 0) {
        setPendingDeploy({
          workloadName: workloadData.name,
          namespace: workloadData.namespace,
          sourceCluster: workloadData.sourceCluster,
          targetClusters: groupData.clusters,
          groupName: groupData.groupName,
        })
      }
      return
    }

    const moveDeps = { moveCardToDashboard, createDashboard, snapshot, localCards, setLocalCards, showToast, t }

    if (String(over.id).startsWith('dashboard-drop-')) {
      const targetDashboardId = over.data?.current?.dashboardId
      const targetDashboardName = over.data?.current?.dashboardName
      if (targetDashboardId && active.id) {
        await moveCardToDashboardAction(active.id as string, targetDashboardId, targetDashboardName, moveDeps)
      }
      return
    }

    if (String(over.id) === 'create-new-dashboard') {
      await moveCardToNewDashboardAction(active.id as string, moveDeps)
      return
    }

    if (active.id !== over.id) {
      const draggedCard = localCards.find(card => card.id === active.id)
      if (draggedCard) emitCardDragged(draggedCard.card_type)
      snapshot(localCards)
      setLocalCards(items => {
        const oldIndex = items.findIndex(item => item.id === active.id)
        const newIndex = items.findIndex(item => item.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }, [createDashboard, localCards, moveCardToDashboard, showToast, snapshot, t])

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
    setActiveDragData(null)
    setIsDragging(false)
    setDragOverDashboard(null)
  }, [])

  // ── Card action handlers ─────────────────────────────────────────────────

  const handleConfirmDeploy = useCallback(async () => {
    if (!pendingDeploy) return
    setPendingDeploy(null)
    await confirmDeployAction({ pendingDeploy, deployWorkload, publishCardEvent, showToast, t })
  }, [deployWorkload, pendingDeploy, publishCardEvent, showToast, t])

  const handleCreateDashboard = useCallback(() => {
    openAddCardModal('dashboards')
  }, [openAddCardModal])

  const loadDashboard = useCallback(async (isBackground: boolean = false) => {
    await loadDashboardData(isBackground, DASHBOARD_STORAGE_KEY, { setIsLoading, setDashboard, setLocalCards, showToast, t })
  }, [showToast, t])

  useEffect(() => {
    const isHomeDashboard = location.pathname === '/' || location.pathname === ''
    if (!isHomeDashboard) return

    const hasCachedOrLocalCards =
      ((dashboardCache?.cards?.length ?? 0) > 0) || localCards.length > 0
    const isWarmRefresh = hasCachedOrLocalCards

    loadDashboard(isWarmRefresh)
  }, [location.key, location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    persistLocalCards(DASHBOARD_STORAGE_KEY, localCards)
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
      recordCardAdded(
        newCard.id,
        newCard.card_type,
        newCard.title,
        newCard.config,
        dashboard?.id,
        dashboard?.name,
      )
      snapshot(localCards)
      setLocalCards(prev => [newCard, ...prev])
      clearPendingRestoreCard()
      showToast(t('dashboard.toast.cardRestored', 'Restored "{{name}}" card', { name: pendingRestoreCard.cardTitle || pendingRestoreCard.cardType }), 'success')
    }
  }, [pendingRestoreCard, isLoading, dashboard, recordCardAdded, clearPendingRestoreCard, showToast, localCards, snapshot, t])

  useEffect(() => {
    if (pendingOpenAddCardModal && !isLoading) {
      openAddCardModal()
      setPendingOpenAddCardModal(false)
    }
  }, [pendingOpenAddCardModal, isLoading, openAddCardModal, setPendingOpenAddCardModal])

  const [addCardSearch, setAddCardSearch] = useState('')
  useEffect(() => {
    if (location.pathname !== '/' && location.pathname !== '') return
    if (searchParams.get('addCard') === 'true') {
      setAddCardSearch(searchParams.get('cardSearch') || '')
      openAddCardModal()
      const cleaned = new URLSearchParams(searchParams)
      cleaned.delete('addCard')
      cleaned.delete('cardSearch')
      setSearchParams(cleaned, { replace: true })
    }
  }, [searchParams, setSearchParams, openAddCardModal, location.pathname])

  const cardMutationBase = useMemo(
    () => ({ localCards, dashboard, snapshot, setLocalCards, showToast, t, recordCardAdded, recordCardRemoved, recordCardConfigured, closeConfigureCard }),
    [localCards, dashboard, snapshot, setLocalCards, showToast, t, recordCardAdded, recordCardRemoved, recordCardConfigured, closeConfigureCard]
  )

  const handleAddCards = useCallback(async (suggestions: Array<{
    type: string
    title: string
    visualization: string
    config: Record<string, unknown>
  }>) => {
    await addCardsToBoard(suggestions, insertAtIndex, { ...cardMutationBase, recordCardAdded })
    setInsertAtIndex(null)
  }, [cardMutationBase, insertAtIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemoveCard = useCallback(async (cardId: string) => {
    await removeCardFromBoard(cardId, { ...cardMutationBase, recordCardRemoved })
  }, [cardMutationBase]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleConfigureCard = useCallback((card: Card) => {
    setSelectedCard(card)
    openConfigureCard()
  }, [openConfigureCard])

  const handleWidthChange = useCallback(async (cardId: string, newWidth: number) => {
    await updateCardWidth(cardId, newWidth, cardMutationBase)
  }, [cardMutationBase]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleHeightChange = useCallback(async (cardId: string, newHeight: number) => {
    await updateCardHeight(cardId, newHeight, cardMutationBase)
  }, [cardMutationBase]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCardConfigured = useCallback(async (cardId: string, newConfig: Record<string, unknown>, newTitle?: string) => {
    await updateCardConfig(cardId, newConfig, newTitle, { ...cardMutationBase, closeConfigureCard })
    setSelectedCard(null)
  }, [cardMutationBase, closeConfigureCard]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddRecommendedCard = useCallback((cardType: string, config?: Record<string, unknown>, title?: string) => {
    addRecommendedCard(cardType, config, title, cardMutationBase)
  }, [cardMutationBase]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateCardFromAI = useCallback((cardType: string, config: Record<string, unknown>, title?: string) => {
    addCardFromAI(cardType, config, title, { ...cardMutationBase, closeConfigureCard })
    setSelectedCard(null)
  }, [cardMutationBase, closeConfigureCard]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleApplyTemplate = useCallback((template: DashboardTemplate) => {
    applyDashboardTemplate(template, cardMutationBase)
  }, [cardMutationBase]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddSingleCard = useCallback((cardType: string) => {
    addSingleCard(cardType, cardMutationBase)
  }, [cardMutationBase]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleNudgeAction = useCallback(() => {
    if (activeNudge === 'customize') {
      openAddCardModal()
    } else if (activeNudge === 'pwa-install') {
      openWidgetExport()
    }
    actionNudge()
  }, [actionNudge, activeNudge, openAddCardModal, openWidgetExport])

  const currentCardTypes = useMemo(() => computeCurrentCardTypes(localCards), [localCards])

  useEffect(() => {
    prefetchCardChunks(localCards.map(card => card.card_type))
  }, [localCards])

  const handleInsertBefore = useCallback((index: number) => {
    setInsertAtIndex(index)
    openAddCardModal()
  }, [openAddCardModal])

  const handleInsertAfter = useCallback((index: number) => {
    setInsertAtIndex(index + 1)
    openAddCardModal()
  }, [openAddCardModal])

  const handleCloseCustomizer = useCallback(() => {
    closeAddCardModal()
    setAddCardSearch('')
    setInsertAtIndex(null)
  }, [closeAddCardModal])

  const handleCloseConfigureCard = useCallback(() => {
    closeConfigureCard()
    setSelectedCard(null)
  }, [closeConfigureCard])

  const handleCloseWidgetExport = useCallback(() => {
    closeWidgetExport()
  }, [closeWidgetExport])

  const handleSetPendingDeploy = useCallback((deploy: PendingDeploy | null) => {
    setPendingDeploy(deploy)
  }, [])

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

  const handleExportDashboard = useMemo(() => {
    if (!dashboard?.id) return undefined
    return async () => {
      await exportDashboardAsFile(dashboard.id, dashboard.name || 'dashboard', exportDashboard, showToast, t)
    }
  }, [dashboard?.id, dashboard?.name, exportDashboard, showToast, t])

  return {
    activeDragData,
    activeId,
    activeNudge,
    addCardSearch,
    autoRefresh,
    canRedo,
    canUndo,
    clusters,
    clustersError,
    collisionDetection,
    currentCardTypes,
    dashboard,
    dashboards,
    dismissNudge,
    getStatValue,
    handleAddCards,
    handleAddRecommendedCard,
    handleAddSingleCard,
    handleApplyTemplate,
    handleCardConfigured,
    handleCloseConfigureCard,
    handleCloseCustomizer,
    handleCloseWidgetExport,
    handleConfirmDeploy,
    handleConfigureCard,
    handleCreateCardFromAI,
    handleCreateDashboard,
    handleDragCancel,
    handleDragEnd,
    handleDragOver,
    handleDragStart,
    handleExportDashboard,
    handleGridKeyDown,
    handleHeightChange,
    handleInsertAfter,
    handleInsertBefore,
    handleNudgeAction,
    handleOpenDashboardCatalog,
    handleRegisterExpandTrigger,
    handleRemoveCard,
    handleRunHealthCheck,
    handleSetPendingDeploy,
    handleWidthChange,
    isAddCardModalOpen,
    isClustersLoading,
    isConfigureCardOpen,
    isCustomized,
    isDragging,
    isFetching,
    isLoading,
    isRefreshing,
    isWidgetExportOpen,
    lastUpdated,
    localCards,
    navigate,
    openAddCardModal,
    openMissionSidebar,
    pendingDeploy,
    redo,
    refetch,
    registerCardRef,
    reset,
    selectedCard,
    sensors,
    setAutoRefresh,
    showDragHint,
    studioInitialSection,
    studioWidgetCardType,
    triggerRefresh,
    undo,
  }
}

export type DashboardState = ReturnType<typeof useDashboardState>

// Re-export types from sub-modules so consumers can import them from here if needed
export type { ClusterStats, StatValueDeps } from './dashboardState.selectors'
