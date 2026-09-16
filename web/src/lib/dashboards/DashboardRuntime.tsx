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

import { ReactNode, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  DragOverlay } from '@dnd-kit/core'
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
  DragPreviewCard } from './DashboardComponents'
import { StatsOverview, StatBlockValue } from '../../components/ui/StatsOverview'
import { DashboardStatsType } from '../../components/ui/StatsBlockDefinitions'
import { AddCardModal } from '../../components/dashboard/AddCardModal'
import { TemplatesModal } from '../../components/dashboard/TemplatesModal'
import { ConfigureCardModal } from '../../components/dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../../components/dashboard/FloatingDashboardActions'
import { ClusterDropZone } from '../../components/cards/ClusterDropZone'
import { useWorkloadDragDeploy } from './hooks/useWorkloadDragDeploy'
import {
  DASHBOARD_DEFAULT_REFRESH_MS,
  resolveStatsValueGetter } from './dashboardRegistry'

// Re-exported so existing importers (dashboards/index.ts, lib/index.ts,
// registry.ts, tests) keep working after the registry moved to its own module.
export {
  registerDashboard,
  getDashboardDefinition,
  getAllDashboardDefinitions,
  registerStatsValueGetter,
  parseDashboardYAML,
} from './dashboardRegistry'

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
  getStatValue: customGetStatValue }: DashboardRuntimeProps) {
  const location = useLocation()
  const mountedRouteRef = useRef(location.pathname)
  const {
    title,
    description,
    icon,
    storageKey,
    stats: statsConfig,
    defaultCards,
    features = {} } = definition

  const {
    autoRefresh: enableAutoRefresh = true,
    autoRefreshInterval = DASHBOARD_DEFAULT_REFRESH_MS,
    templates: enableTemplates = true,
    addCard: enableAddCard = true,
    cardSections: enableCardSections = true,
    floatingActions: enableFloatingActions = true } = features

  // Use the combined dashboard hook
  const dashboard = useDashboard({
    storageKey,
    defaultCards,
    isActive: location.pathname === mountedRouteRef.current,
    onRefresh,
    autoRefreshInterval })

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
    dnd,
    showCards,
    setShowCards,
    showAddCard,
    setShowAddCard,
    showTemplates,
    setShowTemplates,
    configuringCard,
    setConfiguringCard: __setConfiguringCard,
    openConfigureCard,
    closeConfigureCard,
    autoRefresh,
    setAutoRefresh,
    undo,
    redo,
    canUndo,
    canRedo } = dashboard

  // Inline card insertion
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null)
  const insertAtIndexRef = useRef<number | null>(null)
  insertAtIndexRef.current = insertAtIndex

  // Workload drag-drop state for deploying to clusters
  const { draggedWorkload, handleDragStart, handleDragEnd, handleDeployWorkload } =
    useWorkloadDragDeploy(dnd)

  // Get stats value getter from registry or props
  const getStatValue = resolveStatsValueGetter(statsConfig?.type, data, customGetStatValue)

  // Handle add cards (supports inline insertion at a specific index)
  const handleAddCards = (newCards: Array<{ type: string; title: string; config: Record<string, unknown> }>) => {
    const idx = insertAtIndexRef.current
    if (idx !== null) {
      // Insert at specific position
      const cardsToAdd = newCards.map(c => ({
        id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        card_type: c.type,
        config: c.config || {},
        title: c.title }))
      setCards(prev => [...prev.slice(0, idx), ...cardsToAdd, ...prev.slice(idx)])
      setInsertAtIndex(null)
    } else {
      addCards(newCards.map(c => ({
        type: c.type,
        title: c.title,
        config: c.config })))
    }
    if (enableCardSections) {
      setShowCards(true)
    }
    setShowAddCard(false)
  }

  // Handle template apply
  const handleApplyTemplate = (template: DashboardTemplate) => {
    const newCards: NewCardInput[] = template.cards.map(card => ({
      type: card.card_type,
      title: card.title,
      config: card.config }))

    // Reset and add new cards
    reset()
    addCards(newCards)

    if (enableCardSections) {
      setShowCards(true)
    }
    setShowTemplates(false)
  }

  // Handle card configuration save
  const handleSaveCardConfig = (cardId: string, config: Record<string, unknown>) => {
    configureCard(cardId, config)
    closeConfigureCard()
  }

  // Transform configuringCard for modal
  const configureCardForModal = configuringCard ? {
    id: configuringCard.id,
    card_type: configuringCard.card_type,
    config: configuringCard.config,
    title: configuringCard.title } : null

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
                  {cards.map((card, index) => (
                    <SortableDashboardCard
                      key={card.id}
                      card={card}
                      onConfigure={() => openConfigureCard(card.id)}
                      onRemove={() => removeCard(card.id)}
                      onWidthChange={(w) => updateCardWidth(card.id, w)}
                      onHeightChange={(h) => updateCardHeight(card.id, h)}
                      isDragging={dnd.activeId === card.id}
                      onInsertBefore={() => { setInsertAtIndex(index); setShowAddCard(true) }}
                      onInsertAfter={() => { setInsertAtIndex(index + 1); setShowAddCard(true) }}
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
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
      )}

      {/* Add Card Modal */}
      {enableAddCard && (
        <AddCardModal
          isOpen={showAddCard}
          onClose={() => { setShowAddCard(false); setInsertAtIndex(null) }}
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
