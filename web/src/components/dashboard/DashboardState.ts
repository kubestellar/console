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
    isAddCardModalOpen, closeAddCardModal, openAddCardModal,
    studioInitialSection, studioWidgetCardType,
    pendingOpenAddCardModal, setPendingOpenAddCardModal,
    isTemplatesModalOpen: _isTemplatesModalOpen,
    closeTemplatesModal: _closeTemplatesModal,
    openTemplatesModal: _openTemplatesModal,
    pendingRestoreCard, clearPendingRestoreCard,
  } = useDashboardContext()

  const { openSidebar: openMissionSidebar, startMission } = useMissions()
  const { dashboards, moveCardToDashboard, createDashboard, exportDashboard } = useDashboards()
  const { showToast } = useToast()
  const { t } = useTranslation()
  const { recordCardRemoved, recordCardAdded, recordCardConfigured } = useCardHistory()
  const { deduplicatedClusters: clusters, isRefreshing: dataRefreshing, lastUpdated, refetch, isLoading: isClustersLoading, error: clustersError } = useClusters()
  const { showIndicator, triggerRefresh } = useRefreshIndicator(refetch)
  const isRefreshing = dataRefreshing || showIndicator
  const isFetching = isClustersLoading || isRefreshing || showIndicator
  const { drillToAllClusters, drillToAllPods, drillToAllNodes } = useDrillDownActions()

  const { reset, isCustomized } = useDashboardReset({ storageKey: DASHBOARD_STORAGE_KEY, defaultCards: DEFAULT_DASHBOARD_CARDS, setCards: setLocalCards, cards: localCards })

  const localCardsRef = useRef(localCards)
  localCardsRef.current = localCards
  const { snapshot, undo, redo, canUndo, canRedo } = useDashboardUndoRedo<Card>(setLocalCards, () => localCardsRef.current, isActiveDashboard)
  const { activeNudge, showDragHint, dismissNudge, actionNudge, recordVisit } = useContextualNudges(isCustomized)

  useDashboardScrollTracking()
  useEffect(() => { recordVisit() }, [recordVisit])

  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()
  const publishCardEvent = useCardPublish()
  const { mutate: deployWorkload } = useDeployWorkload()
  const [pendingDeploy, setPendingDeploy] = useState<PendingDeploy | null>(null)

  // ── Selectors ────────────────────────────────────────────────────────────────────────────

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

  // ── Auto-refresh ──────────────────────────────────────────────────────────────────────

  const [autoRefresh, setAutoRefresh] = useState(() => {
    const stored = safeGetItem(STORAGE_KEY_DASHBOARD_AUTO_REFRESH)
    return stored !== null ? stored === 'true' : true
  })
  const autoRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    safeSetItem(STORAGE_KEY_DASHBOARD_AUTO_REFRESH, String(autoRefresh))
    setAutoRefreshPaused(!autoRefresh)
    return () => { setAutoRefreshPaused(false) }
  }, [autoRefresh])

  const isLoadingRef = useRef(isLoading)
  isLoadingRef.current = isLoading

  useEffect(() => {
    if (!autoRefresh) return
    autoRefreshIntervalRef.current = setInterval(() => { if (!isLoadingRef.current) refetch() }, AUTO_REFRESH_INTERVAL_MS)
    return () => { if (autoRefreshIntervalRef.current) { clearInterval(autoRefreshIntervalRef.current); autoRefreshIntervalRef.current = null } }
  }, [autoRefresh, refetch])

  // ── Card grid navigation ────────────────────────────────────────────────────────────

  const expandTriggersRef = useRef<Map<string, () => void>>(new Map())
  const handleExpandCard = (cardId: string) => { expandTriggersRef.current.get(cardId)?.() }
  const { registerCardRef, handleGridKeyDown } = useCardGridNavigation({ cards: localCards, onExpandCard: handleExpandCard })
  const handleRegisterExpandTrigger = useCallback((cardId: string, expand: () => void) => { expandTriggersRef.current.set(cardId, expand) }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: POINTER_SENSOR_ACTIVATION_DISTANCE } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ── Drag handlers ──────────────────────────────────────────────────────────────────────

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveId(active.id as string)
    setActiveDragData(active.data.current as Record<string, unknown> || null)
    setIsDragging(true)
  }, [])

  const handleDragOver = useCallback(({ over }: DragOverEvent) => {
    setDragOverDashboard(over?.id as string | null)
  }, [])

  const handleDragEnd = useCallback(async ({ active, over }: DragEndEvent) => {
    setIsDragging(false)
    setActiveId(null)
    setActiveDragData(null)
    setDragOverDashboard(null)

    if (!over) return

    const activeIdStr = active.id as string
    const overIdStr = over.id as string

    const targetDashboardId = activeDragData?.targetDashboardId as string | undefined
    const targetDashboardName = activeDragData?.targetDashboardName as string | undefined

    if (targetDashboardId) {
      await moveCardToDashboardAction(active.id as string, targetDashboardId, targetDashboardName, moveDeps)
      return
    }

    if (overIdStr === 'new-dashboard-drop-zone') {
      await moveCardToNewDashboardAction(active.id as string, moveDeps)
      return
    }

    if (activeIdStr !== overIdStr) {
      setLocalCards(cards => {
        const oldIndex = cards.findIndex(c => c.id === activeIdStr)
        const newIndex = cards.findIndex(c => c.id === overIdStr)
        if (oldIndex === -1 || newIndex === -1) return cards
        const reordered = arrayMove(cards, oldIndex, newIndex)
        emitCardDragged({ cardId: activeIdStr, fromIndex: oldIndex, toIndex: newIndex })
        return reordered
      })
    }

    setInsertAtIndex(null)
  }, [activeDragData, moveDeps, moveCardToDashboardAction, moveCardToNewDashboardAction])

  // ── Card mutation callbacks ──────────────────────────────────────────────────────

  const cardMutationBase = useMemo(() => ({
    localCards,
    dashboard,
    snapshot,
    setLocalCards,
    showToast,
    t,
  }), [localCards, dashboard, snapshot, showToast, t])

  const moveDeps = useMemo(() => ({
    localCards,
    dashboard,
    dashboards,
    moveCardToDashboard,
    createDashboard,
    setLocalCards,
    snapshot,
    showToast,
    t,
  }), [localCards, dashboard, dashboards, moveCardToDashboard, createDashboard, snapshot, showToast, t])

  const handleConfirmDeploy = useCallback(async () => {
    await confirmDeployAction({ pendingDeploy, deployWorkload, publishCardEvent, showToast, t })
    setPendingDeploy(null)
  }, [pendingDeploy, deployWorkload, publishCardEvent, showToast, t])

  const handleAddCards = useCallback(async (suggestions: Card[]) => {
    prefetchCardChunks(suggestions.map(c => c.card_type))
    await addCardsToBoard(suggestions, insertAtIndex, { ...cardMutationBase, recordCardAdded })
  }, [cardMutationBase, insertAtIndex, recordCardAdded])

  const handleRemoveCard = useCallback(async (cardId: string) => {
    await removeCardFromBoard(cardId, { ...cardMutationBase, recordCardRemoved })
  }, [cardMutationBase, recordCardRemoved])

  const handleUpdateCardWidth = useCallback(async (cardId: string, newWidth: number) => {
    await updateCardWidth(cardId, newWidth, cardMutationBase)
  }, [cardMutationBase])

  const handleUpdateCardHeight = useCallback(async (cardId: string, newHeight: number) => {
    await updateCardHeight(cardId, newHeight, cardMutationBase)
  }, [cardMutationBase])

  const handleConfigureCard = useCallback(async (cardId: string, newConfig: Record<string, unknown>, newTitle?: string) => {
    await updateCardConfig(cardId, newConfig, newTitle, { ...cardMutationBase, closeConfigureCard })
  }, [cardMutationBase, closeConfigureCard])

  const handleAddRecommendedCard = useCallback((cardType: string, config?: Record<string, unknown>, title?: string) => {
    addRecommendedCard(cardType, config, title, cardMutationBase)
  }, [cardMutationBase])

  const handleAddCardFromAI = useCallback((cardType: string, config?: Record<string, unknown>, title?: string) => {
    addCardFromAI(cardType, config, title, cardMutationBase)
  }, [cardMutationBase])

  const handleApplyTemplate = useCallback(async (template: DashboardTemplate) => {
    await applyDashboardTemplate(template, cardMutationBase)
  }, [cardMutationBase])

  const handleAddSingleCard = useCallback(async (cardType: string) => {
    await addSingleCard(cardType, insertAtIndex, { ...cardMutationBase, recordCardAdded })
  }, [cardMutationBase, insertAtIndex, recordCardAdded])

  const handleNudgeAction = useCallback(() => {
    actionNudge()
    openAddCardModal()
  }, [actionNudge, openAddCardModal])

  const handleOpenDashboardCatalog = useCallback((insertIdx?: number) => {
    setInsertAtIndex(insertIdx ?? null)
    openAddCardModal()
  }, [openAddCardModal])

  const handleExportDashboard = useCallback(async () => {
    if (!dashboard?.id) return
    await exportDashboardAsFile(dashboard.id, dashboard.name || 'dashboard', exportDashboard, showToast, t)
  }, [dashboard?.id, dashboard?.name, exportDashboard, showToast, t])

  const handleOpenConfigureCard = useCallback((card: Card) => {
    setSelectedCard(card)
    openConfigureCard()
  }, [openConfigureCard])

  // ── Effects ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    void loadDashboardData(false, { setIsLoading, setDashboard, setLocalCards, showToast, t })
  }, [showToast, t])

  useEffect(() => {
    if (pendingRestoreCard) {
      handleAddCards([pendingRestoreCard])
      clearPendingRestoreCard()
    }
  }, [pendingRestoreCard, clearPendingRestoreCard, handleAddCards])

  useEffect(() => {
    if (!pendingOpenAddCardModal) return
    openAddCardModal(studioInitialSection)
    setPendingOpenAddCardModal(false)
  }, [pendingOpenAddCardModal, openAddCardModal, setPendingOpenAddCardModal, studioInitialSection])

  const isRefreshingRef = useRef(isRefreshing)
  isRefreshingRef.current = isRefreshing

  const prevIsRefreshingRef = useRef(isRefreshing)
  const cardsOnMountRef = useRef<Card[] | null>(null)

  useEffect(() => {
    if (isRefreshing && !prevIsRefreshingRef.current) {
      cardsOnMountRef.current = localCardsRef.current
    }
    if (!isRefreshing && prevIsRefreshingRef.current) {
      void loadDashboardData(true, { setIsLoading, setDashboard, setLocalCards, showToast, t })
      cardsOnMountRef.current = null
    }
    prevIsRefreshingRef.current = isRefreshing
  }, [isRefreshing, showToast, t])

  useEffect(() => {
    persistLocalCards(DASHBOARD_STORAGE_KEY, localCards)
  }, [localCards])

  // ── Computed state ─────────────────────────────────────────────────────────────────

  const currentCardTypes = useMemo(() => computeCurrentCardTypes(localCards), [localCards])

  const isCardOnDashboard = useCallback((cardType: string) => currentCardTypes.includes(cardType), [currentCardTypes])

  // ── Return value ───────────────────────────────────────────────────────────────────

  return {
    // State
    dashboard,
    isLoading,
    localCards,
    activeId,
    activeDragData,
    isDragging,
    isRefreshing,
    isFetching,
    isClustersLoading,
    clustersError,
    lastUpdated,
    selectedCard,
    isConfigureCardOpen,
    autoRefresh,
    canUndo,
    canRedo,
    pendingDeploy,
    isWidgetExportOpen,
    // Modal state
    isAddCardModalOpen,
    studioInitialSection,
    studioWidgetCardType,
    // Nudge state
    activeNudge,
    showDragHint,
    // Actions
    setAutoRefresh,
    handleAddCards,
    handleRemoveCard,
    handleUpdateCardWidth,
    handleUpdateCardHeight,
    handleConfigureCard,
    handleAddRecommendedCard,
    handleAddCardFromAI,
    handleApplyTemplate,
    handleAddSingleCard,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleOpenDashboardCatalog,
    handleNudgeAction,
    dismissNudge,
    handleExportDashboard,
    handleOpenConfigureCard,
    openConfigureCard,
    closeConfigureCard,
    openAddCardModal,
    closeAddCardModal,
    openWidgetExport,
    closeWidgetExport,
    reset,
    undo,
    redo,
    getStatValue,
    isCardOnDashboard,
    handleGridKeyDown,
    registerCardRef,
    handleRegisterExpandTrigger,
    sensors,
    triggerRefresh,
    handleConfirmDeploy,
    setPendingDeploy,
    insertAtIndex,
    setInsertAtIndex,
    prefetchCardChunks,
    openMissionSidebar,
    startMission,
  }
}

// Re-export types from sub-modules so consumers can import them from here if needed
export type { ClusterStats, StatValueDeps } from './dashboardState.selectors'
