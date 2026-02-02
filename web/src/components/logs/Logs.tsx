import { useEffect, useCallback, memo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ScrollText, GripVertical, ChevronDown, ChevronRight, Plus, LayoutGrid } from 'lucide-react'
import { useMobile } from '../../hooks/useMobile'
import {
  DndContext,
  closestCenter,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useClusters, useEvents, useWarningEvents } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { UnifiedStatsSection, EVENTS_STATS_CONFIG } from '../../lib/unified/stats'
import type { StatBlockValue } from '../ui/StatsOverview'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { ConfigureCardModal } from '../dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { DashboardTemplate } from '../dashboard/templates'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { useDashboard, DashboardCard } from '../../lib/dashboards'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { DashboardHeader } from '../shared/DashboardHeader'

const LOGS_CARDS_KEY = 'kubestellar-logs-cards'

// Default cards for the logs dashboard
const DEFAULT_LOGS_CARDS = [
  { type: 'event_stream', title: 'Event Stream', position: { w: 12, h: 4 } },
  { type: 'namespace_events', title: 'Namespace Events', position: { w: 6, h: 3 } },
  { type: 'events_timeline', title: 'Events Timeline', position: { w: 6, h: 3 } },
]

// Sortable card component with drag handle
interface SortableLogsCardProps {
  card: DashboardCard
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging: boolean
  isRefreshing?: boolean
  onRefresh?: () => void
  lastUpdated?: Date | null
}

const SortableLogsCard = memo(function SortableLogsCard({
  card,
  onConfigure,
  onRemove,
  onWidthChange,
  isDragging,
  isRefreshing,
  onRefresh,
  lastUpdated,
}: SortableLogsCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card.id })

  const { isMobile } = useMobile()
  const cardWidth = card.position?.w || 6
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Only apply multi-column span on desktop; mobile uses single column
    gridColumn: isMobile ? 'span 1' : `span ${cardWidth}`,
    opacity: isDragging ? 0.5 : 1,
  }

  const CardComponent = CARD_COMPONENTS[card.card_type]
  if (!CardComponent) {
    return null
  }

  return (
    <div ref={setNodeRef} style={style}>
      <CardWrapper
        cardId={card.id}
        cardType={card.card_type}
        title={formatCardTitle(card.card_type)}
        cardWidth={cardWidth}
        onConfigure={onConfigure}
        onRemove={onRemove}
        onWidthChange={onWidthChange}
        isDemoData={DEMO_DATA_CARDS.has(card.card_type)}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        lastUpdated={lastUpdated}
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
        <CardComponent config={card.config} />
      </CardWrapper>
    </div>
  )
})

// Drag preview for overlay
function LogsDragPreviewCard({ card }: { card: DashboardCard }) {
  const cardWidth = card.position?.w || 6
  return (
    <div
      className="glass rounded-lg p-4 shadow-xl"
      style={{ width: `${(cardWidth / 12) * 100}%`, minWidth: 200, maxWidth: 400 }}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium truncate">
          {formatCardTitle(card.card_type)}
        </span>
      </div>
    </div>
  )
}

