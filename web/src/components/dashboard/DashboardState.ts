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
import { emitCardAdded, emitCardDragged } from '../../lib/analytics'
import { useDashboards } from '../../hooks/useDashboards'
import { useClusters } from '../../hooks/useMCP'
import { useCardHistory } from '../../hooks/useCardHistory'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useDashboardContext } from '../../hooks/useDashboardContext'
import { useToast } from '../ui/Toast'
import { prefetchCardChunks } from '../cards/cardRegistry'
import { ROUTES } from '../../config/routes'
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
import { type StatBlockValue } from '../ui/StatsOverview'
import { useCardPublish, type DeployResultPayload } from '../../lib/cardEvents'
import { useDeployWorkload } from '../../hooks/useWorkloads'
import { useCardGridNavigation } from '../../hooks/useCardGridNavigation'
import { useModalState } from '../../lib/modals'
import { setAutoRefreshPaused } from '../../lib/cache'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { isClusterHealthy } from '../clusters/utils'
import type { DashboardTemplate } from './templates'
import { dashboardCollisionDetection, POINTER_SENSOR_ACTIVATION_DISTANCE } from './layout'
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
import { makeDashboardStatSelector } from './dashboardState.selectors'
import {
  addCardsAction,
  removeCardAction,
  updateCardWidthAction,
  updateCardHeightAction,
  configureCardAction,
  addRecommendedCardAction,
  applyTemplateAction,
  exportDashboardAction,
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

  const selectedClusterSet = useMemo(() => new Set(globalSelectedClusters), [globalSelectedClusters])
  const filteredClusters = useMemo(() => {
    const all = clusters || []
    if (isAllClustersSelected) return all
    return all.filter(cluster => selectedClusterSet.has(cluster.name))
  }, [clusters, isAllClustersSelected, selectedClusterSet])

  const { clusterCount, healthyClusters, unhealthyClusters, healthyNodes, totalPods, totalNamespaces, totalNodes } = useMemo(() => {
    return filteredClusters.reduce((stats, cluster) => {
      stats.clusterCount += 1
      if (isClusterHealthy(cluster)) { stats.healthyClusters += 1; stats.healthyNodes += cluster.nodeCount || 0 }
      else { stats.unhealthyClusters += 1 }
      stats.totalPods += cluster.podCount || 0
      stats.totalNamespaces += cluster.namespaces?.length || 0
      stats.totalNodes += cluster.nodeCount || 0
      return stats
    }, { clusterCount: 0, healthyClusters: 0, unhealthyClusters: 0, healthyNodes: 0, totalPods: 0, totalNamespaces: 0, totalNodes: 0 })
  }, [filteredClusters])

  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    return makeDashboardStatSelector({ clusterCount, healthyClusters, unhealthyClusters, healthyNodes, totalPods, totalNamespaces, totalNodes, navigate, drillToAllClusters, drillToAllNodes, drillToAllPods })(blockId)
  }, [clusterCount, drillToAllClusters, drillToAllNodes, drillToAllPods, healthyClusters, healthyNodes, navigate, totalNamespaces, totalNodes, totalPods, unhealthyClusters])

  const getStatValue = getDashboardStatValue

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

  const expandTriggersRef = useRef<Map<string, () => void>>(new Map())
  const handleExpandCard = (cardId: string) => { expandTriggersRef.current.get(cardId)?.() }
  const { registerCardRef, handleGridKeyDown } = useCardGridNavigation({ cards: localCards, onExpandCard: handleExpandCard })
  const handleRegisterExpandTrigger = useCallback((cardId: string, expand: () => void) => { expandTriggersRef.current.set(cardId, expand) }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: POINTER_SENSOR_ACTIVATION_DISTANCE } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const collisionDetection = dashboardCollisionDetection

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
    setActiveDragData(event.active.data.current as Record<string, unknown> | null)
    setIsDragging(true)
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event
    if (over && (String(over.id).startsWith('dashboard-drop-') || String(over.id) === 'create-new-dashboard')) {
      setDragOverDashboard(over.data?.current?.dashboardId || null)
      return
    }
    setDragOverDashboard(null)
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null); setActiveDragData(null); setIsDragging(false); setDragOverDashboard(null)
    if (!over) return

    if (active.data.current?.type === 'workload' && String(over.id).startsWith('cluster-group-')) {
      const workloadData = active.data.current.workload as { name: string; namespace: string; sourceCluster: string; currentClusters: string[] }
      const groupData = over.data.current as { groupName: string; clusters: string[] }
      if (groupData?.clusters?.length > 0) {
        setPendingDeploy({ workloadName: workloadData.name, namespace: workloadData.namespace, sourceCluster: workloadData.sourceCluster, targetClusters: groupData.clusters, groupName: groupData.groupName })
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
        } catch (error: unknown) { console.error('Failed to move card:', error); showToast(t('dashboard.toast.moveCardFailed', 'Failed to move card'), 'error') }
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
      } catch (error: unknown) { console.error('Failed to create dashboard and move card:', error); showToast(t('dashboard.toast.createDashboardFailed', 'Failed to create dashboard'), 'error') }
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

  const handleDragCancel = useCallback(() => { setActiveId(null); setActiveDragData(null); setIsDragging(false); setDragOverDashboard(null) }, [])

  const handleConfirmDeploy = useCallback(async () => {
    if (!pendingDeploy) return
    const { workloadName, namespace, sourceCluster, targetClusters, groupName } = pendingDeploy
    setPendingDeploy(null)
    const deployId = `deploy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    publishCardEvent({ type: 'deploy:started', payload: { id: deployId, workload: workloadName, namespace, sourceCluster, targetClusters, groupName, timestamp: Date.now() } })
    showToast(t('dashboard.toast.deploying', 'Deploying {{workload}} to {{count}} cluster(s) in "{{group}}"', { workload: workloadName, count: targetClusters.length, group: groupName }), 'success')
    try {
      await deployWorkload({ workloadName, namespace, sourceCluster, targetClusters }, {
        onSuccess: (result) => {
          const resp = result as unknown as { success?: boolean; message?: string; deployedTo?: string[]; failedClusters?: string[]; dependencies?: { kind: string; name: string; action: string }[]; warnings?: string[] }
          if (resp && typeof resp === 'object') {
            publishCardEvent({ type: 'deploy:result', payload: { id: deployId, success: resp.success ?? true, message: resp.message ?? '', deployedTo: resp.deployedTo, failedClusters: resp.failedClusters, dependencies: resp.dependencies as DeployResultPayload['dependencies'], warnings: resp.warnings } })
          }
        },
      })
    } catch (error: unknown) {
      console.error('Deploy failed:', error)
      showToast(t('dashboard.toast.deployFailed', 'Deploy failed: {{detail}}', { detail: error instanceof Error ? error.message : t('dashboard.toast.unknownError', 'Unknown error') }), 'error')
    }
  }, [deployWorkload, pendingDeploy, publishCardEvent, showToast, t])

  const handleCreateDashboard = useCallback(() => { openAddCardModal('dashboards') }, [openAddCardModal])

  const loadDashboard = useCallback(async (isBackground: boolean = false) => {
    if (!isBackground) setIsLoading(true)
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
          if (localOnlyCards.length > 0) return [...localOnlyCards, ...apiCards]
          return apiCards
        })
        setDashboardCache({ dashboard: data, cards: apiCards, timestamp: Date.now() })
      } else {
        if (isBackground) return
        const cards = getDemoCards()
        setLocalCards(cards)
        setDashboardCache({ dashboard: null, cards, timestamp: Date.now() })
      }
    } catch (error: unknown) {
      const isExpectedFailure = error instanceof BackendUnavailableError || error instanceof UnauthenticatedError ||
        (error instanceof Error && (error.message.includes('Request timeout') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('Load failed') || error.message.includes('HTTP request to an HTTPS server') || error.message.includes('API error:') || error.message.includes('Invalid JSON')))
      if (!isExpectedFailure) { console.error('Failed to load dashboard:', error); if (!isBackground) showToast(t('dashboard.toast.loadFailed', 'Failed to load dashboard'), 'error') }
      if (!isBackground) {
        setLocalCards(prevCards => {
          if (prevCards.length > 0) return prevCards
          const cards = getDemoCards()
          setDashboardCache({ dashboard: null, cards, timestamp: Date.now() })
          return cards
        })
      }
    } finally { setIsLoading(false) }
  }, [showToast, t])

  useEffect(() => {
    const isHomeDashboard = location.pathname === '/' || location.pathname === ''
    if (!isHomeDashboard) return
    const hasCachedOrLocalCards = ((dashboardCache?.cards?.length ?? 0) > 0) || localCards.length > 0
    loadDashboard(hasCachedOrLocalCards)
  }, [location.key, location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (localCards.length > 0) { patchDashboardCache({ cards: localCards, timestamp: Date.now() }); saveDashboardCardsToStorage(DASHBOARD_STORAGE_KEY, localCards) }
  }, [localCards])

  useEffect(() => {
    if (pendingRestoreCard && !isLoading) {
      const size = getDefaultCardSize(pendingRestoreCard.cardType)
      const newCard: Card = { id: `restored-${Date.now()}`, card_type: pendingRestoreCard.cardType, config: pendingRestoreCard.config || {}, position: { x: 0, y: 0, ...size }, title: pendingRestoreCard.cardTitle }
      recordCardAdded(newCard.id, newCard.card_type, newCard.title, newCard.config, dashboard?.id, dashboard?.name)
      snapshot(localCards); setLocalCards(prev => [newCard, ...prev]); clearPendingRestoreCard()
      showToast(t('dashboard.toast.cardRestored', 'Restored "{{name}}" card', { name: pendingRestoreCard.cardTitle || pendingRestoreCard.cardType }), 'success')
    }
  }, [pendingRestoreCard, isLoading, dashboard, recordCardAdded, clearPendingRestoreCard, showToast, localCards, snapshot, t])

  useEffect(() => {
    if (pendingOpenAddCardModal && !isLoading) { openAddCardModal(); setPendingOpenAddCardModal(false) }
  }, [pendingOpenAddCardModal, isLoading, openAddCardModal, setPendingOpenAddCardModal])

  const [addCardSearch, setAddCardSearch] = useState('')
  useEffect(() => {
    if (location.pathname !== '/' && location.pathname !== '') return
    if (searchParams.get('addCard') === 'true') {
      setAddCardSearch(searchParams.get('cardSearch') || '')
      openAddCardModal()
      const cleaned = new URLSearchParams(searchParams)
      cleaned.delete('addCard'); cleaned.delete('cardSearch')
      setSearchParams(cleaned, { replace: true })
    }
  }, [searchParams, setSearchParams, openAddCardModal, location.pathname])

  const commonDeps = { dashboard, localCards, snapshot, setLocalCards, showToast, t, recordCardAdded, recordCardRemoved, recordCardConfigured, closeConfigureCard, setSelectedCard, insertAtIndex, setInsertAtIndex, openAddCardModal, moveCardToDashboard, createDashboard, publishCardEvent, deployWorkload, setPendingDeploy, exportDashboard, startMission, storageKey: DASHBOARD_STORAGE_KEY }

  const handleAddCards = useCallback(async (suggestions: Array<{ type: string; title: string; visualization: string; config: Record<string, unknown> }>) => {
    await addCardsAction(suggestions, commonDeps)
  }, [dashboard, localCards, snapshot, setLocalCards, showToast, t, recordCardAdded, insertAtIndex, setInsertAtIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemoveCard = useCallback(async (cardId: string) => {
    await removeCardAction(cardId, commonDeps)
  }, [dashboard, localCards, snapshot, setLocalCards, recordCardRemoved]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleConfigureCard = useCallback((card: Card) => { setSelectedCard(card); openConfigureCard() }, [openConfigureCard])

  const handleWidthChange = useCallback(async (cardId: string, newWidth: number) => {
    await updateCardWidthAction(cardId, newWidth, commonDeps)
  }, [dashboard, localCards, snapshot, setLocalCards, showToast, t]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleHeightChange = useCallback(async (cardId: string, newHeight: number) => {
    await updateCardHeightAction(cardId, newHeight, commonDeps)
  }, [dashboard, localCards, snapshot, setLocalCards, showToast, t]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCardConfigured = useCallback(async (cardId: string, newConfig: Record<string, unknown>, newTitle?: string) => {
    await configureCardAction(cardId, newConfig, newTitle, commonDeps)
  }, [dashboard, localCards, snapshot, setLocalCards, showToast, t, recordCardConfigured, closeConfigureCard, setSelectedCard]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddRecommendedCard = useCallback((cardType: string, config?: Record<string, unknown>, title?: string) => {
    addRecommendedCardAction(cardType, config, title, commonDeps)
  }, [dashboard, localCards, snapshot, setLocalCards, recordCardAdded]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateCardFromAI = useCallback((cardType: string, config: Record<string, unknown>, title?: string) => {
    const size = getDefaultCardSize(cardType)
    const newCard: Card = { id: `ai-${Date.now()}`, card_type: cardType, config: config || {}, position: { x: 0, y: 0, ...size }, title }
    recordCardAdded(newCard.id, cardType, title, config, dashboard?.id, dashboard?.name)
    snapshot(localCards)
    setLocalCards(prev => [newCard, ...prev])
    closeConfigureCard(); setSelectedCard(null)
  }, [closeConfigureCard, dashboard?.id, dashboard?.name, localCards, recordCardAdded, snapshot])

  const handleApplyTemplate = useCallback((template: DashboardTemplate) => {
    applyTemplateAction(template, commonDeps)
  }, [dashboard, localCards, snapshot, setLocalCards, showToast, t, recordCardAdded]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddSingleCard = useCallback((cardType: string) => {
    const size = getDefaultCardSize(cardType)
    const newCard: Card = { id: `rec-${Date.now()}`, card_type: cardType, config: {}, position: { x: 0, y: 0, ...size } }
    recordCardAdded(newCard.id, cardType, undefined, {}, dashboard?.id, dashboard?.name)
    emitCardAdded(cardType, 'smart_suggestion')
    snapshot(localCards); setLocalCards(prev => [newCard, ...prev])
  }, [dashboard?.id, dashboard?.name, localCards, recordCardAdded, snapshot])

  const handleNudgeAction = useCallback(() => {
    if (activeNudge === 'customize') openAddCardModal()
    else if (activeNudge === 'pwa-install') openWidgetExport()
    actionNudge()
  }, [actionNudge, activeNudge, openAddCardModal, openWidgetExport])

  const currentCardTypes = useMemo(() => localCards.map(card => {
    if (card.card_type === 'dynamic_card' && card.config?.dynamicCardId) return `dynamic_card::${card.config.dynamicCardId as string}`
    return card.card_type
  }), [localCards])

  useEffect(() => { prefetchCardChunks(localCards.map(card => card.card_type)) }, [localCards])

  const handleInsertBefore = useCallback((index: number) => { setInsertAtIndex(index); openAddCardModal() }, [openAddCardModal])
  const handleInsertAfter = useCallback((index: number) => { setInsertAtIndex(index + 1); openAddCardModal() }, [openAddCardModal])
  const handleCloseCustomizer = useCallback(() => { closeAddCardModal(); setAddCardSearch(''); setInsertAtIndex(null) }, [closeAddCardModal])
  const handleCloseConfigureCard = useCallback(() => { closeConfigureCard(); setSelectedCard(null) }, [closeConfigureCard])
  const handleCloseWidgetExport = useCallback(() => { closeWidgetExport() }, [closeWidgetExport])
  const handleSetPendingDeploy = useCallback((deploy: PendingDeploy | null) => { setPendingDeploy(deploy) }, [])
  const handleOpenDashboardCatalog = useCallback(() => { openAddCardModal('dashboards') }, [openAddCardModal])

  const handleRunHealthCheck = useCallback(() => {
    startMission({ title: 'Cluster Health Check', description: 'AI-powered audit of your connected clusters', type: 'custom', initialPrompt: 'Run a comprehensive health check on all my connected clusters. Check for pod issues, resource constraints, and security concerns.' })
  }, [startMission])

  const handleExportDashboard = useMemo(() => {
    if (!dashboard?.id) return undefined
    return async () => { await exportDashboardAction(dashboard.id, dashboard.name, { showToast, t, exportDashboard }) }
  }, [dashboard?.id, dashboard?.name, exportDashboard, showToast, t])

  return {
    activeDragData, activeId, activeNudge, addCardSearch, autoRefresh, canRedo, canUndo,
    clusters, clustersError, collisionDetection, currentCardTypes, dashboard, dashboards,
    dismissNudge, getStatValue,
    handleAddCards, handleAddRecommendedCard, handleAddSingleCard, handleApplyTemplate,
    handleCardConfigured, handleCloseConfigureCard, handleCloseCustomizer, handleCloseWidgetExport,
    handleConfirmDeploy, handleConfigureCard, handleCreateCardFromAI, handleCreateDashboard,
    handleDragCancel, handleDragEnd, handleDragOver, handleDragStart, handleExportDashboard,
    handleGridKeyDown, handleHeightChange, handleInsertAfter, handleInsertBefore,
    handleNudgeAction, handleOpenDashboardCatalog, handleRegisterExpandTrigger,
    handleRemoveCard, handleRunHealthCheck, handleSetPendingDeploy, handleWidthChange,
    isAddCardModalOpen, isClustersLoading, isConfigureCardOpen, isCustomized, isDragging,
    isFetching, isLoading, isRefreshing, isWidgetExportOpen, lastUpdated, localCards,
    navigate, openAddCardModal, openMissionSidebar, pendingDeploy, redo, refetch,
    registerCardRef, reset, selectedCard, sensors, setAutoRefresh, showDragHint,
    studioInitialSection, studioWidgetCardType, triggerRefresh, undo,
  }
}

export type DashboardState = ReturnType<typeof useDashboardState>
