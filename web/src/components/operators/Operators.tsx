import { useEffect, useCallback, memo, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Cog, GripVertical, ChevronDown, ChevronRight, Plus, LayoutGrid } from 'lucide-react'
import { DashboardHeader } from '../shared/DashboardHeader'
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
import { useClusters, useOperatorSubscriptions, useOperators } from '../../hooks/useMCP'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatsOverview, StatBlockValue } from '../ui/StatsOverview'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { ConfigureCardModal } from '../dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { DashboardTemplate } from '../dashboard/templates'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { useDashboard, DashboardCard } from '../../lib/dashboards'

const OPERATORS_CARDS_KEY = 'kubestellar-operators-cards'

// Default cards for the operators dashboard
const DEFAULT_OPERATORS_CARDS = [
  { type: 'operator_status', title: 'Operator Status', position: { w: 4, h: 3 } },
  { type: 'operator_subscriptions', title: 'Subscriptions', position: { w: 8, h: 3 } },
  { type: 'crd_health', title: 'CRD Health', position: { w: 4, h: 3 } },
  { type: 'event_stream', title: 'Operator Events', config: { filter: 'operator' }, position: { w: 8, h: 3 } },
]

// Sortable card component with drag handle
interface SortableOperatorsCardProps {
  card: DashboardCard
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging: boolean
  isRefreshing?: boolean
  onRefresh?: () => void
  lastUpdated?: Date | null
}

