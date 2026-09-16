import { ReactNode } from 'react'
import { type DragEndEvent } from '@dnd-kit/core'
import { getIcon } from '../icons'
import type { DashboardCard, DashboardCardPlacement } from './types'
import { ConfigureCardModal } from '../../components/dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../../components/dashboard/FloatingDashboardActions'
import { DashboardCustomizer } from '../../components/dashboard/customizer/DashboardCustomizer'
import { StatsOverview, StatBlockValue } from '../../components/ui/StatsOverview'
import { DashboardStatsType } from '../../components/ui/StatsBlockDefinitions'
import { DashboardHeader } from '../../components/shared/DashboardHeader'
import { DashboardHealthIndicator } from '../../components/dashboard/DashboardHealthIndicator'
import { EmptyStateAction } from '../../components/ui/EmptyState'
import { useDashboardPageState } from './hooks/useDashboardPageState'
import { DashboardPageCardsSection } from './components/DashboardPageCardsSection'

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
  /** Machine-readable live route state for semantic canary tests. */
  routeState?: 'loaded' | 'partial' | 'unavailable' | 'empty'
  /** Dashboard-specific content (rendered below cards) */
  children?: ReactNode
  /** Content rendered between stats and cards section (e.g., tabs, filters) */
  beforeCards?: ReactNode
  /** Extra content to render in header row (e.g., selectors, filters) */
  headerExtra?: ReactNode
  /** Extra content rendered after the title (e.g., a page-specific health badge) */
  afterTitle?: ReactNode
  /** Extra content rendered on the right side of the header (e.g., action buttons) */
  rightExtra?: ReactNode
  /** Empty state configuration for no cards. An optional `action` (primary CTA)
   *  and `secondaryAction` surface next-step guidance — see issue 6392. */
  emptyState?: {
    title: string
    description: ReactNode
    action?: EmptyStateAction
    secondaryAction?: EmptyStateAction
  }
  /** Whether this dashboard shows demo/mock data */
  isDemoData?: boolean
  /** Custom drag-end handler (called after card reorder, e.g. for workload drops) */
  onDragEnd?: (event: DragEndEvent) => void
  /**
   * Optional `data-testid` applied to the outer page wrapper. Pages that
   * embed DashboardPage (Clusters, Events, etc.) can pass a route-specific
   * id so cross-browser Playwright specs have a stable mount selector that
   * survives refactors. See issue 9344 — Clusters.spec.ts expects
   * `clusters-page` but the testid was lost when the page migrated to
   * DashboardPage.
   */
  testId?: string
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
  routeState,
  children,
  beforeCards,
  headerExtra,
  afterTitle,
  rightExtra,
  emptyState,
  isDemoData = false,
  onDragEnd: externalDragEnd,
  testId = 'dashboard-page' }: DashboardPageProps) {
  const Icon = getIcon(icon)

  const {
    dashboardRef,
    dashboardWidth,
    cardsGridRef,
    useCompactGrid,
    loadMoreRef,
    isFetching,
    isRefreshing,
    liveRouteState,
    cards,
    visibleCards,
    shouldVirtualizeCards,
    showCards,
    setShowCards,
    getStatValue,
    sensors,
    collisionDetection,
    handleDragStart,
    handleDragEnd,
    activeId,
    activeDragData,
    handleRemoveCard,
    handleConfigureCard,
    handleSaveCardConfig,
    handleWidthChange,
    handleHeightChange,
    handleAddCards,
    applyTemplate,
    setInsertAtIndex,
    showAddCard,
    setShowAddCard,
    addCardSearch,
    setAddCardSearch,
    customizerInitialSection,
    setCustomizerInitialSection,
    widgetCardType,
    setWidgetCardType,
    handleOpenCustomizer,
    defaultEmptyStateAction,
    configuringCard,
    setConfiguringCard,
    configureCardData,
    autoRefresh,
    setAutoRefresh,
    handleRefresh,
    triggerRefresh,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
    isCustomized } = useDashboardPageState({
      storageKey,
      defaultCards,
      customGetStatValue,
      onRefresh,
      isLoading,
      externalRefreshing,
      hasData,
      error,
      routeState,
      onDragEnd: externalDragEnd })

  // Insert a new card before/after the given index and open the add-card modal.
  const handleInsertCard = (index: number | null) => {
    setInsertAtIndex(index)
    setShowAddCard(true)
  }

  // Default empty state text
  const emptyTitle = emptyState?.title || `${title} Dashboard`
  const emptyDescription = emptyState?.description || `Add cards to monitor your ${title.toLowerCase()} across clusters.`

  return (
    // Fragment wrapper: the overflow-x-hidden div prevents wide inline content
    // from pushing the page past the viewport (issues 6385, 6387, 6394), but
    // fixed-position children (FAB, customizer, modals) must live OUTSIDE it
    // to avoid clipping when ancestors create a new containing block (issue 8464).
    <>
      <div ref={dashboardRef} className="pt-4 min-w-0 max-w-full overflow-x-hidden" data-testid={testId} data-live-route-state={liveRouteState} data-live-source="k8s">
        {/* Header */}
        <DashboardHeader
          title={title}
          subtitle={subtitle}
          icon={<Icon className="w-6 h-6 text-purple-400" />}
          isFetching={isFetching}
          onRefresh={handleRefresh}
          autoRefresh={autoRefresh}
          onAutoRefreshChange={setAutoRefresh}
          autoRefreshId={`${storageKey}-auto-refresh`}
          lastUpdated={lastUpdated}
          showTimestamp={false}
          error={error}
          afterTitle={afterTitle ?? <DashboardHealthIndicator />}
          rightExtra={rightExtra}
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
        <DashboardPageCardsSection
          title={title}
          Icon={Icon}
          cards={cards}
          visibleCards={visibleCards}
          shouldVirtualizeCards={shouldVirtualizeCards}
          loadMoreRef={loadMoreRef}
          showCards={showCards}
          onToggleShowCards={() => setShowCards(!showCards)}
          emptyState={emptyState}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          defaultEmptyStateAction={defaultEmptyStateAction}
          sensors={sensors}
          collisionDetection={collisionDetection}
          handleDragStart={handleDragStart}
          handleDragEnd={handleDragEnd}
          activeId={activeId}
          activeDragData={activeDragData}
          cardsGridRef={cardsGridRef}
          onConfigureCard={handleConfigureCard}
          onRemoveCard={handleRemoveCard}
          onWidthChange={handleWidthChange}
          onHeightChange={handleHeightChange}
          isRefreshing={isRefreshing}
          onCardRefresh={triggerRefresh}
          lastUpdated={lastUpdated}
          useCompactGrid={useCompactGrid}
          onInsertCard={handleInsertCard}
          dashboardWidth={dashboardWidth}
        />

        {/* Dashboard-specific content */}
        {children}
      </div>

      {/* Fixed-position elements rendered outside overflow-x-hidden to prevent
        viewport clipping (issue 8464). Parent overflow + ancestor transforms
        can create a new containing block that clips position:fixed children. */}

      {/* Floating action button — opens Dashboard Studio */}
      <FloatingDashboardActions
        onOpenCustomizer={handleOpenCustomizer}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      {/* Dashboard Studio — unified customization panel */}
      <DashboardCustomizer
        isOpen={showAddCard}
        onClose={() => { setShowAddCard(false); setAddCardSearch(''); setInsertAtIndex(null); setCustomizerInitialSection(undefined); setWidgetCardType(undefined) }}
        dashboardName={title}
        onAddCards={handleAddCards}
        existingCardTypes={cards.map(c => c.card_type)}
        initialSection={customizerInitialSection}
        initialSearch={addCardSearch}
        initialWidgetCardType={widgetCardType}
        onApplyTemplate={applyTemplate}
        /* onExport not available on generic DashboardPage — only on Dashboard.tsx */
        onReset={reset}
        isCustomized={isCustomized}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      {/* Configure Card Modal */}
      <ConfigureCardModal
        isOpen={!!configuringCard}
        card={configureCardData}
        onClose={() => setConfiguringCard(null)}
        onSave={handleSaveCardConfig}
      />
    </>
  )
}

// Re-export for convenience
export type { DashboardCardPlacement, DashboardCard }
