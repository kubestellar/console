import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { safeRevokeObjectURL } from '../../lib/download'
import { useDashboards } from '../../hooks/useDashboards'
import { useClusters } from '../../hooks/useMCP'
import { useCardHistory } from '../../hooks/useCardHistory'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useDashboardContext } from '../../hooks/useDashboardContext'
import { useToast } from '../ui/Toast'
import { prefetchCardChunks } from '../cards/cardRegistry'
import { getDefaultCardsForDashboard } from '../../config/dashboards'
import { loadDashboardCardsFromStorage } from '../../lib/dashboards/dashboardCardStorage'
import { useMissions } from '../../hooks/useMissions'
import { getDemoCards, type Card, type DashboardData } from './dashboardUtils'
import { useDashboardReset } from '../../hooks/useDashboardReset'
import { useDashboardUndoRedo } from '../../hooks/useUndoRedo'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { useContextualNudges } from '../../hooks/useContextualNudges'
import { useDashboardScrollTracking } from '../../hooks/useDashboardScrollTracking'
import type { DeployResultPayload } from '../../lib/cardEvents'
import { useCardPublish } from '../../lib/cardEvents'
import { useDeployWorkload } from '../../hooks/useWorkloads'
import { useCardGridNavigation } from '../../hooks/useCardGridNavigation'
import { useModalState } from '../../lib/modals'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { STORAGE_KEY_MAIN_DASHBOARD_CARDS } from '../../lib/constants/storage'
import { useDashboardAutoRefresh } from './state/autoRefresh'
import { useDashboardCardOperations } from './state/cardOperations'
import { useDashboardFilterState } from './state/filterState'
import { useDashboardLayoutState } from './state/layoutState'
import { useDashboardLoading } from './state/loading'
import type { CachedDashboard, PendingDeploy } from './state/types'

let dashboardCacheRef: CachedDashboard | null = null

const DASHBOARD_STORAGE_KEY = STORAGE_KEY_MAIN_DASHBOARD_CARDS
const DEFAULT_DASHBOARD_CARDS: Card[] = getDefaultCardsForDashboard('main')

export function useDashboardState() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(() => dashboardCacheRef?.dashboard || null)
  const [isLoading, setIsLoading] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const isActiveDashboard = location.pathname === '/' || location.pathname === ''
  const [searchParams, setSearchParams] = useSearchParams()
  const { isOpen: isConfigureCardOpen, open: openConfigureCard, close: closeConfigureCard } = useModalState()
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [localCards, setLocalCards] = useState<Card[]>(() => {
    if (dashboardCacheRef?.cards?.length) return dashboardCacheRef.cards
    const restoredCards = loadDashboardCardsFromStorage<Card>(
      DASHBOARD_STORAGE_KEY,
      DEFAULT_DASHBOARD_CARDS,
      { requirePosition: true, requireGridCoordinates: true },
    )
    if (restoredCards.length > 0) {
      return restoredCards
    }
    return DEFAULT_DASHBOARD_CARDS
  })
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null)
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
  const { getStatValue } = useDashboardFilterState({
    clusters: clusters || [],
    globalSelectedClusters,
    isAllClustersSelected,
    drillToAllClusters,
    drillToAllPods,
    drillToAllNodes,
  })

  const publishCardEvent = useCardPublish()
  const { mutate: deployWorkload } = useDeployWorkload()
  const [pendingDeploy, setPendingDeploy] = useState<PendingDeploy | null>(null)
  const { autoRefresh, setAutoRefresh } = useDashboardAutoRefresh({ isLoading, refetch })

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

  const {
    activeId,
    activeDragData,
    collisionDetection,
    handleDragCancel,
    handleDragEnd,
    handleDragOver,
    handleDragStart,
    isDragging,
  } = useDashboardLayoutState({
    localCards,
    setLocalCards,
    snapshot,
    setPendingDeploy,
    moveCardToDashboard,
    createDashboard,
    showToast,
  })

  const {
    handleAddCards,
    handleAddRecommendedCard,
    handleAddSingleCard,
    handleApplyTemplate,
    handleCardConfigured,
    handleConfigureCard,
    handleCreateCardFromAI,
    handleHeightChange,
    handleRemoveCard,
    handleWidthChange,
  } = useDashboardCardOperations({
    dashboard,
    localCards,
    setLocalCards,
    snapshot,
    insertAtIndex,
    setInsertAtIndex,
    setSelectedCard,
    openConfigureCard,
    closeConfigureCard,
    recordCardAdded,
    recordCardRemoved,
    recordCardConfigured,
    showToast,
  })

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
      t('dashboard.toast.deploying', 'Deploying {{workload}} to {{count}} cluster(s) in "{{group}}"', {
        workload: workloadName,
        count: targetClusters.length,
        group: groupName,
      }),
      'success',
    )

    try {
      await deployWorkload({ workloadName, namespace, sourceCluster, targetClusters }, {
        onSuccess: result => {
          const response = result as unknown as {
            success?: boolean
            message?: string
            deployedTo?: string[]
            failedClusters?: string[]
            dependencies?: { kind: string; name: string; action: string }[]
            warnings?: string[]
          }
          if (response && typeof response === 'object') {
            publishCardEvent({
              type: 'deploy:result',
              payload: {
                id: deployId,
                success: response.success ?? true,
                message: response.message ?? '',
                deployedTo: response.deployedTo,
                failedClusters: response.failedClusters,
                dependencies: response.dependencies as DeployResultPayload['dependencies'],
                warnings: response.warnings,
              },
            })
          }
        },
      })
    } catch (error: unknown) {
      console.error('Deploy failed:', error)
      showToast(
        t('dashboard.toast.deployFailed', 'Deploy failed: {{detail}}', {
          detail: error instanceof Error ? error.message : t('dashboard.toast.unknownError', 'Unknown error'),
        }),
        'error',
      )
    }
  }, [deployWorkload, pendingDeploy, publishCardEvent, showToast, t])

  const setDashboardCache = useCallback((cache: CachedDashboard | null) => {
    dashboardCacheRef = cache
  }, [])

  useDashboardLoading({
    localCards,
    setLocalCards,
    setDashboard,
    setIsLoading,
    isLoading,
    dashboardCache: dashboardCacheRef,
    setDashboardCache,
    storageKey: DASHBOARD_STORAGE_KEY,
    showToast,
    dashboard,
    snapshot,
    recordCardAdded,
    pendingRestoreCard,
    clearPendingRestoreCard,
  })

  useEffect(() => {
    if (pendingOpenAddCardModal && !isLoading) {
      openAddCardModal()
      setPendingOpenAddCardModal(false)
    }
  }, [isLoading, openAddCardModal, pendingOpenAddCardModal, setPendingOpenAddCardModal])

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
  }, [location.pathname, openAddCardModal, searchParams, setSearchParams])

  const handleCreateDashboard = useCallback(() => {
    openAddCardModal('dashboards')
  }, [openAddCardModal])

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
