/**
 * State, data-fetching, and interaction logic for DashboardPage.
 *
 * Split out of DashboardPage.tsx (issues 22978 / 23018) so the component
 * itself can stay a thin container that wires this hook's state into the
 * presentational sections (header, stats, cards grid, modals).
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import {
  pointerWithin,
  rectIntersection,
  closestCenter,
  type DragEndEvent,
  type CollisionDetection
} from '@dnd-kit/core'
import { useDashboard } from '../dashboardHooks'
import type { DashboardCardPlacement } from '../types'
import type { CustomizerSection } from '../../../components/dashboard/customizer/customizerNav'
import { DashboardTemplate } from '../../../components/dashboard/templates'
import { StatBlockValue } from '../../../components/ui/StatsOverview'
import { EmptyStateAction } from '../../../components/ui/EmptyState'
import { useUniversalStats, createMergedStatValueGetter } from '../../../hooks/useUniversalStats'
import { useRefreshIndicator } from '../../../hooks/useRefreshIndicator'
import { prefetchCardChunks } from '../../../components/cards/cardRegistry'
import { useDashboardContextOptional } from '../../../hooks/useDashboardContext'
import { useDashboardCardGridLayout } from './useDashboardCardGridLayout'

const DEFAULT_STAT_BLOCK_VALUE: StatBlockValue = { value: '-', sublabel: '' }
const DEFAULT_EMPTY_STATE_ACTION_PROPS = { label: 'Add Cards' }

export interface UseDashboardPageStateParams {
  storageKey: string
  defaultCards: DashboardCardPlacement[]
  customGetStatValue?: (blockId: string) => StatBlockValue
  onRefresh?: () => void
  isLoading: boolean
  externalRefreshing: boolean
  hasData: boolean
  error?: string | null
  routeState?: 'loaded' | 'partial' | 'unavailable' | 'empty'
  onDragEnd?: (event: DragEndEvent) => void
}

/**
 * Encapsulates all card/modal/virtualization/layout state for DashboardPage.
 * See DashboardPageProps for the meaning of each parameter.
 */