export function Logs() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch } = useClusters()
  const { showIndicator, triggerRefresh } = useRefreshIndicator(refetch)
  const isRefreshing = dataRefreshing || showIndicator
  const isFetching = isLoading || isRefreshing || showIndicator
  const { events } = useEvents()
  const { events: warningEvents } = useWarningEvents()
  const { drillToEvents: _drillToEvents, drillToAllEvents, drillToAllClusters } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()

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
  } = useDashboard({
    storageKey: LOGS_CARDS_KEY,
    defaultCards: DEFAULT_LOGS_CARDS,
    onRefresh: refetch,
  })

  // Handle addCard URL param
  useEffect(() => {
    if (searchParams.get('addCard') === 'true') {
      setShowAddCard(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, setShowAddCard])

  const handleAddCards = useCallback((newCards: Array<{ type: string; title: string; config: Record<string, unknown> }>) => {
    addCards(newCards)
    expandCards()
    setShowAddCard(false)
  }, [addCards, expandCards, setShowAddCard])

  const handleRemoveCard = useCallback((cardId: string) => {
    removeCard(cardId)
  }, [removeCard])

  const handleConfigureCard = useCallback((cardId: string) => {
    openConfigureCard(cardId, cards)
  }, [openConfigureCard, cards])

  const handleSaveCardConfig = useCallback((cardId: string, config: Record<string, unknown>) => {
    configureCard(cardId, config)
    setConfiguringCard(null)
  }, [configureCard, setConfiguringCard])

  const handleWidthChange = useCallback((cardId: string, newWidth: number) => {
    updateCardWidth(cardId, newWidth)
  }, [updateCardWidth])

  const applyTemplate = useCallback((template: DashboardTemplate) => {
    const newCards = template.cards.map(card => ({
      type: card.card_type,
      title: card.title,
      config: card.config || {},
    }))
    setCards(newCards.map((card, i) => ({
      id: `card-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
      card_type: card.type,
      config: card.config,
      title: card.title,
    })))
    expandCards()
    setShowTemplates(false)
  }, [setCards, expandCards, setShowTemplates])

  // Filter clusters based on global selection
  const filteredClusters = clusters.filter(c =>
    isAllClustersSelected || globalSelectedClusters.includes(c.name)
  )
  const reachableClusters = filteredClusters.filter(c => c.reachable !== false)

  // Filter events by selected clusters
  const filteredEvents = events.filter(e =>
    isAllClustersSelected || globalSelectedClusters.includes(e.cluster || '')
  )
  const filteredWarningEvents = warningEvents.filter(e =>
    isAllClustersSelected || globalSelectedClusters.includes(e.cluster || '')
  )

  // Calculate event stats
  const currentTotalEvents = filteredEvents.length
  const currentWarningCount = filteredWarningEvents.length
  const currentNormalCount = filteredEvents.filter(e => e.type === 'Normal').length
  const currentErrorCount = filteredEvents.filter(e =>
    e.type === 'Warning' && (e.reason?.toLowerCase().includes('error') || e.reason?.toLowerCase().includes('failed'))
  ).length
  // Recent events (last hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const currentRecentCount = filteredEvents.filter(e => {
    if (!e.lastSeen) return false
    const eventTime = new Date(e.lastSeen)
    return eventTime >= oneHourAgo
  }).length

  // Cache stats to prevent showing 0 during refresh
  const cachedStats = useRef({ total: 0, warnings: 0, normal: 0, errors: 0, recent: 0 })
  useEffect(() => {
    // Update cache when we have actual data
    if (currentTotalEvents > 0 || currentWarningCount > 0) {
      cachedStats.current = {
        total: currentTotalEvents,
        warnings: currentWarningCount,
        normal: currentNormalCount,
        errors: currentErrorCount,
        recent: currentRecentCount,
      }
    }
  }, [currentTotalEvents, currentWarningCount, currentNormalCount, currentErrorCount, currentRecentCount])

  // Use cached values if current values are 0 (during refresh)
  const totalEvents = currentTotalEvents > 0 ? currentTotalEvents : cachedStats.current.total
  const warningCount = currentWarningCount > 0 || currentTotalEvents > 0 ? currentWarningCount : cachedStats.current.warnings
  const normalCount = currentNormalCount > 0 || currentTotalEvents > 0 ? currentNormalCount : cachedStats.current.normal
  const errorCount = currentErrorCount >= 0 && currentTotalEvents > 0 ? currentErrorCount : cachedStats.current.errors
  const recentCount = currentRecentCount >= 0 && currentTotalEvents > 0 ? currentRecentCount : cachedStats.current.recent

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters':
        return { value: reachableClusters.length, sublabel: 'clusters', onClick: () => drillToAllClusters(), isClickable: reachableClusters.length > 0 }
      case 'healthy':
        return { value: reachableClusters.length, sublabel: 'monitored', onClick: () => drillToAllClusters(), isClickable: reachableClusters.length > 0 }
      case 'total':
        return { value: totalEvents, sublabel: 'events', onClick: () => drillToAllEvents(), isClickable: totalEvents > 0 }
      case 'warnings':
        return { value: warningCount, sublabel: 'warning events', onClick: () => drillToAllEvents('warning'), isClickable: warningCount > 0 }
      case 'normal':
        return { value: normalCount, sublabel: 'normal events', onClick: () => drillToAllEvents('normal'), isClickable: normalCount > 0 }
      case 'recent':
        return { value: recentCount, sublabel: 'in last hour', onClick: () => drillToAllEvents('recent'), isClickable: recentCount > 0 }
      case 'errors':
        return { value: errorCount, sublabel: 'error events', onClick: () => drillToAllEvents('error'), isClickable: errorCount > 0 }
      default:
        return { value: 0 }
    }
  }, [reachableClusters.length, totalEvents, warningCount, normalCount, recentCount, errorCount, drillToAllEvents, drillToAllClusters])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  // Transform card for ConfigureCardModal
  const configureCardData = configuringCard ? {
    id: configuringCard.id,
    card_type: configuringCard.card_type,
    config: configuringCard.config,
    title: configuringCard.title,
  } : null

  return (
    <div className="">
      {/* Header */}
      <DashboardHeader
        title="Logs & Events"
        subtitle="Monitor cluster events and application logs"
        icon={<ScrollText className="w-6 h-6 text-purple-400" />}
        isFetching={isFetching}
        onRefresh={triggerRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="logs-auto-refresh"
        lastUpdated={lastUpdated}
      />

      {/* Stats Overview */}
      <UnifiedStatsSection
        config={EVENTS_STATS_CONFIG}
        getStatValue={getStatValue}
        hasData={reachableClusters.length > 0}
        isLoading={isLoading && clusters.length === 0}
        lastUpdated={lastUpdated}
      />

      {/* Dashboard Cards Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShowCards(!showCards)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Log Cards ({cards.length})</span>
            {showCards ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {showCards && (
          <>
            {cards.length === 0 ? (
              <div className="glass p-8 rounded-lg border-2 border-dashed border-border/50 text-center">
                <div className="flex justify-center mb-4">
                  <ScrollText className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Logs & Events Dashboard</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                  Add cards to monitor Kubernetes events, application logs, and system messages across your clusters.
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
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    {cards.map(card => (
                      <SortableLogsCard
                        key={card.id}
                        card={card}
                        onConfigure={() => handleConfigureCard(card.id)}
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
                <DragOverlay>
                  {activeId ? (
                    <div className="opacity-80 rotate-3 scale-105">
                      <LogsDragPreviewCard card={cards.find(c => c.id === activeId)!} />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </>
        )}
      </div>

      {/* Floating action buttons */}
      <FloatingDashboardActions
        onAddCard={() => setShowAddCard(true)}
        onOpenTemplates={() => setShowTemplates(true)}
        onResetToDefaults={reset}
        isCustomized={isCustomized}
      />

      {/* Add Card Modal */}
      <AddCardModal
        isOpen={showAddCard}
        onClose={() => setShowAddCard(false)}
        onAddCards={handleAddCards}
        existingCardTypes={cards.map(c => c.card_type)}
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
