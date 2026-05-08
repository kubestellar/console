import { useState, useEffect, useRef, ReactNode } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { LayoutGrid, ChevronDown, ChevronRight } from 'lucide-react'
import { EmptyState, EmptyStateAction } from '../../components/ui/EmptyState'
import { getIcon } from '../icons'
import {
  DndContext,
  closestCenter,
  pointerWithin,
  rectIntersection,
  DragOverlay,
  type DragEndEvent,
  type CollisionDetection
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy
} from '@dnd-kit/sortable'
import { useDashboard } from './dashboardHooks'
import type { DashboardCard, DashboardCardPlacement } from './types'
import { SortableDashboardCard, DragPreviewCard } from './DashboardComponents'
import { ConfigureCardModal } from '../../components/dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../../components/dashboard/FloatingDashboardActions'
import { DashboardCustomizer } from '../../components/dashboard/customizer/DashboardCustomizer'
import type { CustomizerSection } from '../../components/dashboard/customizer/customizerNav'
import { DashboardTemplate } from '../../components/dashboard/templates'
import { StatsOverview, StatBlockValue } from '../../components/ui/StatsOverview'
import { DashboardStatsType } from '../../components/ui/StatsBlockDefinitions'
import { DashboardHeader } from '../../components/shared/DashboardHeader'
import { DashboardHealthIndicator } from '../../components/dashboard/DashboardHealthIndicator'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { prefetchCardChunks } from '../../components/cards/cardRegistry'
import { useDashboardContextOptional } from '../../hooks/useDashboardContext'

// ============================================================================
// Types
// ============================================================================

export interface DashboardPageProps {
  /** Dashboard title */
  title: string
  /** Dashboard subtitle/description */
  subtitle?: string
  /** Icon name from lucide-react */
  icon: string
  /** localStorage key for cards */
  storageKey: string
  /** Default cards for this dashboard */
  defaultCards: DashboardCardPlacement[]
  /** Dashboard type for stats (matches useUniversalStats dashboardType) */
  statsType: DashboardStatsType
  /** Custom stat value getter for dashboard-specific stats */
  getStatValue?: (blockId: string) => StatBlockValue
  /** Refresh function to call when user triggers refresh */
  onRefresh?: () => void
  /** Whether data is currently loading */
  isLoading?: boolean
  /** Whether data is currently refreshing */
  isRefreshing?: boolean
  /** Last updated timestamp */
  lastUpdated?: Date | null
  /** Whether there is data to display */
  hasData?: boolean
  /** Error message to display (optional) */
  error?: string | null
  /** Dashboard-specific content (rendered below cards) */
  children?: ReactNode
  /** Content rendered between stats and cards section (e.g., tabs, filters) */
  beforeCards?: ReactNode
  /** Extra content to render in header row (e.g., selectors, filters) */
  headerExtra?: ReactNode
  /** Extra content rendered on the right side of the header (e.g., action buttons) */
  rightExtra?: ReactNode
  /** Empty state configuration for no cards. An optional `action` (primary CTA)
   *  and `secondaryAction` surface next-step guidance — see issue 6392. */
  emptyState?: {
    title: string
    description: ReactNode
    action?: EmptyStateAction
    secondaryAction?: EmptyStateAction
  }
  /** Whether this dashboard shows demo/mock data */
  isDemoData?: boolean
  /** Custom drag-end handler (called after card reorder, e.g. for workload drops) */
  onDragEnd?: (event: DragEndEvent) => void
  /**
   * Optional `data-testid` applied to the outer page wrapper. Pages that
   * embed DashboardPage (Clusters, Events, etc.) can pass a route-specific
   * id so cross-browser Playwright specs have a stable mount selector that
   * survives refactors. See issue 9344 — Clusters.spec.ts expects
   * `clusters-page` but the testid was lost when the page migrated to
   * DashboardPage.
   */
  testId?: string
}

// ============================================================================
// DashboardPage Component
// ============================================================================

