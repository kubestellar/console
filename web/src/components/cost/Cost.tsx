import { useState, useEffect, useCallback, memo } from 'react'
import { useLocation } from 'react-router-dom'
import { DollarSign, RefreshCw, Activity, Hourglass, ChevronDown, ChevronRight, GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useShowCards } from '../../hooks/useShowCards'
import { Skeleton } from '../ui/Skeleton'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { ConfigureCardModal } from '../dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { DashboardTemplate } from '../dashboard/templates'
import { formatCardTitle } from '../../lib/formatCardTitle'

interface CostCard {
  id: string
  card_type: string
  config: Record<string, unknown>
  title?: string
  position?: { w: number; h: number }
}

// Width class lookup for Tailwind (dynamic classes don't work)
const WIDTH_CLASSES: Record<number, string> = {
  3: 'col-span-3',
  4: 'col-span-4',
  5: 'col-span-5',
  6: 'col-span-6',
  7: 'col-span-7',
  8: 'col-span-8',
  9: 'col-span-9',
  10: 'col-span-10',
  11: 'col-span-11',
  12: 'col-span-12',
}

// Sortable Card Component
interface SortableCardProps {
  card: CostCard
  onRemove: () => void
  onConfigure: () => void
  onWidthChange: (width: number) => void
  isDragging: boolean
}

const SortableCard = memo(function SortableCard({
  card,
  onRemove,
  onConfigure,
  onWidthChange,
  isDragging,
}: SortableCardProps) {
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
    opacity: isDragging ? 0.5 : 1,
  }

  const CardComponent = CARD_COMPONENTS[card.card_type]
  if (!CardComponent) {
    console.warn(`Card component not found: ${card.card_type}`)
    return null
  }

  const width = Math.min(12, Math.max(3, card.position?.w || 6))
  const colSpan = WIDTH_CLASSES[width] || 'col-span-6'

  return (
    <div ref={setNodeRef} style={style} className={colSpan}>
      <CardWrapper
        title={formatCardTitle(card.card_type)}
        onRemove={onRemove}
        onConfigure={onConfigure}
        cardType={card.card_type}
        cardWidth={width}
        onWidthChange={onWidthChange}
        isDemoData={DEMO_DATA_CARDS.has(card.card_type)}
        dragHandle={
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
        }
      >
        <CardComponent config={card.config} />
      </CardWrapper>
    </div>
  )
})

// Drag preview component
function DragPreviewCard({ card }: { card: CostCard }) {
  const CardComponent = CARD_COMPONENTS[card.card_type]
  if (!CardComponent) return null

  const width = Math.min(12, Math.max(3, card.position?.w || 6))
  const colSpan = WIDTH_CLASSES[width] || 'col-span-6'

  return (
    <div className={colSpan}>
      <CardWrapper
        title={formatCardTitle(card.card_type)}
        cardType={card.card_type}
      >
        <CardComponent config={card.config} />
      </CardWrapper>
    </div>
  )
}

// Default cards for the Cost dashboard
const DEFAULT_COST_CARDS: CostCard[] = [
  { id: 'cost-1', card_type: 'cluster_costs', config: {}, position: { w: 6, h: 4 } },
  { id: 'cost-2', card_type: 'opencost_overview', config: {}, position: { w: 6, h: 4 } },
  { id: 'cost-3', card_type: 'kubecost_overview', config: {}, position: { w: 6, h: 4 } },
  { id: 'cost-4', card_type: 'resource_usage', config: {}, position: { w: 3, h: 2 } },
  { id: 'cost-5', card_type: 'resource_capacity', config: {}, position: { w: 3, h: 2 } },
]

