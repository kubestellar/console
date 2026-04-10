import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { GripVertical, Trash2, AlertTriangle } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent } from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from 'react-i18next'
import { api, BackendUnavailableError, UnauthenticatedError } from '../../lib/api'
import { useDashboards, Dashboard } from '../../hooks/useDashboards'
import { safeRevokeObjectURL } from '../../lib/download'
import { useClusters } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useSidebarConfig } from '../../hooks/useSidebarConfig'
import { useToast } from '../ui/Toast'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS } from '../cards/cardRegistry'
import { useCardCollapse } from '../../lib/cards/cardHooks'
import { safeGetJSON, safeSetJSON, safeRemoveItem } from '../../lib/utils/localStorage'
import { ROUTES } from '../../config/routes'
import { AddCardModal } from './AddCardModal'
import { ConfigureCardModal } from './ConfigureCardModal'
import { CardRecommendations } from './CardRecommendations'
import { MissionSuggestions } from './MissionSuggestions'
import { TemplatesModal } from './TemplatesModal'
import { FloatingDashboardActions } from './FloatingDashboardActions'
import { POLL_INTERVAL_MS } from '../../lib/constants/network'
import { DashboardTemplate } from './templates'
import { BaseModal } from '../../lib/modals'
import { useModalState } from '../../lib/modals'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { StatsOverview, StatBlockValue } from '../ui/StatsOverview'
import { getClusterHealthState, isClusterUnreachable } from '../clusters/utils'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { DashboardHeader } from '../shared/DashboardHeader'
import { DashboardHealthIndicator } from './DashboardHealthIndicator'
import { useDashboardUndoRedo } from '../../hooks/useUndoRedo'
import { setAutoRefreshPaused } from '../../lib/cache'

interface Card {
  id: string
  card_type: string
  config: Record<string, unknown>
  position: { x: number; y: number; w: number; h: number }
  title?: string
}

/** Clamp small cards in the md–lg range (768–1023px) for readability */
const NARROW_MIN = 768
const NARROW_MAX = 1023

/** Minimum card column span at narrow viewports */
const MIN_NARROW_COLS = 6

/**
 * Minimum pixel height a non-collapsed sortable card cell should occupy.
 * Mirrors the legacy `auto-rows-[minmax(180px,auto)]` baseline so expanded
 * cards keep their previous look now that the grid container uses
 * `auto-rows-min` (which is required so collapsed cards can shrink and let
 * neighbours pack upward — see issue #6072).
 */
const EXPANDED_CARD_MIN_HEIGHT_PX = 180

// Sortable card component
interface SortableCardProps {
  card: Card
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging?: boolean
  isRefreshing?: boolean
  onRefresh?: () => void
  lastUpdated?: Date | null
  onInsertBefore?: () => void
  onInsertAfter?: () => void
}

