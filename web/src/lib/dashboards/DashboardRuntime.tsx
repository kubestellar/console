/**
 * DashboardRuntime - Renders complete dashboards from declarative definitions
 *
 * This is the foundation for the YAML-based Dashboard Builder.
 * Dashboards are defined declaratively and this runtime interprets
 * and renders them with consistent behavior.
 *
 * Future: definitions will be loaded from YAML files like:
 *
 * ```yaml
 * id: workloads
 * title: Workloads
 * description: View and manage deployed applications
 * icon: Layers
 * route: /workloads
 * storageKey: kubestellar-workloads-cards
 *
 * stats:
 *   type: workloads
 *   collapsedKey: kubestellar-workloads-stats-collapsed
 *
 * defaultCards:
 *   - type: app_status
 *     position: { w: 4, h: 2 }
 *   - type: deployment_status
 *     position: { w: 4, h: 2 }
 *
 * features:
 *   autoRefresh: true
 *   templates: true
 *   addCard: true
 * ```
 */

import { ReactNode, useCallback, useMemo, useState } from 'react'
import {
  DndContext,
  closestCenter,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { DashboardDefinition, NewCardInput } from './types'
import { DashboardTemplate } from '../../components/dashboard/templates'
import { useDashboard } from './dashboardHooks'
import {
  DashboardHeader,
  DashboardCardsSection,
  DashboardEmptyCards,
  DashboardCardsGrid,
  SortableDashboardCard,
  DragPreviewCard,
} from './DashboardComponents'
import { StatsOverview, StatBlockValue } from '../../components/ui/StatsOverview'
import { DashboardStatsType } from '../../components/ui/StatsBlockDefinitions'
import { AddCardModal } from '../../components/dashboard/AddCardModal'
import { TemplatesModal } from '../../components/dashboard/TemplatesModal'
import { ConfigureCardModal } from '../../components/dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../../components/dashboard/FloatingDashboardActions'
import { ClusterDropZone, DraggedWorkload } from '../../components/cards/ClusterDropZone'
import { useDeployWorkload } from '../../hooks/useWorkloads'
import { useToast } from '../../components/ui/Toast'

// ============================================================================
// Dashboard Registry
// ============================================================================

const dashboardRegistry = new Map<string, DashboardDefinition>()

export function registerDashboard(definition: DashboardDefinition) {
  dashboardRegistry.set(definition.id, definition)
}

export function getDashboardDefinition(id: string): DashboardDefinition | undefined {
  return dashboardRegistry.get(id)
}

export function getAllDashboardDefinitions(): DashboardDefinition[] {
  return Array.from(dashboardRegistry.values())
}

// ============================================================================
// Stats Value Getter Registry
// ============================================================================

type StatsValueGetter = (blockId: string, data: unknown) => StatBlockValue
const statsValueGetterRegistry = new Map<string, StatsValueGetter>()

export function registerStatsValueGetter(statsType: string, getter: StatsValueGetter) {
  statsValueGetterRegistry.set(statsType, getter)
}

// ============================================================================
// DashboardRuntime Props
// ============================================================================

export interface DashboardRuntimeProps {
  /** Dashboard definition (from YAML or registry) */
  definition: DashboardDefinition
  /** Data for stats and custom sections */
  data?: unknown
  /** Whether data is loading */
  isLoading?: boolean
  /** Whether data is refreshing */
  isRefreshing?: boolean
  /** Last data update time */
  lastUpdated?: Date
  /** Refresh handler */
  onRefresh?: () => void
  /** Custom content to render below stats */
  children?: ReactNode
  /** Custom stats value getter (if not using registry) */
  getStatValue?: (blockId: string) => StatBlockValue
}

// ============================================================================
// DashboardRuntime Component
// ============================================================================

export function DashboardRuntime({
  definition,
  data,
  isLoading = false,
  isRefreshing = false,
  lastUpdated,
  onRefresh,
  children,
  getStatValue: customGetStatValue,
}: DashboardRuntimeProps) {
  const {
    id: _id,
    title,
    description,
    icon,
    storageKey,
    stats: statsConfig,
    defaultCards,
    features = {},
  } = definition

  const {
    autoRefresh: enableAutoRefresh = true,
    autoRefreshInterval = 30000,
    templates: enableTemplates = true,
    addCard: enableAddCard = true,
    cardSections: enableCardSections = true,
    floatingActions: enableFloatingActions = true,
  } = features

  // Use the combined dashboard hook
  const dashboard = useDashboard({
    storageKey,
    defaultCards,
    onRefresh,
    autoRefreshInterval,
  })

  const {
    cards,
    addCards,
    removeCard,
    configureCard,
    updateCardWidth,
    reset,
    isCustomized,
    dnd,
    showCards,
    setShowCards,
    showAddCard,
    setShowAddCard,
    showTemplates,
    setShowTemplates,
    configuringCard,
    setConfiguringCard: _setConfiguringCard,
    openConfigureCard,
    closeConfigureCard,
    autoRefresh,
    setAutoRefresh,
  } = dashboard

  // Workload drag-drop state for deploying to clusters
  const [draggedWorkload, setDraggedWorkload] = useState<DraggedWorkload | null>(null)
  const deployWorkload = useDeployWorkload()
  const { showToast } = useToast()

  // Extended drag handlers to support workload-to-cluster deployment
  const handleDragStart = useCallback((event: DragStartEvent) => {
    // First call the original handler for card ordering
    dnd.handleDragStart(event)

    // Check if this is a workload being dragged
    const data = event.active.data.current
    if (data?.type === 'workload' && data?.workload) {
      setDraggedWorkload(data.workload)
    }
  }, [dnd])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    // First call the original handler for card ordering
    dnd.handleDragEnd(event)

    // Check if workload was dropped on a cluster
    const activeData = event.active.data.current
    const overData = event.over?.data.current

    if (activeData?.type === 'workload' && overData?.type === 'cluster') {
      const workload = activeData.workload
      const targetCluster = overData.cluster

      // Call deploy API
      handleDeployWorkload(workload, targetCluster)
    }

    // Clear dragged workload state
    setDraggedWorkload(null)
  }, [dnd])

  // Handle deploying workload to cluster
  const handleDeployWorkload = useCallback((
    workload: { name: string; namespace: string; sourceCluster: string },
    targetCluster: string
  ) => {
    deployWorkload.mutate({
      workloadName: workload.name,
      namespace: workload.namespace,
      sourceCluster: workload.sourceCluster,
      targetClusters: [targetCluster],
    }, {
      onSuccess: () => {
        showToast(`Deployed ${workload.name} to ${targetCluster}`, 'success')
      },
      onError: (error: Error) => {
        showToast(`Failed to deploy: ${error.message}`, 'error')
      },
    })
  }, [deployWorkload, showToast])

  // Get stats value getter from registry or props
  const getStatValue = useMemo(() => {
    if (customGetStatValue) return customGetStatValue

    if (statsConfig?.type) {
      const getter = statsValueGetterRegistry.get(statsConfig.type)
      if (getter) {
        return (blockId: string) => getter(blockId, data)
      }
    }

    // Default fallback
    return () => ({ value: '-', sublabel: '' })
  }, [customGetStatValue, statsConfig?.type, data])

  // Handle add cards
  const handleAddCards = useCallback((newCards: Array<{ type: string; title: string; config: Record<string, unknown> }>) => {
    addCards(newCards.map(c => ({
      type: c.type,
      title: c.title,
      config: c.config,
    })))
    if (enableCardSections) {
      setShowCards(true)
    }
    setShowAddCard(false)
  }, [addCards, setShowCards, setShowAddCard, enableCardSections])

  // Handle template apply
  const handleApplyTemplate = useCallback((template: DashboardTemplate) => {
    const newCards: NewCardInput[] = template.cards.map(card => ({
      type: card.card_type,
      title: card.title,
      config: card.config,
    }))

    // Reset and add new cards
    reset()
    addCards(newCards)

    if (enableCardSections) {
      setShowCards(true)
    }
    setShowTemplates(false)
  }, [reset, addCards, setShowCards, setShowTemplates, enableCardSections])

  // Handle card configuration save
  const handleSaveCardConfig = useCallback((cardId: string, config: Record<string, unknown>) => {
    configureCard(cardId, config)
    closeConfigureCard()
  }, [configureCard, closeConfigureCard])

  // Transform configuringCard for modal
  const configureCardForModal = configuringCard ? {
    id: configuringCard.id,
    card_type: configuringCard.card_type,
    config: configuringCard.config,
    title: configuringCard.title,
  } : null

  const hasData = !isLoading || (data !== undefined && data !== null)
  const showSkeletons = isLoading && !hasData

  return (
    <div className="pt-16">
      {/* Header */}
      <DashboardHeader
        title={title}
        description={description}
        icon={icon}
        isRefreshing={isRefreshing}
        autoRefresh={enableAutoRefresh ? autoRefresh : undefined}
        onAutoRefreshChange={enableAutoRefresh ? setAutoRefresh : undefined}
        onRefresh={onRefresh}
        isFetching={isLoading || isRefreshing}
      />

      {/* Stats Overview */}
      {statsConfig && (
        <StatsOverview
          dashboardType={statsConfig.type as DashboardStatsType}
          getStatValue={getStatValue}
          hasData={hasData}
          isLoading={showSkeletons}
          lastUpdated={lastUpdated}
          collapsedStorageKey={statsConfig.collapsedKey}
        />
      )}

      {/* Cards Section */}
      {enableCardSections && (
        <DashboardCardsSection
          title={`${title} Cards`}
          cardCount={cards.length}
          isExpanded={showCards}
          onToggle={() => setShowCards(!showCards)}
        >
          {cards.length === 0 ? (
            <DashboardEmptyCards
              icon={icon}
              title={`${title} Dashboard`}
              description={`Add cards to monitor and manage your ${title.toLowerCase()}.`}
              onAddCards={() => setShowAddCard(true)}
            />
          ) : (
            <DndContext
              sensors={dnd.sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
                <DashboardCardsGrid>
                  {cards.map(card => (
                    <SortableDashboardCard
                      key={card.id}
                      card={card}
                      onConfigure={() => openConfigureCard(card.id, cards)}
                      onRemove={() => removeCard(card.id)}
                      onWidthChange={(w) => updateCardWidth(card.id, w)}
                      isDragging={dnd.activeId === card.id}
                    />
                  ))}
                </DashboardCardsGrid>
              </SortableContext>
              <DragOverlay>
                {dnd.activeId ? (
                  <DragPreviewCard card={cards.find(c => c.id === dnd.activeId)!} />
                ) : null}
              </DragOverlay>
              {/* Cluster drop zone for workload deployment */}
              <ClusterDropZone
                isDragging={draggedWorkload !== null}
                draggedWorkload={draggedWorkload}
                onDeploy={handleDeployWorkload}
              />
            </DndContext>
          )}
        </DashboardCardsSection>
      )}

      {/* Custom content (lists, clusters overview, etc.) */}
      {children}

      {/* Floating Actions */}
      {enableFloatingActions && (
        <FloatingDashboardActions
          onAddCard={() => enableAddCard && setShowAddCard(true)}
          onOpenTemplates={() => enableTemplates && setShowTemplates(true)}
          onResetToDefaults={reset}
          isCustomized={isCustomized}
        />
      )}

      {/* Add Card Modal */}
      {enableAddCard && (
        <AddCardModal
          isOpen={showAddCard}
          onClose={() => setShowAddCard(false)}
          onAddCards={handleAddCards}
          existingCardTypes={cards.map(c => c.card_type)}
        />
      )}

      {/* Templates Modal */}
      {enableTemplates && (
        <TemplatesModal
          isOpen={showTemplates}
          onClose={() => setShowTemplates(false)}
          onApplyTemplate={handleApplyTemplate}
        />
      )}

      {/* Configure Card Modal */}
      <ConfigureCardModal
        isOpen={!!configuringCard}
        card={configureCardForModal}
        onClose={closeConfigureCard}
        onSave={handleSaveCardConfig}
      />
    </div>
  )
}

// ============================================================================
// YAML Parser (future implementation)
// ============================================================================

export function parseDashboardYAML(_yaml: string): DashboardDefinition {
  // TODO: Implement YAML parsing
  throw new Error('YAML parsing not yet implemented. Use registerDashboard() with JS objects.')
}
