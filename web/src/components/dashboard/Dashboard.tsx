import { useState, useEffect, useCallback, memo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { GripVertical, AlertTriangle, X, RefreshCw } from 'lucide-react'
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
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api } from '../../lib/api'
import { useDashboards } from '../../hooks/useDashboards'
import { useClusters } from '../../hooks/useMCP'
import { useCardHistory } from '../../hooks/useCardHistory'
import { useDashboardContext } from '../../hooks/useDashboardContext'
import { DashboardDropZone } from './DashboardDropZone'
import { useToast } from '../ui/Toast'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import { AddCardModal } from './AddCardModal'
import { ReplaceCardModal } from './ReplaceCardModal'
import { ConfigureCardModal } from './ConfigureCardModal'
import { CardRecommendations } from './CardRecommendations'
import { MissionSuggestions } from './MissionSuggestions'
import { TemplatesModal } from './TemplatesModal'
import { FloatingDashboardActions } from './FloatingDashboardActions'
import { DashboardTemplate } from './templates'
import { formatCardTitle } from '../../lib/formatCardTitle'

// Module-level cache for dashboard data (survives navigation)
interface CachedDashboard {
  dashboard: DashboardData | null
  cards: Card[]
  timestamp: number
}
let dashboardCache: CachedDashboard | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

interface Card {
  id: string
  card_type: string
  config: Record<string, unknown>
  position: { x: number; y: number; w: number; h: number }
  last_summary?: string
  title?: string
}

interface DashboardData {
  id: string
  name: string
  is_default?: boolean
  cards: Card[]
}

