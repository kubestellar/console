import { Suspense } from 'react'
import { safeLazy } from '../../lib/safeLazy'
import { WidgetExportModal } from '../widgets/WidgetExportModal'
import { DeployConfirmDialog } from '../deploy/DeployConfirmDialog'
import type { DashboardState } from './DashboardState'

const DashboardCustomizer = safeLazy(() => import('./customizer/DashboardCustomizer'), 'DashboardCustomizer')
const ConfigureCardModal = safeLazy(() => import('./ConfigureCardModal'), 'ConfigureCardModal')

type DashboardModalsProps = Pick<DashboardState,
  'addCardSearch' |
  'canRedo' |
  'canUndo' |
  'dashboard' |
  'handleAddCards' |
  'handleApplyTemplate' |
  'handleCardConfigured' |
  'handleCloseConfigureCard' |
  'handleCloseCustomizer' |
  'handleCloseWidgetExport' |
  'handleConfirmDeploy' |
  'handleCreateCardFromAI' |
  'handleExportDashboard' |
  'handleSetPendingDeploy' |
  'isAddCardModalOpen' |
  'isConfigureCardOpen' |
  'isCustomized' |
  'isWidgetExportOpen' |
  'localCards' |
  'pendingDeploy' |
  'redo' |
  'reset' |
  'selectedCard' |
  'studioInitialSection' |
  'studioWidgetCardType' |
  'undo'>

export function DashboardModals({
  addCardSearch,
  canRedo,
  canUndo,
  dashboard,
  handleAddCards,
  handleApplyTemplate,
  handleCardConfigured,
  handleCloseConfigureCard,
  handleCloseCustomizer,
  handleCloseWidgetExport,
  handleConfirmDeploy,
  handleCreateCardFromAI,
  handleExportDashboard,
  handleSetPendingDeploy,
  isAddCardModalOpen,
  isConfigureCardOpen,
  isCustomized,
  isWidgetExportOpen,
  localCards,
  pendingDeploy,
  redo,
  reset,
  selectedCard,
  studioInitialSection,
  studioWidgetCardType,
  undo,
}: DashboardModalsProps) {
  const currentCardTypes = localCards.map(card => {
    if (card.card_type === 'dynamic_card' && card.config?.dynamicCardId) {
      return `dynamic_card::${card.config.dynamicCardId as string}`
    }
    return card.card_type
  })

  return (
    <>
      <Suspense fallback={null}>
        <DashboardCustomizer
          isOpen={isAddCardModalOpen}
          onClose={handleCloseCustomizer}
          dashboardName={dashboard?.name || 'Main Dashboard'}
          onAddCards={handleAddCards}
          existingCardTypes={currentCardTypes}
          initialSection={studioInitialSection}
          initialWidgetCardType={studioWidgetCardType}
          initialSearch={addCardSearch}
          onApplyTemplate={handleApplyTemplate}
          onExport={handleExportDashboard}
          onReset={() => reset('replace')}
          isCustomized={isCustomized}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
      </Suspense>

      <Suspense fallback={null}>
        <ConfigureCardModal
          isOpen={isConfigureCardOpen}
          card={selectedCard}
          onClose={handleCloseConfigureCard}
          onSave={handleCardConfigured}
          onCreateCard={handleCreateCardFromAI}
        />
      </Suspense>

      <WidgetExportModal
        isOpen={isWidgetExportOpen}
        onClose={handleCloseWidgetExport}
      />

      <DeployConfirmDialog
        isOpen={pendingDeploy !== null}
        onClose={() => handleSetPendingDeploy(null)}
        onConfirm={handleConfirmDeploy}
        workloadName={pendingDeploy?.workloadName ?? ''}
        namespace={pendingDeploy?.namespace ?? ''}
        sourceCluster={pendingDeploy?.sourceCluster ?? ''}
        targetClusters={pendingDeploy?.targetClusters ?? []}
        groupName={pendingDeploy?.groupName}
      />
    </>
  )
}