const SortableOperatorsCard = memo(function SortableOperatorsCard({
  card,
  onConfigure,
  onRemove,
  onWidthChange,
  isDragging,
  isRefreshing,
  onRefresh,
  lastUpdated,
}: SortableOperatorsCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card.id })

  const cardWidth = card.position?.w || 4
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${cardWidth}`,
    opacity: isDragging ? 0.5 : 1,
  }

  const CardComponent = CARD_COMPONENTS[card.card_type]
  if (!CardComponent) {
    console.warn(`Unknown card type: ${card.card_type}`)
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
function OperatorsDragPreviewCard({ card }: { card: DashboardCard }) {
  const cardWidth = card.position?.w || 4
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

export function Operators() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch } = useClusters()
  const { subscriptions: operatorSubs, refetch: refetchSubs } = useOperatorSubscriptions()
  const { operators: allOperators, refetch: refetchOps } = useOperators()
  const { drillToOperator: _drillToOperator, drillToAllOperators, drillToAllClusters } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected, filterByStatus, customFilter } = useGlobalFilters()

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
    storageKey: OPERATORS_CARDS_KEY,
    defaultCards: DEFAULT_OPERATORS_CARDS,
    onRefresh: () => {
      refetch()
      refetchSubs()
      refetchOps()
    },
  })

  // Handle addCard URL param
  useEffect(() => {
    if (searchParams.get('addCard') === 'true') {
      setShowAddCard(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, setShowAddCard])

  const handleRefresh = useCallback(() => {
    refetch()
    refetchSubs()
    refetchOps()
  }, [refetch, refetchSubs, refetchOps])

  const { showIndicator, triggerRefresh } = useRefreshIndicator(handleRefresh)
  const isRefreshing = dataRefreshing || showIndicator
  const isFetching = isLoading || isRefreshing || showIndicator

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

  // Filter clusters based on global selection
  const filteredClusters = clusters.filter(c =>
    isAllClustersSelected || globalSelectedClusters.includes(c.name)
  )
  const reachableClusters = filteredClusters.filter(c => c.reachable !== false)

  // Filter operator subscriptions based on global cluster selection (for subscription-specific stats)
  const filteredSubscriptions = useMemo(() => {
    let result = operatorSubs.filter(op => {
      if (isAllClustersSelected) return true
      // Handle cluster field that might be 'clustername' or 'clustername/namespace'
      const clusterName = op.cluster?.split('/')[0] || ''
      return globalSelectedClusters.includes(clusterName) || globalSelectedClusters.includes(op.cluster || '')
    })
    // Apply custom text filter for consistency
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(op =>
        op.name.toLowerCase().includes(query) ||
        op.namespace.toLowerCase().includes(query) ||
        op.channel.toLowerCase().includes(query)
      )
    }
    return result
  }, [operatorSubs, isAllClustersSelected, globalSelectedClusters, customFilter])

  // Filter operators (from useOperators) based on global cluster selection - matches OperatorStatus card
  const filteredOperatorsAPI = useMemo(() => {
    let result = allOperators.filter(op => {
      if (isAllClustersSelected) return true
      // Handle cluster field that might be 'clustername' or 'clustername/namespace'
      const clusterName = op.cluster?.split('/')[0] || ''
      return globalSelectedClusters.includes(clusterName) || globalSelectedClusters.includes(op.cluster || '')
    })
    // Apply status filter to match what OperatorStatus card shows
    result = filterByStatus(result)
    // Apply custom text filter to match what OperatorStatus card shows
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(op =>
        op.name.toLowerCase().includes(query) ||
        op.namespace.toLowerCase().includes(query) ||
        op.version.toLowerCase().includes(query)
      )
    }
    return result
  }, [allOperators, isAllClustersSelected, globalSelectedClusters, filterByStatus, customFilter])

  // Calculate operator stats - use filteredOperatorsAPI to match OperatorStatus card exactly
  const totalOperators = filteredOperatorsAPI.length
  // Running/Succeeded - matches card's "Running" count
  const installedOperators = filteredOperatorsAPI.filter(op => op.status === 'Succeeded').length
  // Installing - matches card's "Other" count for Installing status
  const installingOperators = filteredOperatorsAPI.filter(op => op.status === 'Installing' || op.status === 'Upgrading').length
  // Upgrades available from subscriptions (pendingUpgrade field)
  const upgradesAvailable = filteredSubscriptions.filter(op => op.pendingUpgrade).length
  // Failed - matches card's "Failed" count
  const failingOperators = filteredOperatorsAPI.filter(op => op.status === 'Failed').length

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'operators':
        return { value: totalOperators, sublabel: 'total operators', onClick: () => drillToAllOperators(), isClickable: totalOperators > 0 }
      case 'installed':
        return { value: installedOperators, sublabel: 'installed', onClick: () => drillToAllOperators('installed'), isClickable: installedOperators > 0 }
      case 'installing':
        return { value: installingOperators, sublabel: 'installing', onClick: () => drillToAllOperators('installing'), isClickable: installingOperators > 0 }
      case 'upgrades':
        return { value: upgradesAvailable, sublabel: 'upgrades available', onClick: () => drillToAllOperators('upgrades'), isClickable: upgradesAvailable > 0 }
      case 'subscriptions':
        return { value: filteredSubscriptions.length, sublabel: 'subscriptions', onClick: () => drillToAllOperators(), isClickable: filteredSubscriptions.length > 0 }
      case 'crds':
        return { value: 0, sublabel: 'CRDs' } // Would need a CRD hook
      case 'failing':
        return { value: failingOperators, sublabel: 'failing', onClick: () => drillToAllOperators('failed'), isClickable: failingOperators > 0 }
      case 'clusters':
        return { value: reachableClusters.length, sublabel: 'clusters', onClick: () => drillToAllClusters(), isClickable: reachableClusters.length > 0 }
      default:
        return { value: 0 }
    }
  }, [totalOperators, installedOperators, installingOperators, upgradesAvailable, failingOperators, reachableClusters.length, filteredSubscriptions, drillToAllOperators, drillToAllClusters])

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
    <div className="pt-16">
      {/* Header */}
      <DashboardHeader
        title="Operators"
        subtitle="Monitor OLM operators, subscriptions, and CRDs"
        icon={<Cog className="w-6 h-6 text-purple-400" />}
        isFetching={isFetching}
        onRefresh={triggerRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="operators-auto-refresh"
        lastUpdated={lastUpdated}
      />

      {/* Stats Overview */}
      <StatsOverview
        dashboardType="operators"
        getStatValue={getStatValue}
        hasData={totalOperators > 0 || reachableClusters.length > 0}
        isLoading={isLoading && clusters.length === 0}
        lastUpdated={lastUpdated}
        collapsedStorageKey="kubestellar-operators-stats-collapsed"
      />

      {/* Dashboard Cards Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShowCards(!showCards)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Operator Cards ({cards.length})</span>
            {showCards ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {showCards && (
          <>
            {cards.length === 0 ? (
              <div className="glass p-8 rounded-lg border-2 border-dashed border-border/50 text-center">
                <div className="flex justify-center mb-4">
                  <Cog className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Operators Dashboard</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                  Add cards to monitor OLM operators, subscriptions, and Custom Resource Definitions across your clusters.
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
                  <div className="grid grid-cols-12 gap-4">
                    {cards.map(card => (
                      <SortableOperatorsCard
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
                      <OperatorsDragPreviewCard card={cards.find(c => c.id === activeId)!} />
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