export function Dashboard() {
  // Initialize from cache if available (progressive disclosure - no skeletons on navigation)
  const [dashboard, setDashboard] = useState<DashboardData | null>(() => dashboardCache?.dashboard || null)
  const [isLoading, setIsLoading] = useState(() => !dashboardCache) // Only show loading if no cache
  const location = useLocation()
  const [isReplaceCardOpen, setIsReplaceCardOpen] = useState(false)
  const [isConfigureCardOpen, setIsConfigureCardOpen] = useState(false)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [localCards, setLocalCards] = useState<Card[]>(() => dashboardCache?.cards || [])
  const [demoBannerDismissed, setDemoBannerDismissed] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [_dragOverDashboard, setDragOverDashboard] = useState<string | null>(null)

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

  // Cluster data for refresh functionality - most cards depend on this
  const { isRefreshing, lastUpdated, refetch } = useClusters()

  // Auto-refresh state (persisted in localStorage)
  const [autoRefresh, setAutoRefresh] = useState(() => {
    const stored = localStorage.getItem('dashboard-auto-refresh')
    return stored !== null ? stored === 'true' : true // default to true
  })
  const autoRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Persist auto-refresh setting
  useEffect(() => {
    localStorage.setItem('dashboard-auto-refresh', String(autoRefresh))
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

  const handleCreateDashboard = async () => {
    try {
      const name = `Dashboard ${dashboards.length + 1}`
      const newDashboard = await createDashboard(name)
      showToast(`Created "${newDashboard.name}"`, 'success')
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

  // Keep cache in sync when cards are modified locally
  useEffect(() => {
    if (dashboardCache && localCards.length > 0) {
      dashboardCache = { ...dashboardCache, cards: localCards, timestamp: Date.now() }
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
      console.error('Failed to load dashboard:', error)
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
      // Debug: log card dimensions when adding
      console.log('[AddCard Debug]', {
        originalType: s.type,
        visualization: s.visualization,
        resolvedType: cardType,
        size,
      })
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
      }
    }
  }, [localCards, dashboard, recordCardConfigured])

  const handleAddRecommendedCard = useCallback((cardType: string, config?: Record<string, unknown>, title?: string) => {
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
    // Add card at the TOP of the dashboard
    setLocalCards((prev) => [newCard, ...prev])
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

  const currentCardTypes = localCards.map(c => c.card_type)

  // Check if any cards are using demo data
  const hasDemoDataCards = localCards.some(c => DEMO_DATA_CARDS.has(c.card_type))
  const demoDataCardCount = localCards.filter(c => DEMO_DATA_CARDS.has(c.card_type)).length

  if (isLoading) {
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
    <div className="pt-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {dashboard?.name || 'Dashboard'}
          </h1>
          <p className="text-muted-foreground">
            Your personalized multi-cluster overview
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Refresh controls */}
          <div className="flex items-center gap-3">
            <label htmlFor="dashboard-auto-refresh" className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground" title="Auto-refresh every 30s">
              <input
                type="checkbox"
                id="dashboard-auto-refresh"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-border bg-secondary w-3.5 h-3.5"
              />
              Auto
            </label>
            <button
              onClick={() => refetch()}
              disabled={isRefreshing}
              className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
              title="Refresh all data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

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
          <div data-tour="dashboard" className="grid grid-cols-12 gap-4 auto-rows-[minmax(180px,auto)]">
            {localCards.map((card) => (
              <SortableCard
                key={card.id}
                card={card}
                onConfigure={() => handleConfigureCard(card)}
                onReplace={() => handleReplaceCard(card)}
                onRemove={() => handleRemoveCard(card.id)}
                onWidthChange={(newWidth) => handleWidthChange(card.id, newWidth)}
                isDragging={activeId === card.id}
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
    </div>
  )
}

// Sortable card component with drag handle - memoized to prevent unnecessary re-renders
interface SortableCardProps {
  card: Card
  onConfigure: () => void
  onReplace: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging: boolean
}

const SortableCard = memo(function SortableCard({ card, onConfigure, onReplace, onRemove, onWidthChange, isDragging }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${card.position.w}`,
    gridRow: `span ${card.position.h}`,
    opacity: isDragging ? 0.5 : 1,
  }

  const CardComponent = CARD_COMPONENTS[card.card_type]

  return (
    <div ref={setNodeRef} style={style} className="h-full">
      <CardWrapper
        cardId={card.id}
        cardType={card.card_type}
        lastSummary={card.last_summary}
        title={card.title}
        isDemoData={DEMO_DATA_CARDS.has(card.card_type)}
        cardWidth={card.position.w}
        onConfigure={onConfigure}
        onReplace={onReplace}
        onRemove={onRemove}
        onWidthChange={onWidthChange}
        dragHandle={
          <button
            {...attributes}
            {...listeners}
            className="p-1 rounded hover:bg-secondary cursor-grab active:cursor-grabbing"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
        }
      >
        {CardComponent ? (
          <CardComponent config={card.config} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Card type: {card.card_type}</p>
          </div>
        )}
      </CardWrapper>
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if card data or drag state changes
  // Ignore callback references as they're stable via useCallback
  return (
    prevProps.card.id === nextProps.card.id &&
    prevProps.card.card_type === nextProps.card.card_type &&
    prevProps.card.position.w === nextProps.card.position.w &&
    prevProps.card.position.h === nextProps.card.position.h &&
    prevProps.card.title === nextProps.card.title &&
    prevProps.card.last_summary === nextProps.card.last_summary &&
    JSON.stringify(prevProps.card.config) === JSON.stringify(nextProps.card.config) &&
    prevProps.isDragging === nextProps.isDragging
  )
})

// Preview card shown during drag
function DragPreviewCard({ card }: { card: Card }) {
  const CardComponent = CARD_COMPONENTS[card.card_type]

  return (
    <div
      className="rounded-lg glass border border-purple-500/50 p-4 shadow-xl"
      style={{
        width: `${card.position.w * 100}px`,
        minWidth: '200px',
        maxWidth: '400px',
      }}
    >
      <div className="text-sm font-medium text-foreground mb-2">
        {formatCardTitle(card.card_type)}
      </div>
      <div className="h-24 flex items-center justify-center text-muted-foreground">
        {CardComponent ? 'Moving card...' : `Card type: ${card.card_type}`}
      </div>
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
  const largeSizeCards: Record<string, { w: number; h: number }> = {
    // Full-width tall cards
    cluster_resource_tree: { w: 12, h: 6 },
    // Wide cards
    event_stream: { w: 6, h: 3 },
    helm_history: { w: 6, h: 3 },
    namespace_events: { w: 6, h: 3 },
    // Medium-tall cards
    gpu_inventory: { w: 6, h: 3 },
    gpu_workloads: { w: 6, h: 3 },
    pvc_status: { w: 8, h: 3 },
    service_status: { w: 8, h: 3 },
  }
  return largeSizeCards[cardType] || { w: 4, h: 3 }
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
