import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
  type CollisionDetection } from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import { LayoutDashboard } from 'lucide-react'
import { api, BackendUnavailableError, UnauthenticatedError } from '../../lib/api'
import { safeRevokeObjectURL } from '../../lib/download'
import { emitCardAdded, emitCardRemoved, emitCardDragged, emitCardConfigured } from '../../lib/analytics'
import { useDashboards } from '../../hooks/useDashboards'
import { useClusters } from '../../hooks/useMCP'
import { useCardHistory } from '../../hooks/useCardHistory'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useDashboardContext } from '../../hooks/useDashboardContext'
import { DashboardDropZone } from './DashboardDropZone'
import { useToast } from '../ui/Toast'
import { prefetchCardChunks } from '../cards/cardRegistry'
import { ROUTES } from '../../config/routes'
import { getDefaultCardsForDashboard } from '../../config/dashboards'
import { safeLazy } from '../../lib/safeLazy'
import { CardRecommendations } from './CardRecommendations'
import { safeGetItem, safeSetItem, safeGetJSON, safeSetJSON } from '../../lib/utils/localStorage'
import { STORAGE_KEY_DASHBOARD_AUTO_REFRESH } from '../../lib/constants'
import { MissionSuggestions } from './MissionSuggestions'
import { GettingStartedBanner } from './GettingStartedBanner'
import { useMissions } from '../../hooks/useMissions'
import { FloatingDashboardActions } from './FloatingDashboardActions'
const DashboardCustomizer = safeLazy(() => import('./customizer/DashboardCustomizer'), 'DashboardCustomizer')
import { DashboardTemplate } from './templates'
import { SortableCard, DragPreviewCard } from './SharedSortableCard'
import type { Card, DashboardData } from './dashboardUtils'
import { isLocalOnlyCard, mapVisualizationToCardType, getDefaultCardSize, getDemoCards } from './dashboardUtils'
import { useDashboardReset } from '../../hooks/useDashboardReset'
import { useDashboardUndoRedo } from '../../hooks/useUndoRedo'

/** Auto-refresh interval (ms) for dashboard data polling */
const AUTO_REFRESH_INTERVAL_MS = 30_000
import { WelcomeCard } from './WelcomeCard'

import { PostConnectBanner } from './PostConnectBanner'
import { AdopterNudge } from './AdopterNudge'
import { DemoToLocalCTA } from './DemoToLocalCTA'
import { ContextualNudgeBanner } from './ContextualNudgeBanner'
import { DiscoverCardsPlaceholder } from './DiscoverCardsPlaceholder'
import { WidgetExportModal } from '../widgets/WidgetExportModal'
import { getDemoMode } from '../../hooks/useDemoMode'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { useContextualNudges } from '../../hooks/useContextualNudges'
import { useDashboardScrollTracking } from '../../hooks/useDashboardScrollTracking'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'
import { StatsOverview, StatBlockValue } from '../ui/StatsOverview'
import { useCardPublish, type DeployResultPayload } from '../../lib/cardEvents'
import { useDeployWorkload } from '../../hooks/useWorkloads'
import { DeployConfirmDialog } from '../deploy/DeployConfirmDialog'
import { DashboardHealthIndicator } from './DashboardHealthIndicator'
import { useCardGridNavigation } from '../../hooks/useCardGridNavigation'
import { useModalState } from '../../lib/modals'
import { setAutoRefreshPaused } from '../../lib/cache'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { STORAGE_KEY_MAIN_DASHBOARD_CARDS } from '../../lib/constants/storage'

// Lazy-load modal components — only shown on explicit user action,
// so deferring their chunk until first use reduces the initial dashboard bundle.
// AddCardModal replaced by DashboardCustomizer (imported above)
const ConfigureCardModal = safeLazy(() => import('./ConfigureCardModal'), 'ConfigureCardModal')

// Module-level cache for dashboard data (survives navigation)
interface CachedDashboard {
  dashboard: DashboardData | null
  cards: Card[]
  timestamp: number
}
let dashboardCache: CachedDashboard | null = null
// CACHE_TTL removed — dashboard always does background refresh

// Use the shared storage key for the main dashboard
const DASHBOARD_STORAGE_KEY = STORAGE_KEY_MAIN_DASHBOARD_CARDS

// Default cards loaded from centralized config
const DEFAULT_DASHBOARD_CARDS: Card[] = getDefaultCardsForDashboard('main')


