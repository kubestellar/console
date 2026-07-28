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
import { api, BackendUnavailableError, UnauthenticatedError } from '../../lib/api'
import { safeRevokeObjectURL } from '../../lib/download'
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
import { saveDashboardCardsToStorage } from '../../lib/dashboards/dashboardCardStorage'
import { useMissions } from '../../hooks/useMissions'
import type { Card, DashboardData } from './dashboardUtils'
import { isLocalOnlyCard, getDefaultCardSize, getDemoCards } from './dashboardUtils'
import { useDashboardReset } from '../../hooks/useDashboardReset'
import { useDashboardUndoRedo } from '../../hooks/useUndoRedo'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { useContextualNudges } from '../../hooks/useContextualNudges'
import { useDashboardScrollTracking } from '../../hooks/useDashboardScrollTracking'
import { useCardPublish, type DeployResultPayload } from '../../lib/cardEvents'
import { useDeployWorkload } from '../../hooks/useWorkloads'
import { useCardGridNavigation } from '../../hooks/useCardGridNavigation'
import { useModalState } from '../../lib/modals'
import { setAutoRefreshPaused } from '../../lib/cache'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { dashboardCollisionDetection, POINTER_SENSOR_ACTIVATION_DISTANCE } from './layout'
import { createDashboardStatValueGetter, buildClusterStats } from './dashboardState/selectors'
import { useDashboardCardActions } from './dashboardState/actions'
import {
  AUTO_REFRESH_INTERVAL_MS,
  DASHBOARD_STORAGE_KEY,
  DEFAULT_DASHBOARD_CARDS,
  dashboardCache,
  setDashboardCache,
  patchDashboardCache,
  initLocalCardsState,
  type PendingDeploy,
} from './persistence'

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

  const selectedClusterSet = useMemo(() => new Set(globalSelectedClusters), [globalSelectedClusters])
  const filteredClusters = useMemo(() => {
    const all = clusters || []
    if (isAllClustersSelected) return all
    return all.filter(cluster => selectedClusterSet.has(cluster.name))
  }, [clusters, isAllClustersSelected, selectedClusterSet])

  const {
    clusterCount,
    healthyClusters,
    unhealthyClusters,
    healthyNodes,
    totalPods,
    totalNamespaces,
    totalNodes,
  } = useMemo(() => buildClusterStats(filteredClusters), [filteredClusters])

  const getDashboardStatValue = useCallback(createDashboardStatValueGetter({
    clusterCount,
    healthyClusters,
    unhealthyClusters,
    healthyNodes,
    totalPods,
    totalNamespaces,
    totalNodes,
    drillToAllClusters,
    drillToAllNodes,
    drillToAllPods,
    navigate,
  }), [clusterCount, drillToAllClusters, drillToAllNodes, drillToAllPods, healthyClusters, healthyNodes, navigate, totalNamespaces, totalNodes, totalPods, unhealthyClusters])

  const getStatValue = getDashboardStatValue

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

    if (String(over.id).startsWith('dashboard-drop-')) {
      const targetDashboardId = over.data?.current?.dashboardId
      const targetDashboardName = over.data?.current?.dashboardName
      if (targetDashboardId && active.id) {
        try {
          await moveCardToDashboard(active.id as string, targetDashboardId)
          snapshot(localCards)
          setLocalCards(items => items.filter(item => item.id !== active.id))
          showToast(t('dashboard.toast.cardMoved', 'Card moved to "{{name}}"', { name: targetDashboardName }), 'success')
        } catch (error: unknown) {
          console.error('Failed to move card:', error)
          showToast(t('dashboard.toast.moveCardFailed', 'Failed to move card'), 'error')
        }
      }
      return
    }

    if (String(over.id) === 'create-new-dashboard') {
      try {
        const newDash = await createDashboard('New Dashboard')
        if (newDash?.id && active.id) {
          await moveCardToDashboard(active.id as string, newDash.id)
          snapshot(localCards)
          setLocalCards(items => items.filter(item => item.id !== active.id))
          showToast(t('dashboard.toast.cardMoved', 'Card moved to "{{name}}"', { name: newDash.name || t('dashboard.toast.newDashboard', 'New Dashboard') }), 'success')
        }
      } catch (error: unknown) {
        console.error('Failed to create dashboard and move card:', error)
        showToast(t('dashboard.toast.createDashboardFailed', 'Failed to create dashboard'), 'error')
      }
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

  const handleConfirmDeploy = useCallback(async () => {
    if (!pendingDeploy) return
    const { workloadName, namespace, sourceCluster, targetClusters, groupName } = pendingDeploy
    setPendingDeploy(null)

    const deployId = `deploy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    publishCardEvent({
      type: 'deploy:started',
      payload: {
        id: deployId,
        workload: workloadName,
        namespace,
        sourceCluster,
        targetClusters,
        groupName,
        timestamp: Date.now(),
      },
    })

    showToast(
      t('dashboard.toast.deploying', 'Deploying {{workload}} to {{count}} cluster(s) in "{{group}}"', { workload: workloadName, count: targetClusters.length, group: groupName }),
      'success',
    )

    try {
      await deployWorkload({
        workloadName,
        namespace,
        sourceCluster,
        targetClusters,
      }, {
        onSuccess: (result) => {
          const resp = result as unknown as {
            success?: boolean
            message?: string
            deployedTo?: string[]
            failedClusters?: string[]
            dependencies?: { kind: string; name: string; action: string }[]
            warnings?: string[]
          }
          if (resp && typeof resp === 'object') {
            publishCardEvent({
              type: 'deploy:result',
              payload: {
                id: deployId,
                success: resp.success ?? true,
                message: resp.message ?? '',
                deployedTo: resp.deployedTo,
                failedClusters: resp.failedClusters,
                dependencies: resp.dependencies as DeployResultPayload['dependencies'],
                warnings: resp.warnings,
              },
            })
          }
        },
      })
    } catch (error: unknown) {
      console.error('Deploy failed:', error)
      showToast(
        t('dashboard.toast.deployFailed', 'Deploy failed: {{detail}}', { detail: error instanceof Error ? error.message : t('dashboard.toast.unknownError', 'Unknown error') }),
        'error',
      )
    }
  }, [deployWorkload, pendingDeploy, publishCardEvent, showToast, t])

  const handleCreateDashboard = useCallback(() => {
    openAddCardModal('dashboards')
  }, [openAddCardModal])

  const loadDashboard = useCallback(async (isBackground: boolean = false) => {
    if (!isBackground) {
      setIsLoading(true)
    }
    try {
      const { data: dashboardsData } = await api.get<DashboardData[]>('/api/dashboards')
      if (dashboardsData && dashboardsData.length > 0) {
        const defaultDashboard = dashboardsData.find(d => d.is_default) || dashboardsData[0]
        const { data } = await api.get<DashboardData>(`/api/dashboards/${defaultDashboard.id}`)
        const apiCards = (data.cards && data.cards.length > 0) ? data.cards : getDemoCards()
        setDashboard(data)

        setLocalCards(prevCards => {
          const apiCardIds = new Set(apiCards.map(card => card.id))
          const localOnlyCards = prevCards.filter(card => isLocalOnlyCard(card.id) && !apiCardIds.has(card.id))
          if (localOnlyCards.length > 0) {
            return [...localOnlyCards, ...apiCards]
          }
          return apiCards
        })
        setDashboardCache({ dashboard: data, cards: apiCards, timestamp: Date.now() })
      } else {
        if (isBackground) {
          return
        }
        const cards = getDemoCards()
        setLocalCards(cards)
        setDashboardCache({ dashboard: null, cards, timestamp: Date.now() })
      }
    } catch (error: unknown) {
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

    const hasCachedOrLocalCards =
      ((dashboardCache?.cards?.length ?? 0) > 0) || localCards.length > 0
    const isWarmRefresh = hasCachedOrLocalCards

    loadDashboard(isWarmRefresh)
  }, [location.key, location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (localCards.length > 0) {
      patchDashboardCache({ cards: localCards, timestamp: Date.now() })
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

  const {
    handleAddCards,
    handleRemoveCard,
    handleConfigureCard,
    handleWidthChange,
    handleHeightChange,
    handleCardConfigured,
    handleAddRecommendedCard,
    handleCreateCardFromAI,
    handleApplyTemplate,
    handleAddSingleCard,
  } = useDashboardCardActions({
    dashboardId: dashboard?.id,
    dashboardName: dashboard?.name,
    localCards,
    insertAtIndex,
    setInsertAtIndex,
    setLocalCards,
    setSelectedCard,
    openConfigureCard,
    closeConfigureCard,
    snapshot,
    showToast,
    t,
    recordCardRemoved,
    recordCardAdded,
    recordCardConfigured,
  })

  const handleNudgeAction = useCallback(() => {
    if (activeNudge === 'customize') {
      openAddCardModal()
    } else if (activeNudge === 'pwa-install') {
      openWidgetExport()
    }
    actionNudge()
  }, [actionNudge, activeNudge, openAddCardModal, openWidgetExport])

  const currentCardTypes = useMemo(() => localCards.map(card => {
    if (card.card_type === 'dynamic_card' && card.config?.dynamicCardId) {
      return `dynamic_card::${card.config.dynamicCardId as string}`
    }
    return card.card_type
  }), [localCards])

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
      try {
        const data = await exportDashboard(dashboard.id)
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `${(dashboard.name || 'dashboard').replace(/\s+/g, '-').toLowerCase()}.json`
        anchor.click()
        safeRevokeObjectURL(url)
        showToast(t('dashboard.toast.exported', 'Dashboard exported'), 'success')
      } catch {
        showToast(t('dashboard.toast.exportFailed', 'Failed to export dashboard'), 'error')
      }
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
