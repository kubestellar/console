import { useParams, useLocation } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSidebarConfig } from '../../../hooks/useSidebarConfig'
import { AddCardModal } from '../AddCardModal'
import { ConfigureCardModal } from '../ConfigureCardModal'
import { CardRecommendations } from '../CardRecommendations'
import { MissionSuggestions } from '../MissionSuggestions'
import { TemplatesModal } from '../TemplatesModal'
import { FloatingDashboardActions } from '../FloatingDashboardActions'
import { useModalState } from '../../../lib/modals'
import { StatsOverview } from '../../ui/StatsOverview'
import { DashboardHeader } from '../../shared/DashboardHeader'
import { DashboardHealthIndicator } from '../DashboardHealthIndicator'
import { DashboardEmptyState } from './DashboardEmptyState'
import { DashboardDeleteModal } from './DashboardDeleteModal'
import { CardGrid } from './CardGrid'
import { useDashboardStats } from './useDashboardStats'
import { useDashboardData } from './useDashboardData'
import { useDashboardDragDrop } from './useDashboardDragDrop'

export function CustomDashboard() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const activeDashboardPath = `/custom-dashboard/${id}`
  const isActiveDashboard = location.pathname === activeDashboardPath
  const { config, removeItem } = useSidebarConfig()
  const { t } = useTranslation()

  // Find the sidebar item matching this dashboard to get name/description
  const sidebarItem = [...config.primaryNav, ...config.secondaryNav]
    .find(item => item.href === `/custom-dashboard/${id}`)

  const { deduplicatedClusters, isClustersLoading, getDashboardStatValue } = useDashboardStats()

  // Modal states
  const { isOpen: isAddCardOpen, open: openAddCard, close: closeAddCard } = useModalState()
  const { isOpen: isConfigureCardOpen, open: openConfigureCard, close: closeConfigureCard } = useModalState()
  const { isOpen: isTemplatesOpen, open: openTemplates, close: closeTemplates } = useModalState()
  const { isOpen: isDeleteConfirmOpen, open: openDeleteConfirm, close: closeDeleteConfirm } = useModalState()

  const {
    dashboard,
    cards,
    setCards,
    cardsRef,
    isLoading,
    isRefreshing,
    isFetching,
    autoRefresh,
    setAutoRefresh,
    lastUpdated,
    triggerRefresh,
    selectedCard,
    setSelectedCard,
    setInsertAtIndex,
    snapshot,
    undo,
    redo,
    canUndo,
    canRedo,
    handleExportDashboard,
    handleImportDashboard,
    handleAddCards,
    handleRemoveCard,
    handleConfigureCard,
    handleCardConfigured,
    handleWidthChange,
    handleHeightChange,
    handleApplyTemplate,
    handleAddRecommendedCard,
    handleReset,
    handleDeleteDashboard,
  } = useDashboardData({ id, isActiveDashboard, sidebarItem, removeItem, t })

  const { activeId, sensors, collisionDetection, handleDragStart, handleDragEnd } =
    useDashboardDragDrop(cardsRef, setCards, snapshot)

  // Current card types for recommendations
  const currentCardTypes = cards.map(c => {
    if (c.card_type === 'dynamic_card' && c.config?.dynamicCardId) {
      return `dynamic_card::${c.config.dynamicCardId as string}`
    }
    return c.card_type
  })

  // Loading skeleton
  if (isLoading && cards.length === 0) {
    return (
      <div className="pt-16">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-secondary/50 rounded" />
          <div className="h-4 w-96 bg-secondary/30 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="col-span-4 h-48 bg-secondary/30 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-16">
      {/* Header - name from sidebar item takes priority for consistency */}
      <DashboardHeader
        title={sidebarItem?.name || dashboard?.name || 'Custom Dashboard'}
        subtitle={sidebarItem?.description || (cards.length === 0
          ? 'Add cards to start monitoring your clusters'
          : `${cards.length} card${cards.length !== 1 ? 's' : ''}`
        )}
        isFetching={isFetching}
        onRefresh={triggerRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        lastUpdated={lastUpdated}
        showTimestamp={false}
        afterTitle={<DashboardHealthIndicator />}
        rightExtra={
          <button
            onClick={() => openDeleteConfirm()}
            className="p-2 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
            title={t('dashboard.delete.title')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        }
      />

      {/* Stats Overview */}
      <StatsOverview
        dashboardType="dashboard"
        getStatValue={getDashboardStatValue}
        hasData={deduplicatedClusters.length > 0}
        isLoading={isClustersLoading && deduplicatedClusters.length === 0}
        lastUpdated={lastUpdated}
        collapsedStorageKey={`kubestellar-custom-${id}-stats-collapsed`}
      />

      {/* AI Recommendations - always shown to help users add relevant cards */}
      <CardRecommendations
        currentCardTypes={currentCardTypes}
        onAddCard={(cardType, config) => handleAddRecommendedCard(cardType, config, closeAddCard)}
      />

      {/* Mission Suggestions */}
      <MissionSuggestions />

      {/* Empty state or card grid */}
      {cards.length === 0 ? (
        <DashboardEmptyState
          onAddCard={() => openAddCard()}
          onOpenTemplates={() => openTemplates()}
        />
      ) : (
        <CardGrid
          cards={cards}
          activeId={activeId}
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          isRefreshing={isRefreshing}
          lastUpdated={lastUpdated}
          onRefresh={triggerRefresh}
          onConfigure={(card) => handleConfigureCard(card, openConfigureCard)}
          onRemove={handleRemoveCard}
          onWidthChange={handleWidthChange}
          onHeightChange={handleHeightChange}
          onInsertBefore={(index) => { setInsertAtIndex(index); openAddCard() }}
          onInsertAfter={(index) => { setInsertAtIndex(index); openAddCard() }}
        />
      )}

      {/* Floating action buttons */}
      <FloatingDashboardActions
        onAddCard={() => openAddCard()}
        onOpenTemplates={() => openTemplates()}
        onResetToDefaults={handleReset}
        isCustomized={cards.length > 0}
        onExport={id ? handleExportDashboard : undefined}
        onImport={handleImportDashboard}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      {/* Add Card Modal */}
      <AddCardModal
        isOpen={isAddCardOpen}
        onClose={() => { closeAddCard(); setInsertAtIndex(null) }}
        onAddCards={(newCards) => handleAddCards(newCards, closeAddCard)}
        existingCardTypes={currentCardTypes}
      />

      {/* Configure Card Modal */}
      <ConfigureCardModal
        isOpen={isConfigureCardOpen}
        card={selectedCard}
        onClose={() => {
          closeConfigureCard()
          setSelectedCard(null)
        }}
        onSave={(cardId, config) => handleCardConfigured(cardId, config, closeConfigureCard)}
      />

      {/* Templates Modal */}
      <TemplatesModal
        isOpen={isTemplatesOpen}
        onClose={closeTemplates}
        onApplyTemplate={(template) => handleApplyTemplate(template, closeTemplates)}
      />

      {/* Delete Confirmation Modal */}
      <DashboardDeleteModal
        isOpen={isDeleteConfirmOpen}
        onClose={closeDeleteConfirm}
        onConfirm={() => {
          closeDeleteConfirm()
          handleDeleteDashboard()
        }}
        dashboardName={sidebarItem?.name || dashboard?.name || 'this dashboard'}
      />
    </div>
  )
}
