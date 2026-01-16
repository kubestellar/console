import { useState, useEffect, useCallback } from 'react'
import { Plus, GripVertical } from 'lucide-react'
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
import { DashboardDropZone } from './DashboardDropZone'
import { useToast } from '../ui/Toast'
import { CardWrapper } from '../cards/CardWrapper'
import { ClusterHealth } from '../cards/ClusterHealth'
import { EventStream } from '../cards/EventStream'
import { PodIssues } from '../cards/PodIssues'
import { AppStatus } from '../cards/AppStatus'
import { ResourceUsage } from '../cards/ResourceUsage'
import { ClusterMetrics } from '../cards/ClusterMetrics'
import { DeploymentStatus } from '../cards/DeploymentStatus'
import { DeploymentIssues } from '../cards/DeploymentIssues'
import { UpgradeStatus } from '../cards/UpgradeStatus'
import { ResourceCapacity } from '../cards/ResourceCapacity'
import { GPUInventory } from '../cards/GPUInventory'
import { GPUStatus } from '../cards/GPUStatus'
import { GPUOverview } from '../cards/GPUOverview'
import { AddCardModal } from './AddCardModal'
import { ReplaceCardModal } from './ReplaceCardModal'
import { ConfigureCardModal } from './ConfigureCardModal'
import { CardRecommendations } from './CardRecommendations'

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

const CARD_COMPONENTS: Record<string, React.ComponentType<{ config?: Record<string, unknown> }>> = {
  cluster_health: ClusterHealth,
  event_stream: EventStream,
  pod_issues: PodIssues,
  app_status: AppStatus,
  resource_usage: ResourceUsage,
  cluster_metrics: ClusterMetrics,
  deployment_status: DeploymentStatus,
  deployment_issues: DeploymentIssues,
  upgrade_status: UpgradeStatus,
  resource_capacity: ResourceCapacity,
  gpu_inventory: GPUInventory,
  gpu_status: GPUStatus,
  gpu_overview: GPUOverview,
}

export function Dashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAddCardOpen, setIsAddCardOpen] = useState(false)
  const [isReplaceCardOpen, setIsReplaceCardOpen] = useState(false)
  const [isConfigureCardOpen, setIsConfigureCardOpen] = useState(false)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [localCards, setLocalCards] = useState<Card[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [_dragOverDashboard, setDragOverDashboard] = useState<string | null>(null)

  // Get all dashboards for cross-dashboard dragging
  const { dashboards, moveCardToDashboard, createDashboard } = useDashboards()
  const { showToast } = useToast()

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

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      const { data: dashboards } = await api.get<DashboardData[]>('/api/dashboards')
      if (dashboards && dashboards.length > 0) {
        const defaultDashboard = dashboards.find((d) => d.is_default) || dashboards[0]
        const { data } = await api.get<DashboardData>(`/api/dashboards/${defaultDashboard.id}`)
        setDashboard(data)
        setLocalCards(data.cards.length > 0 ? data.cards : getDemoCards())
      } else {
        setLocalCards(getDemoCards())
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error)
      setLocalCards(getDemoCards())
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddCards = (suggestions: Array<{
    type: string
    title: string
    visualization: string
    config: Record<string, unknown>
  }>) => {
    const newCards: Card[] = suggestions.map((s, index) => ({
      id: `new-${Date.now()}-${index}`,
      card_type: mapVisualizationToCardType(s.visualization, s.type),
      config: s.config,
      position: { x: 0, y: 0, w: 4, h: 3 },
      title: s.title,
    }))
    setLocalCards((prev) => [...prev, ...newCards])
  }

  const handleRemoveCard = useCallback((cardId: string) => {
    setLocalCards((prev) => prev.filter((c) => c.id !== cardId))
    // TODO: Persist to backend if dashboard exists
  }, [])

  const handleConfigureCard = useCallback((card: Card) => {
    setSelectedCard(card)
    setIsConfigureCardOpen(true)
  }, [])

  const handleReplaceCard = useCallback((card: Card) => {
    setSelectedCard(card)
    setIsReplaceCardOpen(true)
  }, [])

  const handleCardReplaced = useCallback((oldCardId: string, newCardType: string, newTitle?: string, newConfig?: Record<string, unknown>) => {
    setLocalCards((prev) =>
      prev.map((c) =>
        c.id === oldCardId
          ? { ...c, card_type: newCardType, title: newTitle, config: newConfig || {} }
          : c
      )
    )
    setIsReplaceCardOpen(false)
    setSelectedCard(null)
  }, [])

  const handleCardConfigured = useCallback((cardId: string, newConfig: Record<string, unknown>, newTitle?: string) => {
    setLocalCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? { ...c, config: newConfig, title: newTitle || c.title }
          : c
      )
    )
    setIsConfigureCardOpen(false)
    setSelectedCard(null)
  }, [])

  const handleAddRecommendedCard = useCallback((cardType: string, config?: Record<string, unknown>, title?: string) => {
    const newCard: Card = {
      id: `rec-${Date.now()}`,
      card_type: cardType,
      config: config || {},
      position: { x: 0, y: 0, w: 4, h: 3 },
      title,
    }
    // Add card at the TOP of the dashboard
    setLocalCards((prev) => [newCard, ...prev])
  }, [])

  // Create a new card from AI configuration
  const handleCreateCardFromAI = useCallback((cardType: string, config: Record<string, unknown>, title?: string) => {
    const newCard: Card = {
      id: `ai-${Date.now()}`,
      card_type: cardType,
      config: config || {},
      position: { x: 0, y: 0, w: 4, h: 3 },
      title,
    }
    // Add at TOP and close the configure modal
    setLocalCards((prev) => [newCard, ...prev])
    setIsConfigureCardOpen(false)
    setSelectedCard(null)
  }, [])

  const currentCardTypes = localCards.map(c => c.card_type)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <div className="text-center">
          <div className="spinner w-12 h-12 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {dashboard?.name || 'Dashboard'}
          </h1>
          <p className="text-muted-foreground">
            Your personalized multi-cluster overview
          </p>
        </div>
        <button
          onClick={() => setIsAddCardOpen(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Card
        </button>
      </div>

      {/* AI Recommendations */}
      <div data-tour="recommendations">
        <CardRecommendations
          currentCardTypes={currentCardTypes}
          onAddCard={handleAddRecommendedCard}
        />
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

      {/* Add Card Modal */}
      <AddCardModal
        isOpen={isAddCardOpen}
        onClose={() => setIsAddCardOpen(false)}
        onAddCards={handleAddCards}
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
    </div>
  )
}

// Sortable card component with drag handle
interface SortableCardProps {
  card: Card
  onConfigure: () => void
  onReplace: () => void
  onRemove: () => void
  isDragging: boolean
}

function SortableCard({ card, onConfigure, onReplace, onRemove, isDragging }: SortableCardProps) {
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
    <div ref={setNodeRef} style={style}>
      <CardWrapper
        cardId={card.id}
        cardType={card.card_type}
        lastSummary={card.last_summary}
        title={card.title}
        onConfigure={onConfigure}
        onReplace={onReplace}
        onRemove={onRemove}
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
}

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
      <div className="text-sm font-medium text-white mb-2">
        {card.title || card.card_type.replace(/_/g, ' ')}
      </div>
      <div className="h-24 flex items-center justify-center text-muted-foreground">
        {CardComponent ? 'Moving card...' : `Card type: ${card.card_type}`}
      </div>
    </div>
  )
}

function mapVisualizationToCardType(visualization: string, type: string): string {
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
