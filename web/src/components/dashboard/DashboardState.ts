/**
 * DashboardState — Main dashboard state management hook.
 * Split from monolithic file into focused modules:
 * - DashboardCardState.ts — Card state management (issue #19014)
 * - DashboardLayoutState.ts — Layout, grid, and navigation state (issue #19014)
 * - DashboardFilterState.ts — Filter state management (issue #19014)
 * - DashboardModalState.ts — Modal state management
 * - DashboardTypes.ts — Type definitions and constants
 * - DashboardDragHandlers.ts — Drag-and-drop event handlers
 * - DashboardCardHandlers.ts — Card CRUD operation handlers
 * - DashboardAutoRefresh.ts — Auto-refresh logic
 * - DashboardLoading.ts — Loading and initialization logic
 * - DashboardStats.ts — Statistics and metrics
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, BackendUnavailableError, UnauthenticatedError } from '../../lib/api'
import { safeRevokeObjectURL } from '../../lib/download'
import { useDashboards } from '../../hooks/useDashboards'
import { useClusters } from '../../hooks/useMCP'
import { useCardHistory } from '../../hooks/useCardHistory'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useDashboardContext } from '../../hooks/useDashboardContext'
import { useToast } from '../ui/Toast'
import { prefetchCardChunks } from '../cards/cardRegistry'
import { ROUTES } from '../../config/routes'
import { getDefaultCardsForDashboard } from '../../config/dashboards'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'
import { loadDashboardCardsFromStorage } from '../../lib/dashboards/dashboardCardStorage'
import { useMissions } from '../../hooks/useMissions'
import type { Card, DashboardData } from './dashboardUtils'
import { isLocalOnlyCard, getDemoCards } from './dashboardUtils'
import { useDashboardReset } from '../../hooks/useDashboardReset'
import { useDashboardUndoRedo } from '../../hooks/useUndoRedo'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { useContextualNudges } from '../../hooks/useContextualNudges'
import { useDashboardScrollTracking } from '../../hooks/useDashboardScrollTracking'
import { type StatBlockValue } from '../ui/StatsOverview'
import { useCardPublish, type DeployResultPayload } from '../../lib/cardEvents'
import { useDeployWorkload } from '../../hooks/useWorkloads'
import { useDashboardCardState } from './DashboardCardState'
import { useDashboardModalState } from './DashboardModalState'
import { useDashboardFilterState } from './DashboardFilterState'
import { useDashboardLayoutState } from './DashboardLayoutState'
import { STORAGE_KEY_MAIN_DASHBOARD_CARDS } from '../../lib/constants/storage'
import { isClusterHealthy } from '../clusters/utils'

// Import types and constants from split modules
import type { CachedDashboard, PendingDeploy } from './DashboardTypes'
import { useDashboardDragHandlers } from './DashboardDragHandlers'
import { useDashboardCardHandlers } from './DashboardCardHandlers'
import { useDashboardAutoRefresh } from './DashboardAutoRefresh'
import { useDashboardLoading } from './DashboardLoading'
import { useDashboardStats } from './DashboardStats'

let dashboardCacheRef: CachedDashboard | null = null

const DASHBOARD_STORAGE_KEY = STORAGE_KEY_MAIN_DASHBOARD_CARDS
const DEFAULT_DASHBOARD_CARDS: Card[] = getDefaultCardsForDashboard('main')

export function useDashboardState() {
  const location = useLocation()
  const navigate = useNavigate()
  const isActiveDashboard = location.pathname === '/' || location.pathname === ''
  const [searchParams, setSearchParams] = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)

  // Card state
  const {
    dashboard,
    setDashboard,
    selectedCard,
    setSelectedCard,
    localCards,
    setLocalCards,
    localCardsRef,
    insertAtIndex,
    setInsertAtIndex,
    handleExpandCard,
    handleRegisterExpandTrigger,
    handleInsertBefore,
    handleInsertAfter,
  } = useDashboardCardState({
    storageKey: DASHBOARD_STORAGE_KEY,
    defaultCards: DEFAULT_DASHBOARD_CARDS,
    dashboardCacheRef,
  })

  // Modal state
  const {
    isConfigureCardOpen,
    openConfigureCard,
    closeConfigureCard,
    handleCloseConfigureCard,
    isWidgetExportOpen,
    openWidgetExport,
    handleCloseWidgetExport,
    addCardSearch,
    setAddCardSearch,
    handleCloseCustomizer: handleCloseCustomizerBase,
  } = useDashboardModalState()

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

  const { snapshot, undo, redo, canUndo, canRedo } = useDashboardUndoRedo<Card>(
    setLocalCards,
    () => localCardsRef.current,
    isActiveDashboard,
  )

  const { activeNudge, showDragHint, dismissNudge, actionNudge, recordVisit } = useContextualNudges(isCustomized)

  useDashboardScrollTracking()

  useEffect(() => { recordVisit() }, [recordVisit])

  // Filter state
  const { filteredClusters } = useDashboardFilterState({ clusters })

  const { getStatValue } = useDashboardStats({
    filteredClusters,
    drillToAllClusters,
    drillToAllPods,
    drillToAllNodes,
  })

  const { autoRefresh, setAutoRefresh } = useDashboardAutoRefresh({ isLoading, refetch })

  const publishCardEvent = useCardPublish()
  const { mutate: deployWorkload } = useDeployWorkload()
  const [pendingDeploy, setPendingDeploy] = useState<PendingDeploy | null>(null)

  const { sensors, registerCardRef, handleGridKeyDown } = useDashboardLayoutState({
    localCards,
    handleExpandCard,
  })

  const {
    activeId,
    activeDragData,
    isDragging,
    dragOverDashboard,
    collisionDetection,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  } = useDashboardDragHandlers({
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
    handleRemoveCard,
    handleConfigureCard,
    handleWidthChange,
    handleHeightChange,
    handleCardConfigured,
    handleAddRecommendedCard,
    handleCreateCardFromAI,
    handleApplyTemplate,
    handleAddSingleCard,
  } = useDashboardCardHandlers({
    dashboard,
    localCards,
    setLocalCards,
    snapshot,
    insertAtIndex,
    setInsertAtIndex,
    selectedCard,
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

  const handleCloseCustomizer = useCallback(() => {
    closeAddCardModal()
    handleCloseCustomizerBase()
    setInsertAtIndex(null)
  }, [closeAddCardModal, handleCloseCustomizerBase, setInsertAtIndex])

  const handleCloseConfigureCardWithCleanup = useCallback(() => {
    handleCloseConfigureCard()
    setSelectedCard(null)
  }, [handleCloseConfigureCard, setSelectedCard])

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
    handleCloseConfigureCard: handleCloseConfigureCardWithCleanup,
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
    handleInsertAfter: handleInsertAfterWithModal,
    handleInsertBefore: handleInsertBeforeWithModal,
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