function SortableCard({ card, onConfigure, onRemove, onWidthChange, isDragging, isRefreshing, onRefresh, lastUpdated, onInsertBefore: _onInsertBefore, onInsertAfter }: SortableCardProps) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: card.id })

  // In the md–lg range (768–1023px), clamp small cards to min 6 cols
  // so we get max 2 cards per row instead of cramped 3-up layout.
  // Below 768px CSS already switches to a 1-column grid, so no clamping needed there.
  const [isNarrowRange, setIsNarrowRange] = useState(() =>
    typeof window !== 'undefined' &&
    window.innerWidth >= NARROW_MIN &&
    window.innerWidth <= NARROW_MAX
  )
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${NARROW_MIN}px) and (max-width: ${NARROW_MAX}px)`)
    const handler = (e: MediaQueryListEvent) => setIsNarrowRange(e.matches)
    if (mq.matches !== isNarrowRange) setIsNarrowRange(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveW = isNarrowRange && (card.position?.w || 4) < MIN_NARROW_COLS ? MIN_NARROW_COLS : (card.position?.w || 4)

  // Read collapse state so the cell can drop its minimum height when the
  // card is collapsed (#6072). Without this, the grid leaves dead space
  // under collapsed cards because every cell is forced to the expanded
  // baseline height.
  const { isCollapsed } = useCardCollapse(card.id)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${effectiveW}`,
    minHeight: isCollapsed ? undefined : `${EXPANDED_CARD_MIN_HEIGHT_PX}px`,
    opacity: isDragging ? 0.5 : 1 }

  const CardComponent = CARD_COMPONENTS[card.card_type]

  if (!CardComponent) {
    return (
      <div ref={setNodeRef} style={style} className="relative group/card">
        {onInsertAfter && (
          <button
            onClick={(e) => { e.stopPropagation(); onInsertAfter() }}
            className="absolute -top-2 -right-2 z-20 opacity-0 group-hover/card:opacity-100 transition-all w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shadow-lg hover:scale-110 ring-2 ring-background"
            aria-label="Add card"
            title="Add card here"
          >
            +
          </button>
        )}
        <CardWrapper
          cardId={card.id}
          cardType={card.card_type}
          title={formatCardTitle(card.card_type)}
          onConfigure={onConfigure}
          onRemove={onRemove}
          onWidthChange={onWidthChange}
          cardWidth={effectiveW}
          isRefreshing={isRefreshing}
          onRefresh={onRefresh}
          lastUpdated={lastUpdated}
        >
          <div className="flex items-center justify-center h-full text-muted-foreground">
            {t('drilldown.unknownViewType')}: {card.card_type}
          </div>
        </CardWrapper>
      </div>
    )
  }

  return (
    <div ref={setNodeRef} style={style} className="relative group/card">
      {onInsertAfter && (
        <button
          onClick={(e) => { e.stopPropagation(); onInsertAfter() }}
          className="absolute -top-2 -right-2 z-20 opacity-0 group-hover/card:opacity-100 transition-all w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shadow-lg hover:scale-110 ring-2 ring-background"
          aria-label="Add card"
          title="Add card here"
        >
          +
        </button>
      )}
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute -left-2 top-1/2 -translate-y-1/2 z-10 p-1 rounded cursor-grab active:cursor-grabbing opacity-0 hover:opacity-100 transition-opacity bg-secondary/80"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>
      <CardWrapper
        cardId={card.id}
        cardType={card.card_type}
        title={card.title || formatCardTitle(card.card_type)}
        onConfigure={onConfigure}
        onRemove={onRemove}
        onWidthChange={onWidthChange}
        cardWidth={effectiveW}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        lastUpdated={lastUpdated}
      >
        <CardComponent config={card.config ?? {}} />
      </CardWrapper>
    </div>
  )
}

// Drag preview card
function DragPreviewCard({ card }: { card: Card }) {
  const CardComponent = CARD_COMPONENTS[card.card_type]

  return (
    <div
      className="rounded-lg border border-purple-500 bg-card shadow-lg"
      style={{ width: `${(card.position?.w || 4) * 80}px`, height: '200px' }}
    >
      <CardWrapper
        cardId={card.id}
        cardType={card.card_type}
        title={card.title || formatCardTitle(card.card_type)}
        cardWidth={card.position?.w || 4}
      >
        {CardComponent ? <CardComponent config={card.config ?? {}} /> : null}
      </CardWrapper>
    </div>
  )
}