export function Dashboard() {
  // Initialize from cache if available (progressive disclosure - no skeletons on navigation)
  const [dashboard, setDashboard] = useState<DashboardData | null>(() => dashboardCache?.dashboard || null)
  const [isLoading, setIsLoading] = useState(false) // Cards are pre-populated from localStorage/defaults — never block
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isOpen: isConfigureCardOpen, open: openConfigureCard, close: closeConfigureCard } = useModalState()
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [localCards, setLocalCards] = useState<Card[]>(() => {
    // Priority: cache > localStorage > default cards
    if (dashboardCache?.cards?.length) return dashboardCache.cards
    const parsed = safeGetJSON<Card[]>(DASHBOARD_STORAGE_KEY)
    if (parsed && Array.isArray(parsed) && parsed.length > 0) {
      return parsed
    }
    return DEFAULT_DASHBOARD_CARDS
  })
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeDragData, setActiveDragData] = useState<Record<string, unknown> | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null)
  const [__dragOverDashboard, setDragOverDashboard] = useState<string | null>(null)
  const { isOpen: isWidgetExportOpen, open: openWidgetExport, close: closeWidgetExport } = useModalState()

  // Get context for modals that can be triggered from sidebar
  const {
    isAddCardModalOpen,
    closeAddCardModal,
    openAddCardModal,
    studioInitialSection,
    studioWidgetCardType,
    pendingOpenAddCardModal,
    setPendingOpenAddCardModal,
    // Templates modal state no longer needed — accessed via DashboardCustomizer
    isTemplatesModalOpen: _isTemplatesModalOpen,
    closeTemplatesModal: _closeTemplatesModal,
    openTemplatesModal: _openTemplatesModal,
    pendingRestoreCard,
    clearPendingRestoreCard } = useDashboardContext()

  // Missions context for Getting Started banner + PostConnectBanner
  const { openSidebar: openMissionSidebar, startMission } = useMissions()

  // Get all dashboards for cross-dashboard dragging
  const { dashboards, moveCardToDashboard, createDashboard, exportDashboard } = useDashboards()
  const { showToast } = useToast()
  const { t } = useTranslation()
  const { recordCardRemoved, recordCardAdded, recordCardConfigured } = useCardHistory()

  // Cluster data for refresh functionality and stats - most cards depend on this
  // Use deduplicated clusters to avoid double-counting same server with different contexts
  const { deduplicatedClusters: clusters, isRefreshing: dataRefreshing, lastUpdated, refetch, isLoading: isClustersLoading, error: clustersError } = useClusters()
  const { showIndicator, triggerRefresh } = useRefreshIndicator(refetch)
  const isRefreshing = dataRefreshing || showIndicator
  const isFetching = isClustersLoading || isRefreshing || showIndicator
  const { drillToAllClusters, drillToAllPods, drillToAllNodes } = useDrillDownActions()

  // Reset hook for dashboard
  const { reset, isCustomized } = useDashboardReset({
    storageKey: DASHBOARD_STORAGE_KEY,
    defaultCards: DEFAULT_DASHBOARD_CARDS,
    setCards: setLocalCards,
    cards: localCards })

  // Undo/redo for card mutations
  const localCardsRef = useRef(localCards)
  localCardsRef.current = localCards
  const { snapshot, undo, redo, canUndo, canRedo } = useDashboardUndoRedo<Card>(
    setLocalCards,
    () => localCardsRef.current,
  )

  // Contextual nudges (replaces traditional tour with in-context hints)
  const { activeNudge, showDragHint, dismissNudge, actionNudge, recordVisit } = useContextualNudges(isCustomized)

  // Track dashboard scroll depth for "almost" engagement analytics
  useDashboardScrollTracking()

  // Record dashboard visit for nudge thresholds
  useEffect(() => { recordVisit() }, [recordVisit])

  // Universal stats for cross-dashboard stat blocks

  // Global cluster filter — stats should reflect only selected clusters
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Inter-card event bus for cross-card deploy
  const publishCardEvent = useCardPublish()
  const { mutate: deployWorkload } = useDeployWorkload()

  // Pending deploy state for confirmation dialog
  const [pendingDeploy, setPendingDeploy] = useState<{
    workloadName: string
    namespace: string
    sourceCluster: string
    targetClusters: string[]
    groupName: string
  } | null>(null)

  const selectedClusterSet = useMemo(() => new Set(globalSelectedClusters), [globalSelectedClusters])

  // Apply global cluster filter before computing stats so the overview
  // reflects only the user's current cluster selection.
  const filteredClusters = useMemo(() => {
    const all = clusters || []
    if (isAllClustersSelected) return all
    return all.filter(c => selectedClusterSet.has(c.name))
  }, [clusters, isAllClustersSelected, selectedClusterSet])

  // Stats calculations for StatsOverview (scoped to filtered clusters)
  const {
    clusterCount,
    healthyClusters,
    unhealthyClusters,
    totalPods,
    totalNamespaces,
    totalNodes,
  } = useMemo(() => {
    return filteredClusters.reduce((stats, cluster) => {
      stats.clusterCount += 1
      if (cluster.healthy) {
        stats.healthyClusters += 1
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
      totalPods: 0,
      totalNamespaces: 0,
      totalNodes: 0,
    })
  }, [filteredClusters])

  // Dashboard-specific stats value getter
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters':
        return { value: clusterCount, sublabel: 'total clusters', onClick: () => drillToAllClusters(), isClickable: clusterCount > 0 }
      case 'healthy':
        return { value: healthyClusters, sublabel: 'healthy', onClick: () => drillToAllClusters('healthy'), isClickable: healthyClusters > 0 }
      case 'warnings':
        return { value: 0, sublabel: 'warnings', isClickable: false }
      case 'errors':
        return { value: unhealthyClusters, sublabel: 'unhealthy', onClick: () => drillToAllClusters('unhealthy'), isClickable: unhealthyClusters > 0 }
      case 'namespaces':
        return { value: totalNamespaces, sublabel: 'namespaces', onClick: () => navigate(ROUTES.NAMESPACES), isClickable: totalNamespaces > 0 }
      case 'nodes':
        return { value: totalNodes, sublabel: 'total nodes', onClick: () => drillToAllNodes(), isClickable: totalNodes > 0 }
      case 'pods':
        return { value: totalPods, sublabel: 'pods', onClick: () => drillToAllPods(), isClickable: totalPods > 0 }
      default:
        return { value: '-' }
    }
  }, [clusterCount, drillToAllClusters, drillToAllNodes, drillToAllPods, healthyClusters, navigate, totalNamespaces, totalNodes, totalPods, unhealthyClusters])

  // Merged getter: dashboard-specific values first, then universal fallback
  const getStatValue = getDashboardStatValue

  // Auto-refresh state (persisted in localStorage)
  const [autoRefresh, setAutoRefresh] = useState(() => {
    const stored = safeGetItem(STORAGE_KEY_DASHBOARD_AUTO_REFRESH)
    return stored !== null ? stored === 'true' : true // default to true
  })
  const autoRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Persist auto-refresh setting and propagate to global cache layer.
  // When the user unchecks "Auto", all card cache intervals are also paused.
  useEffect(() => {
    safeSetItem(STORAGE_KEY_DASHBOARD_AUTO_REFRESH, String(autoRefresh))
    setAutoRefreshPaused(!autoRefresh)
    return () => {
      // Re-enable auto-refresh when the Dashboard unmounts (e.g., navigating away)
      setAutoRefreshPaused(false)
    }
  }, [autoRefresh])

  // Auto-refresh interval. Uses a ref for isLoading to avoid tearing down
  // and recreating the interval every time loading state toggles, which
  // caused layout instability and excessive re-renders (#11460).
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

  // Keyboard navigation for accessibility (Phase 2, issue #1151)
  const expandTriggersRef = useRef<Map<string, () => void>>(new Map())
  const handleExpandCard = (cardId: string) => {
    expandTriggersRef.current.get(cardId)?.()
  }
  const { registerCardRef, handleGridKeyDown } = useCardGridNavigation({
    cards: localCards,
    onExpandCard: handleExpandCard })

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates })
  )

  // Custom collision detection: when dragging a workload, prioritize cluster-group
  // and cluster-drop droppable zones (detected via pointerWithin) over the larger
  // sortable card containers that would otherwise always win with closestCenter.
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const isWorkloadDrag = args.active.data.current?.type === 'workload'
    if (isWorkloadDrag) {
      // For workload drags, prioritize cluster-group drop targets.
      // Use ALL strategies to find cluster-group targets — pointerWithin alone
      // can miss if the droppable is small or partially obscured.
      const allCollisions = [
        ...pointerWithin(args),
        ...rectIntersection(args),
      ]
      // Deduplicate by id
      const seen = new Set<string>()
      const unique = allCollisions.filter(c => {
        const id = String(c.id)
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })
      // Find cluster-group or cluster-drop targets first
      const targetCollision = unique.find(
        (c) => String(c.id).startsWith('cluster-group-') || String(c.id).startsWith('cluster-drop-')
      )
      if (targetCollision) return [targetCollision]
      // Fall back to the card-level cluster-groups drop zone
      const cardTarget = unique.find(
        (c) => String(c.id) === 'cluster-groups-card'
      )
      if (cardTarget) return [cardTarget]
      // Fall back to dashboard-drop zones
      const dashboardCollision = unique.find(
        (c) => String(c.id).startsWith('dashboard-drop-') || String(c.id) === 'create-new-dashboard'
      )
      if (dashboardCollision) return [dashboardCollision]
      // Return empty — don't let sortable card droppables capture workload drags
      return []
    }
    // Normal card reorder — but first check if hovering over a dashboard drop zone
    const centerCollisions = closestCenter(args)
    const pointerCollisions = pointerWithin(args)
    const dashboardDropTarget = pointerCollisions.find(
      (c) => String(c.id).startsWith('dashboard-drop-') || String(c.id) === 'create-new-dashboard'
    )
    if (dashboardDropTarget) return [dashboardDropTarget]
    return centerCollisions
  }, [])

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string
    const data = event.active.data.current as Record<string, unknown> | null
    setActiveId(id)
    setActiveDragData(data)
    setIsDragging(true)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event
    if (over && (String(over.id).startsWith('dashboard-drop-') || String(over.id) === 'create-new-dashboard')) {
      const dashboardId = over.data?.current?.dashboardId
      setDragOverDashboard(dashboardId || null)
    } else {
      setDragOverDashboard(null)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    setActiveDragData(null)
    setIsDragging(false)
    setDragOverDashboard(null)

    if (!over) return

    // Check if a workload was dropped on a cluster group (cross-card deploy)
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
          groupName: groupData.groupName })
      }
      return
    }

    // Check if dropped on another dashboard
    if (String(over.id).startsWith('dashboard-drop-')) {
      const targetDashboardId = over.data?.current?.dashboardId
      const targetDashboardName = over.data?.current?.dashboardName
      if (targetDashboardId && active.id) {
        try {
          await moveCardToDashboard(active.id as string, targetDashboardId)
          // Remove card from local state
          snapshot(localCards)
          setLocalCards((items) => items.filter((item) => item.id !== active.id))
          // Show success toast
          showToast(`Card moved to "${targetDashboardName}"`, 'success')
        } catch (error: unknown) {
          console.error('Failed to move card:', error)
          showToast('Failed to move card', 'error')
        }
      }
      return
    }

    // Check if dropped on "Create New Dashboard" target
    if (String(over.id) === 'create-new-dashboard') {
      try {
        const newDash = await createDashboard('New Dashboard')
        if (newDash?.id && active.id) {
          await moveCardToDashboard(active.id as string, newDash.id)
          snapshot(localCards)
          setLocalCards((items) => items.filter((item) => item.id !== active.id))
          showToast(`Card moved to "${newDash.name || 'New Dashboard'}"`, 'success')
        }
      } catch (error: unknown) {
        console.error('Failed to create dashboard and move card:', error)
        showToast('Failed to create dashboard', 'error')
      }
      return
    }

    // Normal reorder within same dashboard
    if (active.id !== over.id) {
      const draggedCard = localCards.find(c => c.id === active.id)
      if (draggedCard) emitCardDragged(draggedCard.card_type)
      snapshot(localCards)
      setLocalCards((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  const handleDragCancel = () => {
    setActiveId(null)
    setActiveDragData(null)
    setIsDragging(false)
    setDragOverDashboard(null)
  }

  // Handle confirmed deploy from confirmation dialog
  const handleConfirmDeploy = async () => {
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
        timestamp: Date.now() } })

    showToast(
      `Deploying ${workloadName} to ${targetClusters.length} cluster${targetClusters.length !== 1 ? 's' : ''} in "${groupName}"`,
      'success'
    )

    try {
      await deployWorkload({
        workloadName,
        namespace,
        sourceCluster,
        targetClusters }, {
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
                warnings: resp.warnings } })
          }
        } })
    } catch (err: unknown) {
      console.error('Deploy failed:', err)
      showToast(
        `Deploy failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'error'
      )
    }
  }

  const handleCreateDashboard = () => {
    openAddCardModal('dashboards')
  }

  // Load dashboard on mount and when navigating back to the page.
  // Guard: KeepAlive keeps this component mounted even when the user navigates to
  // a different route.  location.key changes on EVERY navigation, not just when
  // returning to "/".  Without the pathname check the API call fires while the
  // dashboard is hidden and any failure shows a confusing toast.
  useEffect(() => {
    const isHomeDashboard = location.pathname === '/' || location.pathname === ''
    if (!isHomeDashboard) return

    // Treat first load with no cached/local cards as a foreground load so that
    // failures can surface a toast. Use warm/background refresh only when we
    // already have something to show from cache or localStorage.
    const hasCachedOrLocalCards =
      ((dashboardCache?.cards?.length ?? 0) > 0) || localCards.length > 0
    const isWarmRefresh = hasCachedOrLocalCards

    loadDashboard(isWarmRefresh)
  }, [location.key, location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep cache and localStorage in sync when cards are modified locally
  useEffect(() => {
    if (localCards.length > 0) {
      // Update memory cache
      if (dashboardCache) {
        dashboardCache = { ...dashboardCache, cards: localCards, timestamp: Date.now() }
      }
      // Persist to localStorage for quick restore on page refresh
      safeSetJSON(DASHBOARD_STORAGE_KEY, localCards)
    }
  }, [localCards])

  // Handle pending restore card from CardHistory
  useEffect(() => {
    if (pendingRestoreCard && !isLoading) {
      const size = getDefaultCardSize(pendingRestoreCard.cardType)
      const newCard: Card = {
        id: `restored-${Date.now()}`,
        card_type: pendingRestoreCard.cardType,
        config: pendingRestoreCard.config || {},
        position: { x: 0, y: 0, ...size },
        title: pendingRestoreCard.cardTitle }
      // Record the card addition in history
      recordCardAdded(
        newCard.id,
        newCard.card_type,
        newCard.title,
        newCard.config,
        dashboard?.id,
        dashboard?.name
      )
      // Add the card at the TOP
      snapshot(localCards)
      setLocalCards((prev) => [newCard, ...prev])
      // Clear the pending card
      clearPendingRestoreCard()
      // Show success toast
      showToast(`Restored "${pendingRestoreCard.cardTitle || pendingRestoreCard.cardType}" card`, 'success')
    }
  }, [pendingRestoreCard, isLoading, dashboard, recordCardAdded, clearPendingRestoreCard, showToast, localCards, snapshot])

  // Handle pending open add card modal from sidebar navigation
  useEffect(() => {
    if (pendingOpenAddCardModal && !isLoading) {
      openAddCardModal()
      setPendingOpenAddCardModal(false)
    }
  }, [pendingOpenAddCardModal, isLoading, openAddCardModal, setPendingOpenAddCardModal])

  // Handle addCard URL param from search — open modal and clear param.
  // Guard with pathname check: KeepAlive keeps hidden dashboards mounted,
  // so all of them see the same searchParams. Only process when active.
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


  const loadDashboard = async (isBackground: boolean = false) => {
    if (!isBackground) {
      setIsLoading(true)
    }
    try {
      const { data: dashboards } = await api.get<DashboardData[]>('/api/dashboards')
      if (dashboards && dashboards.length > 0) {
        const defaultDashboard = dashboards.find((d) => d.is_default) || dashboards[0]
        const { data } = await api.get<DashboardData>(`/api/dashboards/${defaultDashboard.id}`)
        const apiCards = (data.cards && data.cards.length > 0) ? data.cards : getDemoCards()
        setDashboard(data)

        // ALWAYS preserve local-only cards (not yet persisted to backend)
        // This prevents losing cards when cache expires or user navigates back
        setLocalCards((prevCards) => {
          // Keep local-only cards that aren't already in the API response
          const apiCardIds = new Set(apiCards.map(c => c.id))
          const localOnlyCards = prevCards.filter(c => isLocalOnlyCard(c.id) && !apiCardIds.has(c.id))
          // If we have local-only cards, merge them with API cards
          if (localOnlyCards.length > 0) {
            return [...localOnlyCards, ...apiCards]
          }
          // Otherwise just use API cards
          return apiCards
        })
        // Update cache
        dashboardCache = { dashboard: data, cards: apiCards, timestamp: Date.now() }
      } else {
        // No dashboards from API - preserve local cards during background refresh
        if (isBackground) {
          // Keep existing cards during background refresh
          return
        }
        const cards = getDemoCards()
        setLocalCards(cards)
        // Update cache with demo cards
        dashboardCache = { dashboard: null, cards, timestamp: Date.now() }
      }
    } catch (error: unknown) {
      // Don't log expected failures (backend unavailable or timeout)
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
        // Only show toast for foreground loads — background refreshes should
        // fail silently to avoid confusing the user with unexpected errors.
        if (!isBackground) {
          showToast('Failed to load dashboard', 'error')
        }
      }
      // On background refresh failures, preserve whatever the user currently has —
      // a transient API failure should never silently reset a persisted dashboard
      // to demo cards. Only fall back to demo on foreground loads with nothing to show.
      if (isBackground) {
        // Keep current cards as-is — don't touch state
      } else {
        setLocalCards((prevCards) => {
          if (prevCards.length > 0) return prevCards
          // No cards at all, use demo
          const cards = getDemoCards()
          dashboardCache = { dashboard: null, cards, timestamp: Date.now() }
          return cards
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddCards = async (suggestions: Array<{
    type: string
    title: string
    visualization: string
    config: Record<string, unknown>
  }>) => {
    const newCards: Card[] = suggestions.map((s, index) => {
      const cardType = mapVisualizationToCardType(s.visualization, s.type)
      const size = getDefaultCardSize(cardType)
      return {
        id: `new-${Date.now()}-${index}`,
        card_type: cardType,
        config: s.config,
        position: { x: 0, y: 0, ...size },
        title: s.title }
    })
    // Record each card addition in history
    newCards.forEach((card) => {
      recordCardAdded(card.id, card.card_type, card.title, card.config, dashboard?.id, dashboard?.name)
      emitCardAdded(card.card_type, 'add_modal')
    })
    // Insert cards at the specified position, or prepend to top
    snapshot(localCards)
    if (insertAtIndex !== null) {
      setLocalCards((prev) => [...prev.slice(0, insertAtIndex), ...newCards, ...prev.slice(insertAtIndex)])
      setInsertAtIndex(null)
    } else {
      setLocalCards((prev) => [...newCards, ...prev])
    }

    // Persist to backend if dashboard exists
    if (dashboard?.id) {
      for (const card of newCards) {
        try {
          await api.post(`/api/dashboards/${dashboard.id}/cards`, card)
        } catch (error: unknown) {
          console.error('Failed to persist card:', error)
          showToast('Failed to persist card to backend', 'error')
        }
      }
    }
  }

  const handleRemoveCard = async (cardId: string) => {
    // Find the card to get its details before removing
    const cardToRemove = localCards.find((c) => c.id === cardId)
    if (cardToRemove) {
      emitCardRemoved(cardToRemove.card_type)
      recordCardRemoved(
        cardToRemove.id,
        cardToRemove.card_type,
        cardToRemove.title,
        cardToRemove.config,
        dashboard?.id,
        dashboard?.name
      )
    }
    snapshot(localCards)
    setLocalCards((prev) => prev.filter((c) => c.id !== cardId))

    // Persist deletion to backend — attempt for all cards regardless of ID prefix.
    // If the backend returns 404 (card was local-only), that's fine. (#5215)
    if (dashboard?.id) {
      try {
        await api.delete(`/api/cards/${cardId}`)
      } catch (error: unknown) {
        // Card is already removed from UI state above — backend failure is
        // non-critical. Log for debugging but don't alarm the user. (#8564)
        console.debug('Backend card deletion failed (card already removed from UI):', error)
      }
    }
  }

  const handleConfigureCard = (card: Card) => {
    setSelectedCard(card)
    openConfigureCard()
  }

  const handleWidthChange = async (cardId: string, newWidth: number) => {
    snapshot(localCards)
    setLocalCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? { ...c, position: { ...(c.position || { w: 4, h: 2 }), w: newWidth } }
          : c
      )
    )

    // Persist width change to backend
    if (dashboard?.id && !cardId.startsWith('demo-') && !cardId.startsWith('new-') && !cardId.startsWith('rec-') && !cardId.startsWith('template-') && !cardId.startsWith('restored-') && !cardId.startsWith('ai-')) {
      try {
        const card = localCards.find((c) => c.id === cardId)
        if (card) {
          await api.put(`/api/cards/${cardId}`, {
            position: { ...(card.position || { w: 4, h: 2 }), w: newWidth }
          })
        }
      } catch (error: unknown) {
        console.error('Failed to update card width:', error)
        showToast('Failed to update card width', 'error')
      }
    }
  }

  const handleHeightChange = async (cardId: string, newHeight: number) => {
    snapshot(localCards)
    setLocalCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? { ...c, position: { ...(c.position || { x: 0, y: 0, w: 4, h: 2 }), h: newHeight } }
          : c
      )
    )

    // Persist height change to backend
    if (dashboard?.id && !cardId.startsWith('demo-') && !cardId.startsWith('new-') && !cardId.startsWith('rec-') && !cardId.startsWith('template-') && !cardId.startsWith('restored-') && !cardId.startsWith('ai-')) {
      try {
        const card = localCards.find((c) => c.id === cardId)
        if (card) {
          await api.put(`/api/cards/${cardId}`, {
            position: { ...(card.position || { x: 0, y: 0, w: 4, h: 2 }), h: newHeight }
          })
        }
      } catch (error: unknown) {
        console.error('Failed to update card height:', error)
        showToast('Failed to update card height', 'error')
      }
    }
  }

  const handleCardConfigured = async (cardId: string, newConfig: Record<string, unknown>, newTitle?: string) => {
    const card = localCards.find((c) => c.id === cardId)
    if (card) {
      emitCardConfigured(card.card_type)
      recordCardConfigured(
        cardId,
        card.card_type,
        newTitle || card.title,
        newConfig,
        dashboard?.id,
        dashboard?.name
      )
    }
    snapshot(localCards)
    setLocalCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? { ...c, config: newConfig, title: newTitle || c.title }
          : c
      )
    )
    closeConfigureCard()
    setSelectedCard(null)

    // Persist configuration to backend
    if (dashboard?.id && !cardId.startsWith('demo-') && !cardId.startsWith('new-') && !cardId.startsWith('rec-') && !cardId.startsWith('template-') && !cardId.startsWith('restored-') && !cardId.startsWith('ai-')) {
      try {
        await api.put(`/api/cards/${cardId}`, { config: newConfig, title: newTitle })
      } catch (error: unknown) {
        console.error('Failed to update card configuration:', error)
        showToast('Failed to update card configuration', 'error')
      }
    }
  }

  const handleAddRecommendedCard = (cardType: string, config?: Record<string, unknown>, title?: string) => {
    snapshot(localCards)
    setLocalCards((prev) => {
      // Check if a card with the same type already exists
      const existingIndex = prev.findIndex((c) => c.card_type === cardType)
      if (existingIndex !== -1) {
        // Move existing card to first position
        const existingCard = prev[existingIndex]
        const remaining = prev.filter((_, idx) => idx !== existingIndex)
        return [existingCard, ...remaining]
      }
      // No existing card - create new one
      const size = getDefaultCardSize(cardType)
      const newCard: Card = {
        id: `rec-${Date.now()}`,
        card_type: cardType,
        config: config || {},
        position: { x: 0, y: 0, ...size },
        title }
      // Record in history
      recordCardAdded(newCard.id, cardType, title, config, dashboard?.id, dashboard?.name)
      return [newCard, ...prev]
    })
  }

  // Create a new card from AI configuration
  const handleCreateCardFromAI = (cardType: string, config: Record<string, unknown>, title?: string) => {
    const size = getDefaultCardSize(cardType)
    const newCard: Card = {
      id: `ai-${Date.now()}`,
      card_type: cardType,
      config: config || {},
      position: { x: 0, y: 0, ...size },
      title }
    // Record in history
    recordCardAdded(newCard.id, cardType, title, config, dashboard?.id, dashboard?.name)
    // Add at TOP and close the configure modal
    snapshot(localCards)
    setLocalCards((prev) => [newCard, ...prev])
    closeConfigureCard()
    setSelectedCard(null)
  }

  // Apply template - add all template cards to dashboard
  const handleApplyTemplate = (template: DashboardTemplate) => {
    const newCards: Card[] = template.cards.map((tc, index) => ({
      id: `template-${Date.now()}-${index}`,
      card_type: tc.card_type,
      config: tc.config || {},
      position: { x: 0, y: 0, w: tc.position?.w || 4, h: tc.position?.h || 2 },
      title: tc.title }))
    // Record each card addition in history
    newCards.forEach((card) => {
      recordCardAdded(card.id, card.card_type, card.title, card.config, dashboard?.id, dashboard?.name)
    })
    // Add template cards at the top
    snapshot(localCards)
    setLocalCards((prev) => [...newCards, ...prev])
    showToast(`Applied "${template.name}" template with ${newCards.length} cards`, 'success')
  }

  // Handle single card addition from smart suggestions or discover placeholder
  const handleAddSingleCard = (cardType: string) => {
    const size = getDefaultCardSize(cardType)
    const newCard: Card = {
      id: `rec-${Date.now()}`,
      card_type: cardType,
      config: {},
      position: { x: 0, y: 0, ...size } }
    recordCardAdded(newCard.id, cardType, undefined, {}, dashboard?.id, dashboard?.name)
    emitCardAdded(cardType, 'smart_suggestion')
    snapshot(localCards)
    setLocalCards((prev) => [newCard, ...prev])
  }

  // Handle nudge CTA actions
  const handleNudgeAction = () => {
    if (activeNudge === 'customize') {
      openAddCardModal()
    } else if (activeNudge === 'pwa-install') {
      openWidgetExport()
    }
    actionNudge()
  }

  const currentCardTypes = localCards.map(c => {
    if (c.card_type === 'dynamic_card' && c.config?.dynamicCardId) {
      return `dynamic_card::${c.config.dynamicCardId as string}`
    }
    return c.card_type
  })

  // Prefetch card chunks for this dashboard so React.lazy() resolves instantly
  useEffect(() => {
    prefetchCardChunks(localCards.map(c => c.card_type))
  }, [localCards])

  if (isLoading && localCards.length === 0) {
    return (
      <div className="pt-4">
        {/* Header skeleton */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="h-8 w-48 bg-secondary rounded animate-pulse mb-2" />
            <div className="h-4 w-64 bg-secondary/50 rounded animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-10 w-28 bg-secondary rounded animate-pulse" />
            <div className="h-10 w-28 bg-secondary rounded animate-pulse" />
          </div>
        </div>
        {/* Card grid skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="glass rounded-lg p-4">
              {/* Card header */}
              <div className="flex items-center justify-between mb-4">
                <div className="h-5 w-32 bg-secondary rounded animate-pulse" />
                <div className="h-5 w-8 bg-secondary rounded animate-pulse" />
              </div>
              {/* Card content */}
              <div className="space-y-3">
                <div className="h-4 w-full bg-secondary/50 rounded animate-pulse" />
                <div className="h-4 w-3/4 bg-secondary/50 rounded animate-pulse" />
                <div className="h-24 w-full bg-secondary/30 rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-secondary/50 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div data-testid="dashboard-page" className="pt-4">
      {/* Header */}
      <DashboardHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        icon={<LayoutDashboard className="w-6 h-6 text-purple-400" />}
        isFetching={isFetching}
        onRefresh={() => triggerRefresh()}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="dashboard-auto-refresh"
        lastUpdated={lastUpdated}
        error={clustersError}
        afterTitle={<DashboardHealthIndicator />}
        rightExtra={<RotatingTip page="home" />}
      />

      {/* Configurable Stats Overview */}
      <StatsOverview
        dashboardType="dashboard"
        getStatValue={getStatValue}
        hasData={clusters.length > 0}
        isLoading={isClustersLoading && clusters.length === 0}
        lastUpdated={lastUpdated}
        collapsedStorageKey="kubestellar-dashboard-stats-collapsed"
      />

      {/* Getting Started banner — quick-action buttons for first-time users */}
      <GettingStartedBanner
        onBrowseCards={openAddCardModal}
        onTryMission={openMissionSidebar}
        onExploreDashboards={() => openAddCardModal('dashboards')}
      />

      {/* Demo-to-local CTA — shown on console.kubestellar.io for demo visitors */}
      <DemoToLocalCTA />

      {/* Getting Started guide when no clusters are connected */}
      {clusters.length === 0 && !isClustersLoading && !getDemoMode() && (
        <WelcomeCard />
      )}

      {/* Post-connect activation — bridges the 90% drop between agent connect and first mission */}
      <PostConnectBanner
        onRunHealthCheck={() => {
          startMission({
            title: 'Cluster Health Check',
            description: 'AI-powered audit of your connected clusters',
            type: 'custom',
            initialPrompt: 'Run a comprehensive health check on all my connected clusters. Check for pod issues, resource constraints, and security concerns.' })
        }}
        onExploreClusters={() => navigate(ROUTES.CLUSTERS)}
        onSetupAlerts={() => navigate(ROUTES.ALERTS)}
      />

      {/* Adopter nudge — shows after 3+ days of usage to encourage ADOPTERS.MD contribution */}
      <AdopterNudge />

      {/* Contextual nudge banner — replaces traditional tour */}
      {activeNudge && activeNudge !== 'drag-hint' && (
        <ContextualNudgeBanner
          nudgeType={activeNudge}
          onAction={handleNudgeAction}
          onDismiss={dismissNudge}
        />
      )}

      {/* AI Recommendations & Actions - both rows wrapped for tour highlight */}
      <div data-tour="recommendations">
        <CardRecommendations
          currentCardTypes={currentCardTypes}
          onAddCard={handleAddRecommendedCard}
        />
        {/* Mission Suggestions - actionable items like scaling, restarts, security issues */}
        <MissionSuggestions />
      </div>

      {/* Dashboard drop zone (shows when dragging) */}
      <DashboardDropZone
        dashboards={dashboards}
        currentDashboardId={dashboard?.id}
        isDragging={isDragging}
        onCreateDashboard={handleCreateDashboard}
      />

      {/* Card grid with drag and drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={localCards.map(c => c.id)} strategy={rectSortingStrategy}>
          {/*
            auto-rows-min lets rows shrink to their content so a collapsed
            card (which only shows its header) does not leave a tall empty
            grid row behind it (#6072). Each non-collapsed sortable card
            sets its own `minHeight` inline to preserve the legacy expanded
            baseline height. `grid-flow-dense` allows later cards to
            backfill empty cells freed up by collapsed neighbours.
          */}
          <div
            data-testid="dashboard-cards-grid"
            data-tour="dashboard"
            role="grid"
            aria-label="Dashboard cards"
            className={`grid grid-cols-1 md:grid-cols-12 gap-2 auto-rows-min grid-flow-dense min-w-0 ${showDragHint ? 'animate-shimmy' : ''}`}
          >
            {localCards.map((card, index) => (
              <SortableCard
                key={card.id}
                card={card}
                onConfigure={() => handleConfigureCard(card)}
                onRemove={() => handleRemoveCard(card.id)}
                onWidthChange={(newWidth) => handleWidthChange(card.id, newWidth)}
                onHeightChange={(newHeight) => handleHeightChange(card.id, newHeight)}
                isDragging={activeId === card.id}
                isRefreshing={isRefreshing}
                onRefresh={triggerRefresh}
                lastUpdated={lastUpdated}
                onKeyDown={handleGridKeyDown}
                registerRef={(el) => registerCardRef(card.id, el)}
                registerExpandTrigger={(expand) => { expandTriggersRef.current.set(card.id, expand) }}
                onInsertBefore={() => { setInsertAtIndex(index); openAddCardModal() }}
                onInsertAfter={() => { setInsertAtIndex(index + 1); openAddCardModal() }}
                isWorkloadDragActive={activeDragData?.type === 'workload'}
              />
            ))}

            {/* Discover Cards Placeholder — intentional empty slot with card carousel */}
            {!isCustomized && (
              <DiscoverCardsPlaceholder
                existingCardTypes={currentCardTypes}
                onAddCard={handleAddSingleCard}
                onOpenCatalog={openAddCardModal}
              />
            )}
          </div>
        </SortableContext>

        {/* Drag overlay for visual feedback */}
        <DragOverlay dropAnimation={null} zIndex={9999}>
          {activeId && localCards.find(c => c.id === activeId) ? (
            <div className="opacity-80 rotate-3 scale-105">
              <DragPreviewCard card={localCards.find(c => c.id === activeId)!} />
            </div>
          ) : activeId && activeDragData?.type === 'workload' ? (
            <div className="bg-blue-100 dark:bg-blue-900/60 shadow-xl rounded-lg px-4 py-2 border-2 border-blue-400 max-w-xs pointer-events-none">
              <div className="text-sm font-medium text-blue-900 dark:text-blue-100 truncate">
                {(activeDragData.workload as { name?: string })?.name || 'Workload'}
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                Drop on a cluster group to deploy
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Floating action button — opens Dashboard Studio */}
      <FloatingDashboardActions
        onOpenCustomizer={openAddCardModal}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      {/* Dashboard Studio — unified customization panel (lazy-loaded) */}
      <Suspense fallback={null}>
        <DashboardCustomizer
          isOpen={isAddCardModalOpen}
          onClose={() => { closeAddCardModal(); setAddCardSearch(''); setInsertAtIndex(null) }}
          dashboardName={dashboard?.name || 'Main Dashboard'}
          onAddCards={handleAddCards}
          existingCardTypes={currentCardTypes}
          initialSection={studioInitialSection}
          initialWidgetCardType={studioWidgetCardType}
          initialSearch={addCardSearch}
          onApplyTemplate={handleApplyTemplate}
          onExport={dashboard?.id ? async () => {
            try {
              const data = await exportDashboard(dashboard.id)
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `${(dashboard.name || 'dashboard').replace(/\s+/g, '-').toLowerCase()}.json`
              a.click()
              safeRevokeObjectURL(url)
              showToast('Dashboard exported', 'success')
            } catch {
              showToast('Failed to export dashboard', 'error')
            }
          } : undefined}
          onReset={() => reset('replace')}
          isCustomized={isCustomized}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
      </Suspense>

      {/* Configure Card Modal */}
      <Suspense fallback={null}>
        <ConfigureCardModal
          isOpen={isConfigureCardOpen}
          card={selectedCard}
          onClose={() => {
            closeConfigureCard()
            setSelectedCard(null)
          }}
          onSave={handleCardConfigured}
          onCreateCard={handleCreateCardFromAI}
        />
      </Suspense>

      {/* Templates are now accessed via Dashboard Studio */}

      {/* Widget Export Modal — opened from nudge banner */}
      <WidgetExportModal
        isOpen={isWidgetExportOpen}
        onClose={closeWidgetExport}
      />

      {/* Pre-deploy Confirmation Dialog */}
      <DeployConfirmDialog
        isOpen={pendingDeploy !== null}
        onClose={() => setPendingDeploy(null)}
        onConfirm={handleConfirmDeploy}
        workloadName={pendingDeploy?.workloadName ?? ''}
        namespace={pendingDeploy?.namespace ?? ''}
        sourceCluster={pendingDeploy?.sourceCluster ?? ''}
        targetClusters={pendingDeploy?.targetClusters ?? []}
        groupName={pendingDeploy?.groupName}
      />
    </div>
  )
}