export function Cost() {
  const location = useLocation()
  const { clusters, isLoading, refetch, lastUpdated, isRefreshing } = useClusters()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { showCards, expandCards } = useShowCards('kubestellar-cost')

  const [cards, setCards] = useState<CostCard[]>(() => {
    const saved = localStorage.getItem('cost-dashboard-cards')
    return saved ? JSON.parse(saved) : DEFAULT_COST_CARDS
  })

  const [showAddCard, setShowAddCard] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [configuringCard, setConfiguringCard] = useState<CostCard | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [showStats, setShowStats] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)

  // Save cards to localStorage
  useEffect(() => {
    localStorage.setItem('cost-dashboard-cards', JSON.stringify(cards))
  }, [cards])

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (over && active.id !== over.id) {
      setCards(prev => {
        const oldIndex = prev.findIndex(c => c.id === active.id)
        const newIndex = prev.findIndex(c => c.id === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }, [])

  // Trigger refresh when navigating to this page
  useEffect(() => {
    refetch()
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => refetch(), 30000)
    return () => clearInterval(interval)
  }, [autoRefresh, refetch])

  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  const handleAddCards = useCallback((newCards: Array<{ type: string; title: string; config: Record<string, unknown> }>) => {
    const cardsToAdd: CostCard[] = newCards.map(card => ({
      id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      card_type: card.type,
      config: card.config,
      title: card.title,
    }))
    setCards(prev => [...prev, ...cardsToAdd])
    expandCards()
    setShowAddCard(false)
  }, [expandCards])

  const handleRemoveCard = useCallback((cardId: string) => {
    setCards(prev => prev.filter(c => c.id !== cardId))
  }, [])

  const handleConfigureCard = useCallback((cardId: string) => {
    const card = cards.find(c => c.id === cardId)
    if (card) setConfiguringCard(card)
  }, [cards])

  const handleSaveCardConfig = useCallback((cardId: string, config: Record<string, unknown>) => {
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, config } : c
    ))
    setConfiguringCard(null)
  }, [])

  const handleWidthChange = useCallback((cardId: string, newWidth: number) => {
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, position: { ...(c.position || { w: 6, h: 2 }), w: newWidth } } : c
    ))
  }, [])

  const applyTemplate = useCallback((template: DashboardTemplate) => {
    const newCards: CostCard[] = template.cards.map(card => ({
      id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      card_type: card.card_type,
      config: card.config || {},
      title: card.title,
    }))
    setCards(newCards)
    expandCards()
    setShowTemplates(false)
  }, [expandCards])

  // Filter clusters based on global selection
  const filteredClusters = clusters.filter(c =>
    isAllClustersSelected || globalSelectedClusters.includes(c.name)
  )
  const reachableClusters = filteredClusters.filter(c => c.reachable !== false)

  // Calculate basic stats
  const totalCPU = reachableClusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0)
  const totalMemoryGB = reachableClusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0)
  const totalStorageGB = reachableClusters.reduce((sum, c) => sum + (c.storageGB || 0), 0)

  // Transform card for ConfigureCardModal
  const configureCard = configuringCard ? {
    id: configuringCard.id,
    card_type: configuringCard.card_type,
    config: configuringCard.config,
    title: configuringCard.title,
  } : null

  return (
    <div className="pt-16">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <DollarSign className="w-6 h-6 text-green-400" />
                Cost Management
              </h1>
              <p className="text-muted-foreground">Monitor and optimize resource costs across clusters</p>
            </div>
            {isRefreshing && (
              <span className="flex items-center gap-1 text-xs text-amber-400 animate-pulse" title="Updating...">
                <Hourglass className="w-3 h-3" />
                <span>Updating</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="cost-auto-refresh" className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground" title="Auto-refresh every 30s">
              <input
                type="checkbox"
                id="cost-auto-refresh"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-border w-3.5 h-3.5"
              />
              Auto
            </label>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Overview - collapsible */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setShowStats(!showStats)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Activity className="w-4 h-4" />
            <span>Resource Overview</span>
            {showStats ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {lastUpdated && (
            <span className="text-xs text-muted-foreground/60">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>

        {showStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass rounded-lg p-4">
              <div className="text-xs text-muted-foreground mb-1">Total Clusters</div>
              {isLoading ? (
                <Skeleton className="h-6 w-16" />
              ) : (
                <div className="text-xl font-bold text-foreground">{reachableClusters.length}</div>
              )}
            </div>
            <div className="glass rounded-lg p-4">
              <div className="text-xs text-muted-foreground mb-1">Total CPU</div>
              {isLoading ? (
                <Skeleton className="h-6 w-20" />
              ) : (
                <div className="text-xl font-bold text-foreground">{totalCPU} cores</div>
              )}
            </div>
            <div className="glass rounded-lg p-4">
              <div className="text-xs text-muted-foreground mb-1">Total Memory</div>
              {isLoading ? (
                <Skeleton className="h-6 w-20" />
              ) : (
                <div className="text-xl font-bold text-foreground">{Math.round(totalMemoryGB)} GB</div>
              )}
            </div>
            <div className="glass rounded-lg p-4">
              <div className="text-xs text-muted-foreground mb-1">Total Storage</div>
              {isLoading ? (
                <Skeleton className="h-6 w-20" />
              ) : (
                <div className="text-xl font-bold text-foreground">
                  {totalStorageGB >= 1024 ? `${(totalStorageGB / 1024).toFixed(1)} TB` : `${Math.round(totalStorageGB)} GB`}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Cards Grid */}
      {showCards && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-12 gap-4 pb-32">
              {cards.map(card => (
                <SortableCard
                  key={card.id}
                  card={card}
                  onRemove={() => handleRemoveCard(card.id)}
                  onConfigure={() => handleConfigureCard(card.id)}
                  onWidthChange={(width) => handleWidthChange(card.id, width)}
                  isDragging={activeId === card.id}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeId ? (
              <div className="opacity-80 rotate-3 scale-105">
                <DragPreviewCard card={cards.find(c => c.id === activeId)!} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Floating Actions */}
      <FloatingDashboardActions
        onAddCard={() => setShowAddCard(true)}
        onOpenTemplates={() => setShowTemplates(true)}
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
        card={configureCard}
        onClose={() => setConfiguringCard(null)}
        onSave={(cardId, config) => {
          handleSaveCardConfig(cardId, config)
        }}
      />
    </div>
  )
}
