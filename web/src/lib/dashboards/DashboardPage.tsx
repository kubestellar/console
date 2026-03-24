import { useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { Plus, LayoutGrid, ChevronDown, ChevronRight } from 'lucide-react'
import { getIcon } from '../icons'
import {
  DndContext,
  closestCenter,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { useDashboard } from './dashboardHooks'
import type { DashboardCard, DashboardCardPlacement } from './types'
import { SortableDashboardCard, DragPreviewCard } from './DashboardComponents'
import { AddCardModal } from '../../components/dashboard/AddCardModal'
import { TemplatesModal } from '../../components/dashboard/TemplatesModal'
import { ConfigureCardModal } from '../../components/dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../../components/dashboard/FloatingDashboardActions'
import { DashboardTemplate } from '../../components/dashboard/templates'
import { StatsOverview, StatBlockValue } from '../../components/ui/StatsOverview'
import { DashboardStatsType } from '../../components/ui/StatsBlockDefinitions'
import { DashboardHeader } from '../../components/shared/DashboardHeader'
import { DashboardHealthIndicator } from '../../components/dashboard/DashboardHealthIndicator'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { prefetchCardChunks } from '../../components/cards/cardRegistry'

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
  /** Empty state configuration for no cards */
  emptyState?: {
    title: string
    description: string
  }
  /** Whether this dashboard shows demo/mock data */
  isDemoData?: boolean
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
  emptyState,
  isDemoData = false,
}: DashboardPageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  // Capture the route path at mount time — KeepAlive keeps this component alive
  // across navigations, so we need to know which route we belong to.
  const mountedRouteRef = useRef(location.pathname)
  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const Icon = getIcon(icon)

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
    reset,
    isCustomized,
    showAddCard,
    setShowAddCard,
    showTemplates,
    setShowTemplates,
    configuringCard,
    setConfiguringCard,
    openConfigureCard,
    showCards,
    setShowCards,
    expandCards,
    dnd: { sensors, activeId, handleDragStart, handleDragEnd },
    autoRefresh,
    setAutoRefresh,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useDashboard({
    storageKey,
    defaultCards,
    onRefresh,
  })

  // Prefetch React.lazy() chunks for cards on this dashboard
  useEffect(() => {
    prefetchCardChunks(cards.map(c => c.card_type))
  }, [cards])

  // Combined refreshing state
  const isRefreshing = externalRefreshing || showIndicator
  const isFetching = isLoading || isRefreshing

  // Handle addCard URL param - open modal and clear param.
  // Guard with mounted route: KeepAlive keeps hidden dashboards mounted,
  // so all of them see the same searchParams. Only process when active.
  const [addCardSearch, setAddCardSearch] = useState('')
  useEffect(() => {
    if (location.pathname !== mountedRouteRef.current) return
    if (searchParams.get('addCard') === 'true') {
      setAddCardSearch(searchParams.get('cardSearch') || '')
      setShowAddCard(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, setShowAddCard, location.pathname])

  // Inline card insertion
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null)
  const insertAtIndexRef = useRef<number | null>(null)
  insertAtIndexRef.current = insertAtIndex

  // Card handlers
  const handleAddCards = useCallback((newCards: Array<{ type: string; title: string; config: Record<string, unknown> }>) => {
    const idx = insertAtIndexRef.current
    if (idx !== null) {
      const cardsToAdd = newCards.map(c => ({
        id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        card_type: c.type,
        config: c.config || {},
        title: c.title,
      }))
      setCards(prev => [...prev.slice(0, idx), ...cardsToAdd, ...prev.slice(idx)])
      setInsertAtIndex(null)
    } else {
      addCards(newCards)
    }
    expandCards()
    setShowAddCard(false)
  }, [addCards, setCards, expandCards, setShowAddCard])

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

  const applyTemplate = useCallback((template: DashboardTemplate) => {
    const newCards = template.cards.map((card, i) => ({
      id: `card-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
      card_type: card.card_type,
      config: card.config || {},
      title: card.title,
    }))
    setCards(newCards)
    expandCards()
    setShowTemplates(false)
  }, [setCards, expandCards, setShowTemplates])

  // Merged stat value getter: dashboard-specific first, then universal fallback
  const getStatValue = useCallback(
    (blockId: string): StatBlockValue => {
      if (customGetStatValue) {
        return createMergedStatValueGetter(customGetStatValue, getUniversalStatValue)(blockId)
      }
      return getUniversalStatValue(blockId) ?? { value: '-', sublabel: '' }
    },
    [customGetStatValue, getUniversalStatValue]
  )

  // Transform card for ConfigureCardModal
  const configureCardData = configuringCard ? {
    id: configuringCard.id,
    card_type: configuringCard.card_type,
    config: configuringCard.config,
    title: configuringCard.title,
  } : null

  // Default empty state text
  const emptyTitle = emptyState?.title || `${title} Dashboard`
  const emptyDescription = emptyState?.description || `Add cards to monitor your ${title.toLowerCase()} across clusters.`

  return (
    <div className="pt-16">
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
        error={error}
        afterTitle={<DashboardHealthIndicator />}
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
              <div className="glass p-8 rounded-lg border-2 border-dashed border-border/50 text-center">
                <div className="flex justify-center mb-4">
                  <Icon className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">{emptyTitle}</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                  {emptyDescription}
                </p>
                <button
                  onClick={() => setShowAddCard(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Cards
                </button>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                    {cards.map((card, index) => (
                      <SortableDashboardCard
                        key={card.id}
                        card={card}
                        onConfigure={() => handleConfigureCard(card.id)}
                        onRemove={() => handleRemoveCard(card.id)}
                        onWidthChange={(newWidth) => handleWidthChange(card.id, newWidth)}
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
                <DragOverlay>
                  {activeId ? (
                    <DragPreviewCard card={cards.find(c => c.id === activeId)!} />
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </>
        )}
      </div>

      {/* Dashboard-specific content */}
      {children}

      {/* Floating action buttons */}
      <FloatingDashboardActions
        onAddCard={() => setShowAddCard(true)}
        onOpenTemplates={() => setShowTemplates(true)}
        onResetToDefaults={reset}
        isCustomized={isCustomized}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      {/* Add Card Modal */}
      <AddCardModal
        isOpen={showAddCard}
        onClose={() => { setShowAddCard(false); setAddCardSearch(''); setInsertAtIndex(null) }}
        onAddCards={handleAddCards}
        existingCardTypes={cards.map(c => c.card_type)}
        initialSearch={addCardSearch}
      />

      {/* Templates Modal */}
      <TemplatesModal
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        onApplyTemplate={applyTemplate}
      />

      {/* Configure Card Modal */}
      <ConfigureCardModal
        isOpen={!!configuringCard}
        card={configureCardData}
        onClose={() => setConfiguringCard(null)}
        onSave={handleSaveCardConfig}
      />
    </div>
  )
}

// Re-export for convenience
export type { DashboardCardPlacement, DashboardCard }
