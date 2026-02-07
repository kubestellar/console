import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, X } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { api, BackendUnavailableError, UnauthenticatedError } from '../../lib/api'
import { useDashboards } from '../../hooks/useDashboards'
import { useClusters } from '../../hooks/useMCP'
import { useCardHistory } from '../../hooks/useCardHistory'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useDashboardContext } from '../../hooks/useDashboardContext'
import { DashboardDropZone } from './DashboardDropZone'
import { useToast } from '../ui/Toast'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import { ROUTES } from '../../config/routes'
import { getDefaultCardsForDashboard } from '../../config/dashboards'
import { AddCardModal } from './AddCardModal'
import { ReplaceCardModal } from './ReplaceCardModal'
import { ConfigureCardModal } from './ConfigureCardModal'
import { CardRecommendations } from './CardRecommendations'
import { safeGetItem, safeSetItem, safeGetJSON, safeSetJSON } from '../../lib/utils/localStorage'
import { MissionSuggestions } from './MissionSuggestions'
import { TemplatesModal } from './TemplatesModal'
import { CreateDashboardModal } from './CreateDashboardModal'
import { FloatingDashboardActions } from './FloatingDashboardActions'
import { DashboardTemplate } from './templates'
import { SortableCard, DragPreviewCard } from './SharedSortableCard'
import type { Card, DashboardData } from './dashboardUtils'
import { useDashboardReset } from '../../hooks/useDashboardReset'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { DashboardHeader } from '../shared/DashboardHeader'
import { StatsOverview, StatBlockValue } from '../ui/StatsOverview'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { useCardPublish, type DeployResultPayload } from '../../lib/cardEvents'
import { useDeployWorkload } from '../../hooks/useWorkloads'
import { DeployConfirmDialog } from '../deploy/DeployConfirmDialog'

// Module-level cache for dashboard data (survives navigation)
interface CachedDashboard {
  dashboard: DashboardData | null
  cards: Card[]
  timestamp: number
}
let dashboardCache: CachedDashboard | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Storage key and default cards for the main dashboard
const DASHBOARD_STORAGE_KEY = 'kubestellar-main-dashboard-cards'

// Default cards loaded from centralized config
const DEFAULT_DASHBOARD_CARDS: Card[] = getDefaultCardsForDashboard('main')


