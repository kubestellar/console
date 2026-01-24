import { useState, useEffect, useCallback } from 'react'
import { Bell, RefreshCw, GripVertical, Hourglass } from 'lucide-react'
import {
  DndContext,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAlerts, useAlertRules } from '../../hooks/useAlerts'
import { useClusters } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { CardWrapper } from '../cards/CardWrapper'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import type { DashboardTemplate } from '../dashboard/templates'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { StatsOverview, StatBlockValue } from '../ui/StatsOverview'
import { useDashboard, DashboardCard } from '../../lib/dashboards'

const ALERTS_STORAGE_KEY = 'kubestellar-alerts-dashboard-cards'

// Default cards for the alerts dashboard
const DEFAULT_ALERT_CARDS = [
  { type: 'active_alerts', title: 'Active Alerts', position: { w: 6, h: 2 } },
  { type: 'alert_rules', title: 'Alert Rules', position: { w: 6, h: 2 } },
  { type: 'pod_issues', title: 'Pod Issues', position: { w: 4, h: 2 } },
  { type: 'deployment_issues', title: 'Deployment Issues', position: { w: 4, h: 2 } },
  { type: 'security_issues', title: 'Security Issues', position: { w: 4, h: 2 } },
]


// Sortable card component
function SortableCard({ card, onRemove, onReplace, onConfigure }: {
  card: DashboardCard
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
    gridColumn: `span ${Math.min(card.position?.w || 4, 12)}`,
    gridRow: `span ${card.position?.h || 2}`,
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
  const { stats, evaluateConditions } = useAlerts()
  const { rules } = useAlertRules()
  const { isRefreshing, refetch } = useClusters()
  const { drillToAlert } = useDrillDownActions()

  // Local state for last updated time
  const [lastUpdated, setLastUpdated] = useState<Date | undefined>(undefined)

  // Use the shared dashboard hook for cards, DnD, modals, auto-refresh
  const {
    cards,
    setCards,
    addCards,
    removeCard,
    reset,
    isCustomized,
    showAddCard,
    setShowAddCard,
    showTemplates,
    setShowTemplates,
    expandCards,
    dnd: { sensors, handleDragEnd },
    autoRefresh,
    setAutoRefresh,
  } = useDashboard({
    storageKey: ALERTS_STORAGE_KEY,
    defaultCards: DEFAULT_ALERT_CARDS,
    onRefresh: () => {
      refetch()
      evaluateConditions()
      setLastUpdated(new Date())
    },
  })

  // Set initial lastUpdated on mount
  useEffect(() => {
    setLastUpdated(new Date())
  }, [])

  const handleAddCards = useCallback((suggestions: Array<{
    type: string
    title: string
    visualization?: string
    config: Record<string, unknown>
  }>) => {
    addCards(suggestions)
    setShowAddCard(false)
  }, [addCards, setShowAddCard])

  const handleRemoveCard = useCallback((id: string) => {
    removeCard(id)
  }, [removeCard])

  const handleReplaceCard = useCallback((id: string) => {
    handleRemoveCard(id)
    setShowAddCard(true)
  }, [handleRemoveCard, setShowAddCard])

  const handleConfigureCard = useCallback((id: string) => {
    console.log('Configure card:', id)
  }, [])

  const handleApplyTemplate = useCallback((template: DashboardTemplate) => {
    const newCards = template.cards.map((card, index) => ({
      id: `${card.card_type}_${Date.now()}_${index}`,
      card_type: card.card_type,
      title: card.title,
      config: card.config || {},
      position: card.position,
    }))
    setCards(newCards)
    expandCards()
    setShowTemplates(false)
  }, [setCards, expandCards, setShowTemplates])

  const handleRefresh = useCallback(() => {
    refetch()
    evaluateConditions()
  }, [refetch, evaluateConditions])

  const enabledRulesCount = rules.filter(r => r.enabled).length

  // Stats value getter for the configurable StatsOverview component
  const getStatValue = useCallback((blockId: string): StatBlockValue => {
    const disabledRulesCount = rules.filter(r => !r.enabled).length
    const drillToFiringAlert = () => {
      drillToAlert('all', undefined, 'Active Alerts', { status: 'firing', count: stats.firing })
    }
    const drillToResolvedAlert = () => {
      drillToAlert('all', undefined, 'Resolved Alerts', { status: 'resolved', count: stats.resolved })
    }

    switch (blockId) {
      case 'firing':
        return { value: stats.firing, sublabel: 'active alerts', onClick: drillToFiringAlert, isClickable: stats.firing > 0 }
      case 'pending':
        return { value: 0, sublabel: 'pending', isClickable: false }
      case 'resolved':
        return { value: stats.resolved, sublabel: 'resolved', onClick: drillToResolvedAlert, isClickable: stats.resolved > 0 }
      case 'rules_enabled':
        return { value: enabledRulesCount, sublabel: 'rules enabled', isClickable: false }
      case 'rules_disabled':
        return { value: disabledRulesCount, sublabel: 'rules disabled', isClickable: false }
      default:
        return { value: 0 }
    }
  }, [stats, enabledRulesCount, rules, drillToAlert])


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

      {/* Configurable Stats Overview */}
      <StatsOverview
        dashboardType="alerts"
        getStatValue={getStatValue}
        hasData={stats.firing > 0 || enabledRulesCount > 0}
        isLoading={isRefreshing}
        lastUpdated={lastUpdated}
        collapsedStorageKey="kubestellar-alerts-stats-collapsed"
      />

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
        onAddCard={() => setShowAddCard(true)}
        onOpenTemplates={() => setShowTemplates(true)}
        onResetToDefaults={reset}
        isCustomized={isCustomized}
      />

      {/* Modals */}
      <AddCardModal
        isOpen={showAddCard}
        onClose={() => setShowAddCard(false)}
        onAddCards={handleAddCards}
      />

      <TemplatesModal
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        onApplyTemplate={handleApplyTemplate}
      />
    </div>
  )
}