export function useDashboardPageState({
  storageKey,
  defaultCards,
  customGetStatValue,
  onRefresh,
  isLoading,
  externalRefreshing,
  hasData,
  error,
  routeState,
  onDragEnd: externalDragEnd }: UseDashboardPageStateParams) {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  // Capture the route path at mount time — KeepAlive keeps this component alive
  // across navigations, so we need to know which route we belong to.
  const mountedRouteRef = useRef(location.pathname)
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  // Combine refresh with indicator
  const combinedRefetch = useCallback(() => {
    onRefresh?.()
  }, [onRefresh])
  const { showIndicator, triggerRefresh } = useRefreshIndicator(combinedRefetch)

  // Use the shared dashboard hook for cards, DnD, modals, auto-refresh
  const {
    cards,
    setCards,
    addCards,
    removeCard,
    configureCard,
    updateCardWidth,
    updateCardHeight,
    reset,
    isCustomized,
    showAddCard,
    setShowAddCard,
    // showTemplates and setShowTemplates are no longer used directly —
    // templates are accessed via the unified DashboardCustomizer
    showTemplates: _showTemplates,
    setShowTemplates: _setShowTemplates,
    configuringCard,
    setConfiguringCard,
    openConfigureCard,
    showCards,
    setShowCards,
    expandCards,
    dnd: { sensors, activeId, activeDragData, handleDragStart, handleDragEnd: baseDragEnd },
    autoRefresh,
    setAutoRefresh,
    undo,
    redo,
    canUndo,
    canRedo } = useDashboard({
      storageKey,
      defaultCards,
      isActive: location.pathname === mountedRouteRef.current,
      onRefresh
    })

  // Workload-aware collision detection: when dragging a workload, prefer
  // cluster-group droppables over the larger sortable card containers.
  const collisionDetection: CollisionDetection = (args) => {
    const isWorkloadDrag = args.active.data.current?.type === 'workload'
    if (isWorkloadDrag) {
      const allCollisions = [...pointerWithin(args), ...rectIntersection(args)]
      const seen = new Set<string>()
      const unique = allCollisions.filter(c => {
        const id = String(c.id)
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })
      // Prefer specific cluster-group targets
      const target = unique.find(
        (c) => String(c.id).startsWith('cluster-group-') || String(c.id).startsWith('cluster-drop-')
      )
      if (target) return [target]
      // Fall back to the card-level drop zone
      const cardTarget = unique.find(
        (c) => String(c.id) === 'cluster-groups-card'
      )
      if (cardTarget) return [cardTarget]
      return []
    }
    return closestCenter(args)
  }

  // Combined drag-end: card reorder + external handler (e.g. workload deploy)
  const handleDragEnd = (event: DragEndEvent) => {
    baseDragEnd(event)
    externalDragEnd?.(event)
  }

  // Prefetch React.lazy() chunks for cards on this dashboard
  useEffect(() => {
    prefetchCardChunks(cards.map(c => c.card_type))
  }, [cards])

  // Combined refreshing state
  const isRefreshing = externalRefreshing || showIndicator
  const isFetching = isLoading || isRefreshing
  const liveRouteState = routeState ?? (
    isLoading && !hasData
      ? 'partial'
      : error && !hasData
        ? 'unavailable'
        : hasData
          ? 'loaded'
          : 'empty'
  )

  // Bridge: when CardWrapper's "Export Widget" calls studioContext.openAddCardModal(),
  // it sets isAddCardModalOpen in the DashboardContext. Sync that into our local
  // showAddCard state so the DashboardCustomizer opens.
  const dashCtx = useDashboardContextOptional()
  const [widgetCardType, setWidgetCardType] = useState<string | undefined>(undefined)
  useEffect(() => {
    // Guard: only process on the active dashboard — KeepAlive keeps inactive
    // dashboards mounted, so without this check we'd open the customizer on
    // a hidden dashboard when the context fires.
    if (location.pathname !== mountedRouteRef.current) return
    if (dashCtx?.isAddCardModalOpen) {
      setShowAddCard(true)
      if (dashCtx.studioInitialSection) {
        setCustomizerInitialSection(dashCtx.studioInitialSection)
      }
      if (dashCtx.studioWidgetCardType) {
        setWidgetCardType(dashCtx.studioWidgetCardType)
      }
      // Reset context state so it doesn't re-trigger
      dashCtx.closeAddCardModal()
    }
  }, [dashCtx?.isAddCardModalOpen, dashCtx?.studioInitialSection, dashCtx?.studioWidgetCardType, location.pathname])

  // Handle addCard and customizeSidebar URL params via the DashboardCustomizer.
  // Guard with mounted route: KeepAlive keeps hidden dashboards mounted,
  // so all of them see the same searchParams. Only process when active.
  const [addCardSearch, setAddCardSearch] = useState('')
  // Determine initial section for DashboardCustomizer based on URL params
  const [customizerInitialSection, setCustomizerInitialSection] = useState<CustomizerSection | undefined>(undefined)
  useEffect(() => {
    if (location.pathname !== mountedRouteRef.current) return
    if (searchParams.get('addCard') === 'true') {
      setAddCardSearch(searchParams.get('cardSearch') || '')
      setCustomizerInitialSection('cards')
      setShowAddCard(true)
      setSearchParams({}, { replace: true })
    } else if (searchParams.get('customizeSidebar') === 'true') {
      setCustomizerInitialSection('dashboards')
      setShowAddCard(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, setShowAddCard, location.pathname])

  // Inline card insertion
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null)
  const insertAtIndexRef = useRef<number | null>(null)
  insertAtIndexRef.current = insertAtIndex

  const {
    dashboardRef,
    dashboardWidth,
    cardsGridRef,
    useCompactGrid,
    loadMoreRef,
    shouldVirtualizeCards,
    visibleCards } = useDashboardCardGridLayout(cards, showCards)

  // Card handlers
  const handleAddCards = (newCards: Array<{ type: string; title: string; config: Record<string, unknown> }>) => {
    const idx = insertAtIndexRef.current
    if (idx !== null) {
      const cardsToAdd = newCards.map(c => ({
        id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        card_type: c.type,
        config: c.config || {},
        title: c.title
      }))
      setCards(prev => [...prev.slice(0, idx), ...cardsToAdd, ...prev.slice(idx)])
      setInsertAtIndex(null)
    } else {
      addCards(newCards)
    }
    expandCards()
    setShowAddCard(false)
    setWidgetCardType(undefined)
    setCustomizerInitialSection(undefined)
  }

  const handleRemoveCard = useCallback((cardId: string) => {
    removeCard(cardId)
  }, [removeCard])

  const handleConfigureCard = useCallback((cardId: string) => {
    openConfigureCard(cardId)
  }, [openConfigureCard])

  const handleSaveCardConfig = useCallback((cardId: string, config: Record<string, unknown>) => {
    configureCard(cardId, config)
    setConfiguringCard(null)
  }, [configureCard, setConfiguringCard])

  const handleWidthChange = useCallback((cardId: string, newWidth: number) => {
    updateCardWidth(cardId, newWidth)
  }, [updateCardWidth])

  const handleHeightChange = useCallback((cardId: string, newHeight: number) => {
    updateCardHeight(cardId, newHeight)
  }, [updateCardHeight])

  const applyTemplate = (template: DashboardTemplate) => {
    const newCards = template.cards.map((card, i) => ({
      id: `card-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
      card_type: card.card_type,
      config: card.config || {},
      title: card.title
    }))
    setCards(newCards)
    expandCards()
    // Close DashboardCustomizer after applying template
    setShowAddCard(false)
    setWidgetCardType(undefined)
    setCustomizerInitialSection(undefined)
  }

  const mergedStatValueGetter = useMemo(
    () => (customGetStatValue ? createMergedStatValueGetter(customGetStatValue, getUniversalStatValue) : null),
    [customGetStatValue, getUniversalStatValue],
  )
  // Merged stat value getter: dashboard-specific first, then universal fallback
  const getStatValue = useCallback((blockId: string): StatBlockValue => {
    if (mergedStatValueGetter) {
      return mergedStatValueGetter(blockId)
    }
    return getUniversalStatValue(blockId) ?? DEFAULT_STAT_BLOCK_VALUE
  }, [mergedStatValueGetter, getUniversalStatValue])

  const handleOpenCustomizer = useCallback(() => {
    setShowAddCard(true)
  }, [setShowAddCard])
  const defaultEmptyStateAction = useMemo<EmptyStateAction>(() => ({
    ...DEFAULT_EMPTY_STATE_ACTION_PROPS,
    onClick: handleOpenCustomizer,
  }), [handleOpenCustomizer])
  const handleRefresh = useCallback(() => {
    triggerRefresh()
  }, [triggerRefresh])

  // Transform card for ConfigureCardModal
  const configureCardData = configuringCard ? {
    id: configuringCard.id,
    card_type: configuringCard.card_type,
    config: configuringCard.config,
    title: configuringCard.title
  } : null

  return {
    // Layout / refs
    dashboardRef,
    dashboardWidth,
    cardsGridRef,
    useCompactGrid,
    loadMoreRef,

    // Status
    isFetching,
    isRefreshing,
    liveRouteState,

    // Cards
    cards,
    visibleCards,
    shouldVirtualizeCards,
    showCards,
    setShowCards,
    getStatValue,

    // DnD
    sensors,
    collisionDetection,
    handleDragStart,
    handleDragEnd,
    activeId,
    activeDragData,

    // Card handlers
    handleRemoveCard,
    handleConfigureCard,
    handleSaveCardConfig,
    handleWidthChange,
    handleHeightChange,
    handleAddCards,
    applyTemplate,

    // Insert-at-index
    setInsertAtIndex,

    // Add-card / customizer modal
    showAddCard,
    setShowAddCard,
    addCardSearch,
    setAddCardSearch,
    customizerInitialSection,
    setCustomizerInitialSection,
    widgetCardType,
    setWidgetCardType,
    handleOpenCustomizer,
    defaultEmptyStateAction,

    // Configure-card modal
    configuringCard,
    setConfiguringCard,
    configureCardData,

    // Auto-refresh / undo-redo / reset
    autoRefresh,
    setAutoRefresh,
    handleRefresh,
    triggerRefresh,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
    isCustomized,
  }
}
