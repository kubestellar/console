import { useState, useEffect, useCallback } from 'react'
import { Bell, GripVertical, AlertCircle } from 'lucide-react'
import { DashboardHeader } from '../shared/DashboardHeader'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
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
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { CardWrapper } from '../cards/CardWrapper'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import type { DashboardTemplate } from '../dashboard/templates'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { UnifiedStatsSection, ALERTS_STATS_CONFIG } from '../../lib/unified/stats'
import type { StatBlockValue } from '../ui/StatsOverview'
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
function SortableCard({ card, onRemove, onReplace, onConfigure, isRefreshing, onRefresh, lastUpdated }: {
  card: DashboardCard
  onRemove: (id: string) => void
  onReplace: (id: string) => void
  onConfigure: (id: string) => void
  isRefreshing?: boolean
  onRefresh?: () => void
  lastUpdated?: Date | null
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
}

export function Alerts() {
  const { stats, evaluateConditions } = useAlerts()
  const { rules } = useAlertRules()
  const { isRefreshing: dataRefreshing, refetch, error } = useClusters()
  const { drillToAlert } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

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

  const { showIndicator, triggerRefresh } = useRefreshIndicator(handleRefresh)
  const isRefreshing = dataRefreshing || showIndicator
  const isFetching = isRefreshing || showIndicator

  const enabledRulesCount = rules.filter(r => r.enabled).length

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
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

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )


  return (
    <div className="">
      {/* Header */}
      <DashboardHeader
        title="Alerts"
        subtitle="Monitor alerts and rules across clusters"
        icon={<Bell className="w-6 h-6 text-purple-400" />}
        isFetching={isFetching}
        onRefresh={triggerRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="alerts-auto-refresh"
        lastUpdated={lastUpdated}
        afterTitle={
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
        }
      />

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Error loading alert data</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Configurable Stats Overview */}
      <UnifiedStatsSection
        config={ALERTS_STATS_CONFIG}
        getStatValue={getStatValue}
        hasData={stats.firing > 0 || enabledRulesCount > 0}
        isLoading={false}
        lastUpdated={lastUpdated}
      />

      {/* Cards Grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pb-32 auto-rows-[minmax(180px,auto)]">
            {cards.map(card => (
              <SortableCard
                key={card.id}
                card={card}
                onRemove={handleRemoveCard}
                onReplace={handleReplaceCard}
                onConfigure={handleConfigureCard}
                isRefreshing={isRefreshing}
                onRefresh={triggerRefresh}
                lastUpdated={lastUpdated}
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
