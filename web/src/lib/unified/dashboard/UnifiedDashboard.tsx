/**
 * UnifiedDashboard - Single component that renders any dashboard from config
 *
 * This component accepts a UnifiedDashboardConfig and renders a complete
 * dashboard with stats, cards, and optional features like drag-drop and
 * card management.
 *
 * State, persistence and mutation handlers live in
 * ./hooks/useUnifiedDashboardState; the layout sections live in
 * ./components/* (split tracked by #22979).
 *
 * Usage:
 *   <UnifiedDashboard config={mainDashboardConfig} />
 */

import type { UnifiedDashboardProps } from '../types'
import { UnifiedStatsSection } from '../stats'
import { DashboardGrid } from './DashboardGrid'
import { DashboardHeader } from './components/DashboardHeader'
import { DashboardTabBar } from './components/DashboardTabBar'
import { DashboardEmptyState } from './components/DashboardEmptyState'
import { DashboardOverlays } from './components/DashboardOverlays'
import { useUnifiedDashboardState } from './hooks/useUnifiedDashboardState'

/**
 * UnifiedDashboard - Renders a complete dashboard from config
 */
export function UnifiedDashboard({
  config,
  statsData,
  className = '' }: UnifiedDashboardProps) {
  const {
    hasTabs,
    cards,
    activeCards,
    activeTabId,
    setActiveTabId,
    dashboardError,
    isLoading,
    lastUpdated,
    isCustomized,
    addCardModal,
    configureCardModal,
    cardToEdit,
    setCardToEdit,
    showResetConfirm,
    setShowResetConfirm,
    showRemoveCardConfirm,
    setShowRemoveCardConfirm,
    cardToRemove,
    setCardToRemove,
    handleReorder,
    handleTabListKeyDown,
    handleRemoveCard,
    handleRemoveCardConfirmed,
    handleConfigureCard,
    handleRefresh,
    handleAddCard,
    handleAddCards,
    handleSaveCardConfig,
    handleResetRequest,
    handleResetConfirmed,
  } = useUnifiedDashboardState(config)

  // Features with defaults
  const features = config.features || {}

  return (
    <div className={`p-4 md:p-6 ${className}`}>
      {/* Dashboard header */}
      <DashboardHeader
        name={config.name}
        subtitle={config.subtitle}
        features={features}
        isLoading={isLoading}
        lastUpdated={lastUpdated}
        isCustomized={isCustomized}
        onRefresh={handleRefresh}
        onAddCard={handleAddCard}
        onResetRequest={handleResetRequest}
      />

      {dashboardError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {dashboardError}
        </div>
      )}

      {/* Stats section */}
      {config.stats && (
        <UnifiedStatsSection
          config={config.stats}
          data={statsData}
          hasData={!!statsData}
          isLoading={isLoading}
          lastUpdated={lastUpdated}
          className="mb-6"
        />
      )}

      {/* Tab bar (when dashboard has tabs) */}
      {hasTabs && config.tabs && (
        <DashboardTabBar
          tabs={config.tabs}
          activeTabId={activeTabId}
          onSelectTab={setActiveTabId}
          onKeyDown={handleTabListKeyDown}
        />
      )}

      {/* Cards grid */}
      <DashboardGrid
        cards={activeCards}
        features={features}
        onReorder={features.dragDrop !== false ? handleReorder : undefined}
        onRemoveCard={handleRemoveCard}
        onConfigureCard={handleConfigureCard}
        isLoading={isLoading}
      />

      {/* Empty state — only show when no tabs and no cards */}
      {cards.length === 0 && !hasTabs && (
        <DashboardEmptyState
          canAddCard={features.addCard !== false}
          onAddCard={handleAddCard}
        />
      )}

      <DashboardOverlays
        isAddCardOpen={addCardModal.isOpen}
        onCloseAddCard={addCardModal.close}
        onAddCards={handleAddCards}
        existingCardTypes={activeCards.map((c) => c.cardType)}
        isConfigureCardOpen={configureCardModal.isOpen}
        cardToEdit={cardToEdit}
        onCloseConfigureCard={() => {
          configureCardModal.close()
          setCardToEdit(null)
        }}
        onSaveCardConfig={handleSaveCardConfig}
        showResetConfirm={showResetConfirm}
        onCloseResetConfirm={() => setShowResetConfirm(false)}
        onResetConfirmed={handleResetConfirmed}
        showRemoveCardConfirm={showRemoveCardConfirm}
        cardToRemove={cardToRemove}
        onCloseRemoveCardConfirm={() => {
          setShowRemoveCardConfirm(false)
          setCardToRemove(null)
        }}
        onRemoveCardConfirmed={handleRemoveCardConfirmed}
      />
    </div>
  )
}

export default UnifiedDashboard