export function Dashboard() {
  // Initialize from cache if available (progressive disclosure - no skeletons on navigation)
  const [dashboard, setDashboard] = useState<DashboardData | null>(() => dashboardCache?.dashboard || null)
  const [isLoading, setIsLoading] = useState(() => !dashboardCache) // Only show loading if no cache
  const location = useLocation()
  const navigate = useNavigate()
  const [isReplaceCardOpen, setIsReplaceCardOpen] = useState(false)
  const [isConfigureCardOpen, setIsConfigureCardOpen] = useState(false)
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
  const [demoBannerDismissed, setDemoBannerDismissed] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [_dragOverDashboard, setDragOverDashboard] = useState<string | null>(null)
  const [isCreateDashboardOpen, setIsCreateDashboardOpen] = useState(false)

  // Get context for modals that can be triggered from sidebar
  const {
    isAddCardModalOpen,
    closeAddCardModal,
    openAddCardModal,
    pendingOpenAddCardModal,
    setPendingOpenAddCardModal,
    isTemplatesModalOpen,
    closeTemplatesModal,
    openTemplatesModal,
    pendingRestoreCard,
    clearPendingRestoreCard,
  } = useDashboardContext()

  // Get all dashboards for cross-dashboard dragging
  const { dashboards, moveCardToDashboard, createDashboard } = useDashboards()
  const { showToast } = useToast()
  const { recordCardRemoved, recordCardAdded, recordCardReplaced, recordCardConfigured } = useCardHistory()

  // Cluster data for refresh functionality and stats - most cards depend on this
  // Use deduplicated clusters to avoid double-counting same server with different contexts
  const { deduplicatedClusters: clusters, isRefreshing: dataRefreshing, lastUpdated, refetch, isLoading: isClustersLoading, error: clustersError } = useClusters()
  const { showIndicator, triggerRefresh } = useRefreshIndicator(refetch)
  const isRefreshing = dataRefreshing || showIndicator
  const isFetching = isClustersLoading || isRefreshing || showIndicator
  const { drillToCluster: _drillToCluster, drillToAllClusters, drillToAllNodes, drillToAllPods } = useDrillDownActions()

  // Reset hook for dashboard
  const { reset, isCustomized } = useDashboardReset({
    storageKey: DASHBOARD_STORAGE_KEY,
    defaultCards: DEFAULT_DASHBOARD_CARDS,
    setCards: setLocalCards,
    cards: localCards,
  })

  // Universal stats for cross-dashboard stat blocks
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

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

  // Stats calculations for StatsOverview
  const healthyClusters = clusters.filter(c => c.healthy).length
  const unhealthyClusters = clusters.filter(c => !c.healthy).length
  const totalPods = clusters.reduce((sum, c) => sum + (c.podCount || 0), 0)
  const totalNodes = clusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0)
  const totalNamespaces = clusters.reduce((sum, c) => sum + (c.namespaces?.length || 0), 0)

  // Dashboard-specific stats value getter
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters':
        return { value: clusters.length, sublabel: 'total clusters', onClick: () => drillToAllClusters(), isClickable: clusters.length > 0 }
      case 'healthy':
        return { value: healthyClusters, sublabel: 'healthy', onClick: () => drillToAllClusters('healthy'), isClickable: healthyClusters > 0 }
      case 'warnings':
        return { value: 0, sublabel: 'warnings', isClickable: false }
      case 'errors':
        return { value: unhealthyClusters, sublabel: 'unhealthy', onClick: () => drillToAllClusters('unhealthy'), isClickable: unhealthyClusters > 0 }
      case 'namespaces':
        return { value: totalNamespaces, sublabel: 'namespaces', onClick: () => navigate(ROUTES.NAMESPACES), isClickable: totalNamespaces > 0 }
      case 'pods':
        return { value: totalPods, sublabel: 'pods', onClick: () => drillToAllPods(), isClickable: totalPods > 0 }
      default:
        return { value: '-' }
    }
  }, [clusters, healthyClusters, unhealthyClusters, totalNodes, totalNamespaces, totalPods, drillToAllClusters, drillToAllNodes, drillToAllPods, navigate])

  // Merged getter: dashboard-specific values first, then universal fallback
  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  // Auto-refresh state (persisted in localStorage)
  const [autoRefresh, setAutoRefresh] = useState(() => {
    const stored = safeGetItem('dashboard-auto-refresh')
    return stored !== null ? stored === 'true' : true // default to true
  })
  const autoRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Persist auto-refresh setting
  useEffect(() => {
    safeSetItem('dashboard-auto-refresh', String(autoRefresh))
  }, [autoRefresh])

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefresh && !isLoading) {
      autoRefreshIntervalRef.current = setInterval(() => {
        refetch()
      }, 30000) // 30 seconds
    }
    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current)
        autoRefreshIntervalRef.current = null
      }
    }
  }, [autoRefresh, isLoading, refetch])

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Need to drag 8px before starting
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
    setIsDragging(true)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event
    if (over && String(over.id).startsWith('dashboard-drop-')) {
      const dashboardId = over.data?.current?.dashboardId
      setDragOverDashboard(dashboardId || null)
    } else {
      setDragOverDashboard(null)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
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
          groupName: groupData.groupName,
        })
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
          setLocalCards((items) => items.filter((item) => item.id !== active.id))
          // Show success toast
          showToast(`Card moved to "${targetDashboardName}"`, 'success')
        } catch (error) {
          console.error('Failed to move card:', error)
          showToast('Failed to move card', 'error')
        }
      }
      return
    }

    // Normal reorder within same dashboard
    if (active.id !== over.id) {
      setLocalCards((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  const handleDragCancel = () => {
    setActiveId(null)
    setIsDragging(false)
    setDragOverDashboard(null)
  }

  // Handle confirmed deploy from confirmation dialog
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
      `Deploying ${workloadName} to ${targetClusters.length} cluster${targetClusters.length !== 1 ? 's' : ''} in "${groupName}"`,
      'success'
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
    } catch (err) {
      console.error('Deploy failed:', err)
      showToast(
        `Deploy failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'error'
      )
    }
  }, [pendingDeploy, publishCardEvent, deployWorkload, showToast])

  const handleCreateDashboard = () => {
    setIsCreateDashboardOpen(true)
  }

  const handleCreateDashboardConfirm = async (name: string, template?: DashboardTemplate) => {
    try {
      const newDashboard = await createDashboard(name)

      // If a template was selected, apply template cards to the new dashboard
      if (template && newDashboard.id) {
        const templateCards = template.cards.map((tc, index) => ({
          id: `template-${Date.now()}-${index}`,
          card_type: tc.card_type,
          config: tc.config || {},
          position: { x: 0, y: 0, w: tc.position.w, h: tc.position.h },
          title: tc.title,
        }))

        // Persist template cards to the new dashboard
        for (const card of templateCards) {
          try {
            await api.post(`/api/dashboards/${newDashboard.id}/cards`, card)
          } catch (error) {
            console.error('Failed to add template card:', error)
            showToast('Failed to add template card', 'error')
          }
        }

        showToast(`Created "${newDashboard.name}" with ${templateCards.length} cards from "${template.name}"`, 'success')
      } else {
        showToast(`Created "${newDashboard.name}"`, 'success')
      }
    } catch (error) {
      console.error('Failed to create dashboard:', error)
      showToast('Failed to create dashboard', 'error')
    }
  }

  // Load dashboard on mount and when navigating back to the page
  useEffect(() => {
    // If we have cached data, do a background refresh (no loading state)
    if (dashboardCache && Date.now() - dashboardCache.timestamp < CACHE_TTL) {
      loadDashboard(true)
    } else {
      loadDashboard(false)
    }
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

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
        title: pendingRestoreCard.cardTitle,
      }
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
      setLocalCards((prev) => [newCard, ...prev])
      // Clear the pending card
      clearPendingRestoreCard()
      // Show success toast
      showToast(`Restored "${pendingRestoreCard.cardTitle || pendingRestoreCard.cardType}" card`, 'success')
    }
  }, [pendingRestoreCard, isLoading, dashboard, recordCardAdded, clearPendingRestoreCard, showToast])

  // Handle pending open add card modal from sidebar navigation
  useEffect(() => {
    if (pendingOpenAddCardModal && !isLoading) {
      openAddCardModal()
      setPendingOpenAddCardModal(false)
    }
  }, [pendingOpenAddCardModal, isLoading, openAddCardModal, setPendingOpenAddCardModal])

  // Helper to check if a card ID is a local-only (not persisted) card
  const isLocalOnlyCard = (cardId: string) => {
    return cardId.startsWith('new-') ||
           cardId.startsWith('template-') ||
           cardId.startsWith('restored-') ||
           cardId.startsWith('ai-') ||
           cardId.startsWith('rec-') ||
           cardId.startsWith('default-') ||
           cardId.startsWith('demo-')
  }

  const loadDashboard = async (isBackground: boolean = false) => {
    if (!isBackground) {
      setIsLoading(true)
    }
    try {
      const { data: dashboards } = await api.get<DashboardData[]>('/api/dashboards')
      if (dashboards && dashboards.length > 0) {
        const defaultDashboard = dashboards.find((d) => d.is_default) || dashboards[0]
        const { data } = await api.get<DashboardData>(`/api/dashboards/${defaultDashboard.id}`)
        const apiCards = data.cards.length > 0 ? data.cards : getDemoCards()
        setDashboard(data)

        // ALWAYS preserve local-only cards (not yet persisted to backend)
        // This prevents losing cards when cache expires or user navigates back
        setLocalCards((prevCards) => {
          // Keep local-only cards that aren't in the API response
          const localOnlyCards = prevCards.filter(c => isLocalOnlyCard(c.id))
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
    } catch (error) {
      // Don't log expected failures (backend unavailable or timeout)
      const isExpectedFailure = error instanceof BackendUnavailableError ||
        error instanceof UnauthenticatedError ||
        (error instanceof Error && error.message.includes('Request timeout'))
      if (!isExpectedFailure) {
        console.error('Failed to load dashboard:', error)
      }
      // Preserve local-only cards even on error, only add demo cards if needed
      setLocalCards((prevCards) => {
        const localOnlyCards = prevCards.filter(c => isLocalOnlyCard(c.id))
        if (localOnlyCards.length > 0) {
          // Keep local cards, don't replace with demo
          return prevCards
        }
        // No local cards, use demo
        const cards = getDemoCards()
        dashboardCache = { dashboard: null, cards, timestamp: Date.now() }
        return cards
      })
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
        title: s.title,
      }
    })
    // Record each card addition in history
    newCards.forEach((card) => {
      recordCardAdded(card.id, card.card_type, card.title, card.config, dashboard?.id, dashboard?.name)
    })
    // Add new cards at the TOP of the dashboard (prepend)
    setLocalCards((prev) => [...newCards, ...prev])

    // Persist to backend if dashboard exists
    if (dashboard?.id) {
      for (const card of newCards) {
        try {
          await api.post(`/api/dashboards/${dashboard.id}/cards`, card)
        } catch (error) {
          console.error('Failed to persist card:', error)
          showToast('Failed to persist card to backend', 'error')
        }
      }
    }
  }

  const handleRemoveCard = useCallback(async (cardId: string) => {
    // Find the card to get its details before removing
    const cardToRemove = localCards.find((c) => c.id === cardId)
    if (cardToRemove) {
      recordCardRemoved(
        cardToRemove.id,
        cardToRemove.card_type,
        cardToRemove.title,
        cardToRemove.config,
        dashboard?.id,
        dashboard?.name
      )
    }
    setLocalCards((prev) => prev.filter((c) => c.id !== cardId))

    // Persist deletion to backend
    if (dashboard?.id && !cardId.startsWith('demo-') && !cardId.startsWith('new-') && !cardId.startsWith('rec-') && !cardId.startsWith('template-') && !cardId.startsWith('restored-') && !cardId.startsWith('ai-')) {
      try {
        await api.delete(`/api/cards/${cardId}`)
      } catch (error) {
        console.error('Failed to delete card from backend:', error)
        showToast('Failed to delete card from backend', 'error')
      }
    }
  }, [localCards, dashboard, recordCardRemoved])

  const handleConfigureCard = useCallback((card: Card) => {
    setSelectedCard(card)
    setIsConfigureCardOpen(true)
  }, [])

  const handleReplaceCard = useCallback((card: Card) => {
    setSelectedCard(card)
    setIsReplaceCardOpen(true)
  }, [])

  const handleWidthChange = useCallback(async (cardId: string, newWidth: number) => {
    setLocalCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? { ...c, position: { ...c.position, w: newWidth } }
          : c
      )
    )

    // Persist width change to backend
    if (dashboard?.id && !cardId.startsWith('demo-') && !cardId.startsWith('new-') && !cardId.startsWith('rec-') && !cardId.startsWith('template-') && !cardId.startsWith('restored-') && !cardId.startsWith('ai-')) {
      try {
        const card = localCards.find((c) => c.id === cardId)
        if (card) {
          await api.put(`/api/cards/${cardId}`, {
            position: { ...card.position, w: newWidth }
          })
        }
      } catch (error) {
        console.error('Failed to update card width:', error)
        showToast('Failed to update card width', 'error')
      }
    }
  }, [dashboard, localCards])

  const handleCardReplaced = useCallback((oldCardId: string, newCardType: string, newTitle?: string, newConfig?: Record<string, unknown>) => {
    // Find the old card to get its previous type
    const oldCard = localCards.find((c) => c.id === oldCardId)
    if (oldCard) {
      recordCardReplaced(
        oldCardId,
        newCardType,
        oldCard.card_type,
        newTitle,
        newConfig,
        dashboard?.id,
        dashboard?.name
      )
    }
    setLocalCards((prev) =>
      prev.map((c) =>
        c.id === oldCardId
          ? { ...c, card_type: newCardType, title: newTitle, config: newConfig || {} }
          : c
      )
    )
    setIsReplaceCardOpen(false)
    setSelectedCard(null)
  }, [localCards, dashboard, recordCardReplaced])

  const handleCardConfigured = useCallback(async (cardId: string, newConfig: Record<string, unknown>, newTitle?: string) => {
    const card = localCards.find((c) => c.id === cardId)
    if (card) {
      recordCardConfigured(
        cardId,
        card.card_type,
        newTitle || card.title,
        newConfig,
        dashboard?.id,
        dashboard?.name
      )
    }
    setLocalCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? { ...c, config: newConfig, title: newTitle || c.title }
          : c
      )
    )
    setIsConfigureCardOpen(false)
    setSelectedCard(null)

    // Persist configuration to backend
    if (dashboard?.id && !cardId.startsWith('demo-') && !cardId.startsWith('new-') && !cardId.startsWith('rec-') && !cardId.startsWith('template-') && !cardId.startsWith('restored-') && !cardId.startsWith('ai-')) {
      try {
        await api.put(`/api/cards/${cardId}`, { config: newConfig, title: newTitle })
      } catch (error) {
        console.error('Failed to update card configuration:', error)
        showToast('Failed to update card configuration', 'error')
      }
    }
  }, [localCards, dashboard, recordCardConfigured])

  const handleAddRecommendedCard = useCallback((cardType: string, config?: Record<string, unknown>, title?: string) => {
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
        title,
      }
      // Record in history
      recordCardAdded(newCard.id, cardType, title, config, dashboard?.id, dashboard?.name)
      return [newCard, ...prev]
    })
  }, [dashboard, recordCardAdded])

  // Create a new card from AI configuration
  const handleCreateCardFromAI = useCallback((cardType: string, config: Record<string, unknown>, title?: string) => {
    const size = getDefaultCardSize(cardType)
    const newCard: Card = {
      id: `ai-${Date.now()}`,
      card_type: cardType,
      config: config || {},
      position: { x: 0, y: 0, ...size },
      title,
    }
    // Record in history
    recordCardAdded(newCard.id, cardType, title, config, dashboard?.id, dashboard?.name)
    // Add at TOP and close the configure modal
    setLocalCards((prev) => [newCard, ...prev])
    setIsConfigureCardOpen(false)
    setSelectedCard(null)
  }, [dashboard, recordCardAdded])

  // Apply template - add all template cards to dashboard
  const handleApplyTemplate = useCallback((template: DashboardTemplate) => {
    const newCards: Card[] = template.cards.map((tc, index) => ({
      id: `template-${Date.now()}-${index}`,
      card_type: tc.card_type,
      config: tc.config || {},
      position: { x: 0, y: 0, w: tc.position.w, h: tc.position.h },
      title: tc.title,
    }))
    // Record each card addition in history
    newCards.forEach((card) => {
      recordCardAdded(card.id, card.card_type, card.title, card.config, dashboard?.id, dashboard?.name)
    })
    // Add template cards at the top
    setLocalCards((prev) => [...newCards, ...prev])
    showToast(`Applied "${template.name}" template with ${newCards.length} cards`, 'success')
  }, [dashboard, recordCardAdded, showToast])

  const currentCardTypes = localCards.map(c => {
    if (c.card_type === 'dynamic_card' && c.config?.dynamicCardId) {
      return `dynamic_card::${c.config.dynamicCardId as string}`
    }
    return c.card_type
  })

  // Check if any cards are using demo data
  const hasDemoDataCards = localCards.some(c => DEMO_DATA_CARDS.has(c.card_type))
  const demoDataCardCount = localCards.filter(c => DEMO_DATA_CARDS.has(c.card_type)).length

  if (isLoading && localCards.length === 0) {
    return (
      <div className="pt-16">
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
    <div data-testid="dashboard-page" className="pt-16">
      {/* Header */}
      <DashboardHeader
        title="Dashboard"
        subtitle="Multi-cluster overview and resource monitoring"
        isFetching={isFetching}
        onRefresh={() => triggerRefresh()}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="dashboard-auto-refresh"
        lastUpdated={lastUpdated}
        error={clustersError}
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

      {/* AI Recommendations */}
      <div data-tour="recommendations">
        <CardRecommendations
          currentCardTypes={currentCardTypes}
          onAddCard={handleAddRecommendedCard}
        />
      </div>

      {/* Mission Suggestions - actionable items like scaling, restarts, security issues */}
      <MissionSuggestions />

      {/* Demo Data Banner */}
      {hasDemoDataCards && !demoBannerDismissed && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <div className="flex-1">
            <span className="text-sm text-yellow-300 font-medium">Demo Data in Use</span>
            <span className="text-sm text-yellow-400/80 ml-2">
              {demoDataCardCount} card{demoDataCardCount !== 1 ? 's are' : ' is'} displaying simulated data.
              Look for the <span className="px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-xs">Demo</span> badge in the card header.
            </span>
          </div>
          <button
            onClick={() => setDemoBannerDismissed(true)}
            className="p-1 rounded hover:bg-yellow-500/20 text-yellow-400/70 hover:text-yellow-400 transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={localCards.map(c => c.id)} strategy={rectSortingStrategy}>
          <div data-testid="dashboard-cards-grid" data-tour="dashboard" className="grid grid-cols-1 md:grid-cols-12 gap-4 auto-rows-[minmax(180px,auto)]">
            {localCards.map((card) => (
              <SortableCard
                key={card.id}
                card={card}
                onConfigure={() => handleConfigureCard(card)}
                onReplace={() => handleReplaceCard(card)}
                onRemove={() => handleRemoveCard(card.id)}
                onWidthChange={(newWidth) => handleWidthChange(card.id, newWidth)}
                isDragging={activeId === card.id}
                isRefreshing={isRefreshing}
                onRefresh={triggerRefresh}
                lastUpdated={lastUpdated}
              />
            ))}
          </div>
        </SortableContext>

        {/* Drag overlay for visual feedback */}
        <DragOverlay>
          {activeId ? (
            <div className="opacity-80 rotate-3 scale-105">
              <DragPreviewCard card={localCards.find(c => c.id === activeId)!} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Floating action buttons for Add Card and Templates */}
      <FloatingDashboardActions
        onAddCard={openAddCardModal}
        onOpenTemplates={openTemplatesModal}
        onReset={reset}
        isCustomized={isCustomized}
      />

      {/* Add Card Modal */}
      <AddCardModal
        isOpen={isAddCardModalOpen}
        onClose={closeAddCardModal}
        onAddCards={handleAddCards}
        existingCardTypes={currentCardTypes}
      />

      {/* Replace Card Modal */}
      <ReplaceCardModal
        isOpen={isReplaceCardOpen}
        card={selectedCard}
        onClose={() => {
          setIsReplaceCardOpen(false)
          setSelectedCard(null)
        }}
        onReplace={handleCardReplaced}
      />

      {/* Configure Card Modal */}
      <ConfigureCardModal
        isOpen={isConfigureCardOpen}
        card={selectedCard}
        onClose={() => {
          setIsConfigureCardOpen(false)
          setSelectedCard(null)
        }}
        onSave={handleCardConfigured}
        onCreateCard={handleCreateCardFromAI}
      />

      {/* Templates Modal */}
      <TemplatesModal
        isOpen={isTemplatesModalOpen}
        onClose={closeTemplatesModal}
        onApplyTemplate={handleApplyTemplate}
      />

      {/* Create Dashboard Modal */}
      <CreateDashboardModal
        isOpen={isCreateDashboardOpen}
        onClose={() => setIsCreateDashboardOpen(false)}
        onCreate={handleCreateDashboardConfirm}
        existingNames={dashboards.map(d => d.name)}
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

function mapVisualizationToCardType(visualization: string, type: string): string {
  // First, check if the type is a valid registered card - if so, use it directly
  if (type && CARD_COMPONENTS[type]) {
    return type
  }

  // Fall back to visualization mapping for AI-generated or unknown types
  const mapping: Record<string, string> = {
    gauge: 'resource_usage',
    timeseries: 'cluster_metrics',
    events: 'event_stream',
    donut: 'app_status',
    bar: 'cluster_metrics',
    status: 'cluster_health',
    table: 'pod_issues',
    sparkline: 'cluster_metrics',
  }
  return mapping[visualization] || type
}

// Get recommended default size for specific card types
function getDefaultCardSize(cardType: string): { w: number; h: number } {
  const cardSizes: Record<string, { w: number; h: number }> = {
    // Full-width cards (12 cols) - hierarchical/complex views
    cluster_resource_tree: { w: 12, h: 6 },

    // Extra-wide cards (8 cols) - tables with many columns
    pvc_status: { w: 8, h: 3 },
    service_status: { w: 8, h: 3 },
    security_issues: { w: 8, h: 4 },
    deployment_issues: { w: 8, h: 3 },
    user_management: { w: 8, h: 4 },
    operator_subscriptions: { w: 8, h: 3 },
    helm_values_diff: { w: 8, h: 4 },
    chart_versions: { w: 8, h: 3 },
    namespace_rbac: { w: 8, h: 4 },
    alert_rules: { w: 8, h: 4 },
    pod_issues: { w: 8, h: 3 },
    top_pods: { w: 8, h: 3 },

    // Wide cards (6 cols) - time series, events, medium tables
    cluster_metrics: { w: 6, h: 3 },
    events_timeline: { w: 6, h: 3 },
    pod_health_trend: { w: 6, h: 3 },
    resource_trend: { w: 6, h: 3 },
    gpu_usage_trend: { w: 6, h: 3 },
    gpu_utilization: { w: 6, h: 3 },
    event_stream: { w: 6, h: 4 },
    helm_history: { w: 6, h: 3 },
    namespace_events: { w: 6, h: 4 },
    gpu_inventory: { w: 6, h: 3 },
    gpu_workloads: { w: 6, h: 3 },
    deployment_status: { w: 6, h: 3 },
    app_status: { w: 6, h: 3 },
    kustomization_status: { w: 6, h: 3 },
    gitops_drift: { w: 6, h: 3 },
    cluster_comparison: { w: 6, h: 3 },
    cluster_costs: { w: 6, h: 3 },
    opencost_overview: { w: 6, h: 3 },
    kubecost_overview: { w: 6, h: 3 },
    overlay_comparison: { w: 6, h: 3 },
    argocd_applications: { w: 6, h: 3 },

    // Standard cards (4 cols) - status, gauges, donut charts
    cluster_health: { w: 4, h: 3 },
    cluster_focus: { w: 4, h: 3 },
    resource_usage: { w: 4, h: 3 },
    resource_capacity: { w: 4, h: 3 },
    gpu_overview: { w: 4, h: 3 },
    gpu_status: { w: 4, h: 3 },
    storage_overview: { w: 4, h: 3 },
    network_overview: { w: 4, h: 3 },
    cluster_network: { w: 4, h: 3 },
    helm_release_status: { w: 4, h: 3 },
    operator_status: { w: 4, h: 3 },
    crd_health: { w: 4, h: 3 },
    namespace_overview: { w: 4, h: 3 },
    namespace_quotas: { w: 4, h: 3 },
    active_alerts: { w: 4, h: 3 },
    argocd_sync_status: { w: 4, h: 3 },
    argocd_health: { w: 4, h: 3 },
    opa_policies: { w: 4, h: 3 },
    kyverno_policies: { w: 4, h: 3 },
    deployment_progress: { w: 4, h: 3 },
    upgrade_status: { w: 4, h: 3 },
    compute_overview: { w: 4, h: 3 },
    console_ai_issues: { w: 4, h: 4 },
    console_ai_kubeconfig_audit: { w: 4, h: 3 },
    console_ai_health_check: { w: 4, h: 3 },
  }
  return cardSizes[cardType] || { w: 4, h: 3 }
}

function getDemoCards(): Card[] {
  return [
    {
      id: 'demo-1',
      card_type: 'cluster_health',
      config: {},
      position: { x: 0, y: 0, w: 4, h: 2 },
    },
    {
      id: 'demo-2',
      card_type: 'resource_usage',
      config: {},
      position: { x: 4, y: 0, w: 4, h: 2 },
    },
    {
      id: 'demo-3',
      card_type: 'event_stream',
      config: {},
      position: { x: 8, y: 0, w: 4, h: 2 },
    },
    {
      id: 'demo-4',
      card_type: 'cluster_metrics',
      config: {},
      position: { x: 0, y: 2, w: 6, h: 2 },
    },
    {
      id: 'demo-5',
      card_type: 'deployment_status',
      config: {},
      position: { x: 6, y: 2, w: 6, h: 2 },
    },
    {
      id: 'demo-6',
      card_type: 'pod_issues',
      config: {},
      position: { x: 0, y: 4, w: 4, h: 2 },
    },
    {
      id: 'demo-7',
      card_type: 'app_status',
      config: {},
      position: { x: 4, y: 4, w: 4, h: 2 },
    },
  ]
}