export function DashboardPage({
  title,
  subtitle,
  icon,
  storageKey,
  defaultCards,
  statsType,
  getStatValue: customGetStatValue,
  onRefresh,
  isLoading = false,
  isRefreshing: externalRefreshing = false,
  lastUpdated,
  hasData = true,
  error,
  children,
  beforeCards,
  headerExtra,
  rightExtra,
  emptyState,
  isDemoData = false,
  onDragEnd: externalDragEnd,
  testId }: DashboardPageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  // Capture the route path at mount time — KeepAlive keeps this component alive
  // across navigations, so we need to know which route we belong to.
  const mountedRouteRef = useRef(location.pathname)
  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const Icon = getIcon(icon)

  // Combine refresh with indicator
  const combinedRefetch = () => {
    onRefresh?.()
  }
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

  const handleRemoveCard = (cardId: string) => {
    removeCard(cardId)
  }

  const handleConfigureCard = (cardId: string) => {
    openConfigureCard(cardId)
  }

  const handleSaveCardConfig = (cardId: string, config: Record<string, unknown>) => {
    configureCard(cardId, config)
    setConfiguringCard(null)
  }

  const handleWidthChange = (cardId: string, newWidth: number) => {
    updateCardWidth(cardId, newWidth)
  }

  const handleHeightChange = (cardId: string, newHeight: number) => {
    updateCardHeight(cardId, newHeight)
  }

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

  // Merged stat value getter: dashboard-specific first, then universal fallback
  const getStatValue = (blockId: string): StatBlockValue => {
    if (customGetStatValue) {
      return createMergedStatValueGetter(customGetStatValue, getUniversalStatValue)(blockId)
    }
    return getUniversalStatValue(blockId) ?? { value: '-', sublabel: '' }
  }

  // Transform card for ConfigureCardModal
  const configureCardData = configuringCard ? {
    id: configuringCard.id,
    card_type: configuringCard.card_type,
    config: configuringCard.config,
    title: configuringCard.title
  } : null

  // Default empty state text
  const emptyTitle = emptyState?.title || `${title} Dashboard`
  const emptyDescription = emptyState?.description || `Add cards to monitor your ${title.toLowerCase()} across clusters.`

  return (
    // Fragment wrapper: the overflow-x-hidden div prevents wide inline content
    // from pushing the page past the viewport (issues 6385, 6387, 6394), but
    // fixed-position children (FAB, customizer, modals) must live OUTSIDE it
    // to avoid clipping when ancestors create a new containing block (issue 8464).
    <>
      <div className="pt-4 min-w-0 max-w-full overflow-x-hidden" data-testid={testId}>
        {/* Header */}
        <DashboardHeader
          title={title}
          subtitle={subtitle}
          icon={<Icon className="w-6 h-6 text-purple-400" />}
          isFetching={isFetching}
          onRefresh={() => triggerRefresh()}
          autoRefresh={autoRefresh}
          onAutoRefreshChange={setAutoRefresh}
          autoRefreshId={`${storageKey}-auto-refresh`}
          lastUpdated={lastUpdated}
          showTimestamp={false}
          error={error}
          afterTitle={<DashboardHealthIndicator />}
          rightExtra={rightExtra}
        />

        {/* Extra header content (e.g., stack selector) */}
        {headerExtra && (
          <div className="flex items-center gap-3 px-6 py-2 border-b border-border/50 bg-card/30">
            {headerExtra}
          </div>
        )}

        {/* Stats Overview */}
        <StatsOverview
          dashboardType={statsType}
          getStatValue={getStatValue}
          hasData={hasData}
          isLoading={isLoading && !hasData}
          lastUpdated={lastUpdated}
          collapsedStorageKey={`${storageKey}-stats-collapsed`}
          isDemoData={isDemoData}
        />

        {/* Content before cards (tabs, filters, etc.) */}
        {beforeCards}

        {/* Dashboard Cards Section */}
        <div className="mb-6">
          {/* Card section header with toggle */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setShowCards(!showCards)}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>{title} Cards ({cards.length})</span>
              {showCards ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>

          {/* Cards grid */}
          {showCards && (
            <>
              {cards.length === 0 ? (
                <EmptyState
                  icon={<Icon className="w-12 h-12 text-muted-foreground" />}
                  title={emptyTitle}
                  description={emptyDescription}
                  action={emptyState?.action ?? {
                    label: 'Add Cards',
                    onClick: () => setShowAddCard(true),
                  }}
                  secondaryAction={emptyState?.secondaryAction}
                  data-testid="dashboard-empty-state"
                />
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={collisionDetection}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2" data-testid="dashboard-cards-grid">
                      {cards.map((card, index) => (
                        <SortableDashboardCard
                          key={card.id}
                          card={card}
                          onConfigure={() => handleConfigureCard(card.id)}
                          onRemove={() => handleRemoveCard(card.id)}
                          onWidthChange={(newWidth) => handleWidthChange(card.id, newWidth)}
                          onHeightChange={(newHeight) => handleHeightChange(card.id, newHeight)}
                          isDragging={activeId === card.id}
                          isRefreshing={isRefreshing}
                          onRefresh={triggerRefresh}
                          lastUpdated={lastUpdated}
                          onInsertBefore={() => { setInsertAtIndex(index); setShowAddCard(true) }}
                          onInsertAfter={() => { setInsertAtIndex(index + 1); setShowAddCard(true) }}
                        />
                      ))}
                    </div>
                  </SortableContext>
                  <DragOverlay dropAnimation={null} zIndex={9999}>
                    {activeId && cards.find(c => c.id === activeId) ? (
                      <DragPreviewCard card={cards.find(c => c.id === activeId)!} />
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
              )}
            </>
          )}
        </div>

        {/* Dashboard-specific content */}
        {children}
      </div>

      {/* Fixed-position elements rendered outside overflow-x-hidden to prevent
        viewport clipping (issue 8464). Parent overflow + ancestor transforms
        can create a new containing block that clips position:fixed children. */}

      {/* Floating action button — opens Dashboard Studio */}
      <FloatingDashboardActions
        onOpenCustomizer={() => setShowAddCard(true)}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      {/* Dashboard Studio — unified customization panel */}
      <DashboardCustomizer
        isOpen={showAddCard}
        onClose={() => { setShowAddCard(false); setAddCardSearch(''); setInsertAtIndex(null); setCustomizerInitialSection(undefined); setWidgetCardType(undefined) }}
        dashboardName={title}
        onAddCards={handleAddCards}
        existingCardTypes={cards.map(c => c.card_type)}
        initialSection={customizerInitialSection}
        initialSearch={addCardSearch}
        initialWidgetCardType={widgetCardType}
        onApplyTemplate={applyTemplate}
        /* onExport not available on generic DashboardPage — only on Dashboard.tsx */
        onReset={reset}
        isCustomized={isCustomized}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      {/* Configure Card Modal */}
      <ConfigureCardModal
        isOpen={!!configuringCard}
        card={configureCardData}
        onClose={() => setConfiguringCard(null)}
        onSave={handleSaveCardConfig}
      />
    </>
  )
}

// Re-export for convenience
export type { DashboardCardPlacement, DashboardCard }