export function CustomDashboard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { getDashboardWithCards, deleteDashboard, exportDashboard, importDashboard } = useDashboards()
  const { deduplicatedClusters, isLoading: isClustersLoading } = useClusters()
  const { config, removeItem } = useSidebarConfig()
  const { drillToAllClusters, drillToAllNodes, drillToAllPods } = useDrillDownActions()
  const { t } = useTranslation()

  // Find the sidebar item matching this dashboard to get name/description
  const sidebarItem = [...config.primaryNav, ...config.secondaryNav]
      .find(item => item.href === `/custom-dashboard/${id}`)

  // Stats data from clusters — use the centralised state machine so these
  // counts always match the main cluster grid and sidebar (#5928).
  const healthyClusters = deduplicatedClusters.filter((c) => !isClusterUnreachable(c) && getClusterHealthState(c) === 'healthy').length
  const unhealthyClusters = deduplicatedClusters.filter((c) => !isClusterUnreachable(c) && getClusterHealthState(c) === 'unhealthy').length
  const totalNodes = deduplicatedClusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0)
  const totalPods = deduplicatedClusters.reduce((sum, c) => sum + (c.podCount || 0), 0)

  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters':
        return { value: deduplicatedClusters.length, sublabel: 'total clusters', onClick: () => drillToAllClusters(), isClickable: deduplicatedClusters.length > 0 }
      case 'healthy':
        return { value: healthyClusters, sublabel: 'healthy', onClick: () => drillToAllClusters('healthy'), isClickable: healthyClusters > 0 }
      case 'warnings':
        return { value: 0, sublabel: 'warnings', isClickable: false }
      case 'errors':
        return { value: unhealthyClusters, sublabel: 'unhealthy', onClick: () => drillToAllClusters('unhealthy'), isClickable: unhealthyClusters > 0 }
      case 'namespaces':
        return { value: totalNodes, sublabel: 'nodes', onClick: () => drillToAllNodes(), isClickable: totalNodes > 0 }
      case 'pods':
        return { value: totalPods, sublabel: 'pods', onClick: () => drillToAllPods(), isClickable: totalPods > 0 }
      default:
        return { value: '-' }
    }
  }

  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const getStatValue = createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)

  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dataRefreshing, setIsRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Modal states
  const { isOpen: isAddCardOpen, open: openAddCard, close: closeAddCard } = useModalState()
  const { isOpen: isConfigureCardOpen, open: openConfigureCard, close: closeConfigureCard } = useModalState()
  const { isOpen: isTemplatesOpen, open: openTemplates, close: closeTemplates } = useModalState()
  const { isOpen: isDeleteConfirmOpen, open: openDeleteConfirm, close: closeDeleteConfirm } = useModalState()
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)

  // Inline card insertion
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null)
  const insertAtIndexRef = useRef<number | null>(null)
  insertAtIndexRef.current = insertAtIndex

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null)

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Storage key for this dashboard's cards
  const storageKey = `kubestellar-custom-dashboard-${id}-cards`

  // Request ID tracking — prevents stale async responses from overwriting newer state (#4664)
  const requestIdRef = useRef(0)

  // Undo/redo support
  const cardsRef = useRef(cards)
  cardsRef.current = cards
  const {
    snapshot, undo, redo, canUndo, canRedo } = useDashboardUndoRedo<Card>(
    (restored) => setCards(restored),
    () => cardsRef.current,
  )

  // Load dashboard
  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (!id) return

    // Increment request ID so stale responses are discarded (#4664)
    const thisRequestId = ++requestIdRef.current

    if (isRefresh) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }

    try {
      // First try to load from localStorage for instant display
      if (!isRefresh) {
        const parsed = safeGetJSON<Card[]>(storageKey)
        if (parsed && Array.isArray(parsed) && parsed.length > 0) {
          setCards(parsed)
        }
      }

      // Then fetch from API
      const data = await getDashboardWithCards(id)

      // Discard if a newer request has been issued while we were waiting
      if (thisRequestId !== requestIdRef.current) return

      if (data) {
        setDashboard(data)
        if (data.cards && data.cards.length > 0) {
          const loadedCards = data.cards.map(c => ({
            ...c,
            position: c.position || { x: 0, y: 0, w: 4, h: 2 }
          }))
          setCards(loadedCards)
          safeSetJSON(storageKey, loadedCards)
        }
      }
      setLastUpdated(new Date())
    } catch (error) {
      // Discard errors from stale requests
      if (thisRequestId !== requestIdRef.current) return

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
      }
      if (!isRefresh && !isExpectedFailure) {
        showToast('Failed to load dashboard', 'error')
      }
    } finally {
      // Only clear loading state if this is still the latest request
      if (thisRequestId === requestIdRef.current) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [id, getDashboardWithCards, showToast, storageKey])

  const handleRefreshDashboard = () => loadDashboard(true)
  const { showIndicator, triggerRefresh } = useRefreshIndicator(handleRefreshDashboard, id)
  const isRefreshing = dataRefreshing || showIndicator
  const isFetching = isLoading || isRefreshing || showIndicator

  // Initial load
  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  // Propagate auto-refresh state to global cache layer
  useEffect(() => {
    setAutoRefreshPaused(!autoRefresh)
    return () => { setAutoRefreshPaused(false) }
  }, [autoRefresh])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => loadDashboard(true), POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [autoRefresh, loadDashboard])

  // Persist cards to localStorage when they change
  useEffect(() => {
    if (cards.length > 0) {
      safeSetJSON(storageKey, cards)
    }
  }, [cards, storageKey])

  // Card operations
  const handleAddCards = async (newCards: Array<{ type: string; title: string; config: Record<string, unknown> }>) => {
    const cardsToAdd = newCards.map((c, index) => ({
      id: `card-${Date.now()}-${index}`,
      card_type: c.type,
      title: c.title,
      config: c.config,
      position: { x: 0, y: 0, w: 4, h: 2 }
    }))

    // Add to local state
    snapshot(cardsRef.current)
    const idx = insertAtIndexRef.current
    if (idx !== null) {
      setCards(prev => [...prev.slice(0, idx), ...cardsToAdd, ...prev.slice(idx)])
      setInsertAtIndex(null)
    } else {
      setCards(prev => [...cardsToAdd, ...prev])
    }

    // Persist to backend
    if (id) {
      for (const card of cardsToAdd) {
        try {
          await api.post(`/api/dashboards/${id}/cards`, card)
        } catch (error) {
          console.error('Failed to persist card:', error)
          showToast('Failed to persist card to backend', 'error')
        }
      }
    }

    closeAddCard()
    showToast(`Added ${newCards.length} card${newCards.length > 1 ? 's' : ''}`, 'success')
  }

  const handleRemoveCard = async (cardId: string) => {
    snapshot(cardsRef.current)
    setCards(prev => prev.filter(c => c.id !== cardId))

    if (id) {
      try {
        await api.delete(`/api/dashboards/${id}/cards/${cardId}`)
      } catch (error) {
        console.error('Failed to delete card:', error)
        showToast('Failed to delete card from backend', 'error')
      }
    }
  }

  const handleConfigureCard = (card: Card) => {
    setSelectedCard(card)
    openConfigureCard()
  }

  const handleCardConfigured = async (cardId: string, config: Record<string, unknown>) => {
    snapshot(cardsRef.current)
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, config } : c
    ))
    closeConfigureCard()
    setSelectedCard(null)
  }

  const handleWidthChange = (cardId: string, newWidth: number) => {
    snapshot(cardsRef.current)
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, position: { ...c.position, w: newWidth } } : c
    ))
  }

  const handleApplyTemplate = async (template: DashboardTemplate) => {
    const templateCards = template.cards.map((tc, index) => ({
      id: `template-${Date.now()}-${index}`,
      card_type: tc.card_type,
      title: tc.title,
      config: tc.config || {},
      position: { x: 0, y: 0, w: tc.position?.w || 4, h: tc.position?.h || 2 }
    }))

    snapshot(cardsRef.current)
    setCards(templateCards)
    closeTemplates()

    // Persist to backend
    if (id) {
      for (const card of templateCards) {
        try {
          await api.post(`/api/dashboards/${id}/cards`, card)
        } catch (error) {
          console.error('Failed to persist template card:', error)
          showToast('Failed to persist template card', 'error')
        }
      }
    }

    showToast(`Applied template "${template.name}" with ${templateCards.length} cards`, 'success')
  }

  const handleAddRecommendedCard = (cardType: string, config?: Record<string, unknown>) => {
    handleAddCards([{ type: cardType, title: formatCardTitle(cardType), config: config || {} }])
  }

  const handleReset = () => {
    snapshot(cardsRef.current)
    setCards([])
    safeRemoveItem(storageKey)
    showToast('Dashboard reset to empty', 'info')
  }

  const handleDeleteDashboard = () => {
    if (!id) return

    // Remove sidebar item
    if (sidebarItem) {
      removeItem(sidebarItem.id)
    }

    // Remove local card storage
    safeRemoveItem(storageKey)

    const displayName = sidebarItem?.name || dashboard?.name || 'this dashboard'
    showToast(`Deleted "${displayName}"`, 'success')
    navigate(ROUTES.HOME)

    // Try to delete from backend in the background (may fail offline)
    deleteDashboard(id).catch(() => {
      // Backend deletion is optional — sidebar + localStorage are the source of truth
    })
  }

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (over && active.id !== over.id) {
      snapshot(cardsRef.current)
      setCards(prev => {
        const oldIndex = prev.findIndex(c => c.id === active.id)
        const newIndex = prev.findIndex(c => c.id === over.id)
        if (oldIndex === -1 || newIndex === -1) return prev
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  // Current card types for recommendations
  const currentCardTypes = cards.map(c => {
    if (c.card_type === 'dynamic_card' && c.config?.dynamicCardId) {
      return `dynamic_card::${c.config.dynamicCardId as string}`
    }
    return c.card_type
  })

  // Loading skeleton
  if (isLoading && cards.length === 0) {
    return (
      <div className="pt-16">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-secondary/50 rounded" />
          <div className="h-4 w-96 bg-secondary/30 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="col-span-4 h-48 bg-secondary/30 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-16">
      {/* Header - name from sidebar item takes priority for consistency */}
      <DashboardHeader
        title={sidebarItem?.name || dashboard?.name || 'Custom Dashboard'}
        subtitle={sidebarItem?.description || (cards.length === 0
          ? 'Add cards to start monitoring your clusters'
          : `${cards.length} card${cards.length !== 1 ? 's' : ''}`
        )}
        isFetching={isFetching}
        onRefresh={triggerRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        lastUpdated={lastUpdated}
        afterTitle={<DashboardHealthIndicator />}
        rightExtra={
          <button
            onClick={() => openDeleteConfirm()}
            className="p-2 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
            title={t('dashboard.delete.title')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        }
      />

      {/* Stats Overview */}
      <StatsOverview
        dashboardType="dashboard"
        getStatValue={getStatValue}
        hasData={deduplicatedClusters.length > 0}
        isLoading={isClustersLoading && deduplicatedClusters.length === 0}
        lastUpdated={lastUpdated}
        collapsedStorageKey={`kubestellar-custom-${id}-stats-collapsed`}
      />

      {/* AI Recommendations - always shown to help users add relevant cards */}
      <CardRecommendations
        currentCardTypes={currentCardTypes}
        onAddCard={handleAddRecommendedCard}
      />

      {/* Mission Suggestions */}
      <MissionSuggestions />

      {/* Empty state */}
      {cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-foreground mb-2">{t('dashboard.empty.noCardsYet')}</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            {t('dashboard.empty.emptyDescription')}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => openAddCard()}
              className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
            >
              {t('dashboard.empty.addCards')}
            </button>
            <button
              onClick={() => openTemplates()}
              className="px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
            >
              {t('dashboard.empty.startWithTemplate')}
            </button>
          </div>
        </div>
      ) : (
        /* Card grid with drag and drop */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 auto-rows-min grid-flow-dense">
              {cards.map((card, index) => (
                <SortableCard
                  key={card.id}
                  card={card}
                  onConfigure={() => handleConfigureCard(card)}
                  onRemove={() => handleRemoveCard(card.id)}
                  onWidthChange={(w) => handleWidthChange(card.id, w)}
                  isDragging={activeId === card.id}
                  isRefreshing={isRefreshing}
                  onRefresh={triggerRefresh}
                  lastUpdated={lastUpdated}
                  onInsertBefore={() => { setInsertAtIndex(index); openAddCard() }}
                  onInsertAfter={() => { setInsertAtIndex(index + 1); openAddCard() }}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeId ? (
              (() => {
                const dragCard = cards.find(c => c.id === activeId)
                return dragCard ? (
                  <div className="opacity-80 rotate-3 scale-105">
                    <DragPreviewCard card={dragCard} />
                  </div>
                ) : null
              })()
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Floating action buttons */}
      <FloatingDashboardActions
        onAddCard={() => openAddCard()}
        onOpenTemplates={() => openTemplates()}
        onResetToDefaults={handleReset}
        isCustomized={cards.length > 0}
        onExport={id ? async () => {
          try {
            const data = await exportDashboard(id)
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${(dashboard?.name || 'dashboard').replace(/\s+/g, '-').toLowerCase()}.json`
            a.click()
            safeRevokeObjectURL(url)
            showToast('Dashboard exported', 'success')
          } catch {
            showToast('Failed to export dashboard', 'error')
          }
        } : undefined}
        onImport={async (json) => {
          try {
            await importDashboard(json)
            showToast('Dashboard imported', 'success')
          } catch {
            showToast('Failed to import dashboard', 'error')
          }
        }}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      {/* Add Card Modal */}
      <AddCardModal
        isOpen={isAddCardOpen}
        onClose={() => { closeAddCard(); setInsertAtIndex(null) }}
        onAddCards={handleAddCards}
        existingCardTypes={currentCardTypes}
      />

      {/* Configure Card Modal */}
      <ConfigureCardModal
        isOpen={isConfigureCardOpen}
        card={selectedCard}
        onClose={() => {
          closeConfigureCard()
          setSelectedCard(null)
        }}
        onSave={handleCardConfigured}
      />

      {/* Templates Modal */}
      <TemplatesModal
        isOpen={isTemplatesOpen}
        onClose={closeTemplates}
        onApplyTemplate={handleApplyTemplate}
      />

      {/* Delete Confirmation Modal */}
      <BaseModal isOpen={isDeleteConfirmOpen} onClose={closeDeleteConfirm} size="md">
        <BaseModal.Header
          title={t('dashboard.delete.title')}
          description={t('dashboard.delete.confirm', { name: sidebarItem?.name || dashboard?.name || 'this dashboard' })}
          icon={Trash2}
          onClose={closeDeleteConfirm}
          showBack={false}
        />
        <BaseModal.Content>
          <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-foreground font-medium">{t('dashboard.delete.warning')}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t('dashboard.delete.details')}
              </p>
            </div>
          </div>
        </BaseModal.Content>
        <BaseModal.Footer>
          <button
            onClick={closeDeleteConfirm}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('actions.cancel')}
          </button>
          <button
            onClick={() => {
              closeDeleteConfirm()
              handleDeleteDashboard()
            }}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            {t('dashboard.delete.title')}
          </button>
        </BaseModal.Footer>
      </BaseModal>
    </div>
  )
}
