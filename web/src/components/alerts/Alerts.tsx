import { useState, useCallback, useEffect } from 'react'
import { Bell, RefreshCw, GripVertical, Hourglass } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAlerts, useAlertRules } from '../../hooks/useAlerts'
import { useClusters } from '../../hooks/useMCP'
import { CardWrapper } from '../cards/CardWrapper'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import type { DashboardTemplate } from '../dashboard/templates'
import { formatCardTitle } from '../../lib/formatCardTitle'

interface AlertCard {
  id: string
  card_type: string
  title?: string
  config?: Record<string, unknown>
  position: { w: number; h: number }
}

const ALERTS_STORAGE_KEY = 'kubestellar-alerts-dashboard-cards'

// Default cards for the alerts dashboard
const DEFAULT_ALERT_CARDS: AlertCard[] = [
  { id: 'active_alerts_1', card_type: 'active_alerts', title: 'Active Alerts', position: { w: 6, h: 2 } },
  { id: 'alert_rules_1', card_type: 'alert_rules', title: 'Alert Rules', position: { w: 6, h: 2 } },
  { id: 'pod_issues_1', card_type: 'pod_issues', title: 'Pod Issues', position: { w: 4, h: 2 } },
  { id: 'deployment_issues_1', card_type: 'deployment_issues', title: 'Deployment Issues', position: { w: 4, h: 2 } },
  { id: 'security_issues_1', card_type: 'security_issues', title: 'Security Issues', position: { w: 4, h: 2 } },
]

function loadCards(): AlertCard[] {
  try {
    const stored = localStorage.getItem(ALERTS_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('Failed to load alert dashboard cards:', e)
  }
  return DEFAULT_ALERT_CARDS
}

function saveCards(cards: AlertCard[]) {
  try {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(cards))
  } catch (e) {
    console.error('Failed to save alert dashboard cards:', e)
  }
}


// Sortable card component
function SortableCard({ card, onRemove, onReplace, onConfigure }: {
  card: AlertCard
  onRemove: (id: string) => void
  onReplace: (id: string) => void
  onConfigure: (id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${Math.min(card.position.w, 12)}`,
    gridRow: `span ${card.position.h}`,
    opacity: isDragging ? 0.5 : 1,
  }

  const CardComponent = CARD_COMPONENTS[card.card_type]
  if (!CardComponent) {
    return null
  }

  const isDemoData = DEMO_DATA_CARDS.has(card.card_type)

  return (
    <div
      ref={setNodeRef}
      style={style}
    >
      <CardWrapper
        title={formatCardTitle(card.card_type)}
        cardId={card.id}
        cardType={card.card_type}
        onRemove={() => onRemove(card.id)}
        onReplace={() => onReplace(card.id)}
        onConfigure={() => onConfigure(card.id)}
        isDemoData={isDemoData}
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
}

export function Alerts() {
  const [cards, setCards] = useState<AlertCard[]>(loadCards)
  const [isAddCardOpen, setIsAddCardOpen] = useState(false)
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false)

  const { stats, evaluateConditions } = useAlerts()
  const { rules } = useAlertRules()
  const { isRefreshing, refetch } = useClusters()

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Save cards when they change
  useEffect(() => {
    saveCards(cards)
  }, [cards])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setCards((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  const handleAddCards = useCallback((suggestions: Array<{
    type: string
    title: string
    visualization: string
    config: Record<string, unknown>
  }>) => {
    const cardsToAdd: AlertCard[] = suggestions.map((s, idx) => ({
      id: `${s.type}_${Date.now()}_${idx}`,
      card_type: s.type,
      title: s.title,
      config: s.config,
      position: { w: 4, h: 2 },
    }))
    setCards(prev => [...prev, ...cardsToAdd])
    setIsAddCardOpen(false)
  }, [])

  const handleRemoveCard = useCallback((id: string) => {
    setCards(prev => prev.filter(card => card.id !== id))
  }, [])

  const handleReplaceCard = useCallback((id: string) => {
    handleRemoveCard(id)
    setIsAddCardOpen(true)
  }, [handleRemoveCard])

  const handleConfigureCard = useCallback((id: string) => {
    console.log('Configure card:', id)
  }, [])

  const handleApplyTemplate = useCallback((template: DashboardTemplate) => {
    const newCards: AlertCard[] = template.cards.map((card, index) => ({
      id: `${card.card_type}_${Date.now()}_${index}`,
      card_type: card.card_type,
      title: card.title,
      config: card.config,
      position: card.position,
    }))
    setCards(newCards)
    setIsTemplatesOpen(false)
  }, [])

  const handleRefresh = useCallback(() => {
    refetch()
    evaluateConditions()
  }, [refetch, evaluateConditions])

  const enabledRulesCount = rules.filter(r => r.enabled).length

  const [autoRefresh, setAutoRefresh] = useState(true)

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      refetch()
      evaluateConditions()
    }, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh, refetch, evaluateConditions])

  return (
    <div className="pt-16">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Bell className="w-6 h-6 text-purple-400" />
                Alerts
              </h1>
              <p className="text-muted-foreground">Monitor alerts and rules across clusters</p>
            </div>
            {isRefreshing && (
              <span className="flex items-center gap-1 text-xs text-amber-400 animate-pulse" title="Updating...">
                <Hourglass className="w-3 h-3" />
                <span>Updating</span>
              </span>
            )}
            <div className="flex items-center gap-2 ml-4">
              {stats.firing > 0 && (
                <span className="px-2 py-1 text-sm font-medium rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                  {stats.firing} active
                </span>
              )}
              <span className="px-2 py-1 text-sm rounded bg-secondary text-muted-foreground">
                {enabledRulesCount} rules enabled
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor="alerts-auto-refresh" className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground" title="Auto-refresh every 30s">
              <input
                type="checkbox"
                id="alerts-auto-refresh"
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

      {/* Cards Grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-12 gap-4 pb-32 auto-rows-[minmax(180px,auto)]">
            {cards.map(card => (
              <SortableCard
                key={card.id}
                card={card}
                onRemove={handleRemoveCard}
                onReplace={handleReplaceCard}
                onConfigure={handleConfigureCard}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {cards.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <Bell className="w-12 h-12 mb-4" />
          <p className="text-lg font-medium">No cards configured</p>
          <p className="text-sm">Use the floating buttons to add cards or apply a template</p>
        </div>
      )}

      {/* Floating action buttons */}
      <FloatingDashboardActions
        onAddCard={() => setIsAddCardOpen(true)}
        onOpenTemplates={() => setIsTemplatesOpen(true)}
      />

      {/* Modals */}
      <AddCardModal
        isOpen={isAddCardOpen}
        onClose={() => setIsAddCardOpen(false)}
        onAddCards={handleAddCards}
      />

      <TemplatesModal
        isOpen={isTemplatesOpen}
        onClose={() => setIsTemplatesOpen(false)}
        onApplyTemplate={handleApplyTemplate}
      />
    </div>
  )
}
