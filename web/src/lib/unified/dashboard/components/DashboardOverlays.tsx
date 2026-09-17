/**
 * DashboardOverlays - add/configure card modals and confirmation dialogs
 * rendered by UnifiedDashboard.
 *
 * Extracted verbatim from UnifiedDashboard.tsx (#22979).
 */

import { useTranslation } from 'react-i18next'
import { AddCardModal } from '../../../../components/dashboard/AddCardModal'
import { ConfigureCardModal } from '../../../../components/dashboard/ConfigureCardModal'
import { ConfirmDialog } from '../../../modals'
import type { CardSuggestion, ConfigurableCard } from '../UnifiedDashboard.types'

export interface DashboardOverlaysProps {
  isAddCardOpen: boolean
  onCloseAddCard: () => void
  onAddCards: (cards: CardSuggestion[]) => void
  existingCardTypes: string[]
  isConfigureCardOpen: boolean
  cardToEdit: ConfigurableCard | null
  onCloseConfigureCard: () => void
  onSaveCardConfig: (cardId: string, newConfig: Record<string, unknown>, title?: string) => void
  showResetConfirm: boolean
  onCloseResetConfirm: () => void
  onResetConfirmed: () => void
  showRemoveCardConfirm: boolean
  cardToRemove: { id: string; title?: string } | null
  onCloseRemoveCardConfirm: () => void
  onRemoveCardConfirmed: () => void
}

export function DashboardOverlays({
  isAddCardOpen,
  onCloseAddCard,
  onAddCards,
  existingCardTypes,
  isConfigureCardOpen,
  cardToEdit,
  onCloseConfigureCard,
  onSaveCardConfig,
  showResetConfirm,
  onCloseResetConfirm,
  onResetConfirmed,
  showRemoveCardConfirm,
  cardToRemove,
  onCloseRemoveCardConfirm,
  onRemoveCardConfirmed }: DashboardOverlaysProps) {
  const { t } = useTranslation('common')

  return (
    <>
      {/* Add Card Modal */}
      <AddCardModal
        isOpen={isAddCardOpen}
        onClose={onCloseAddCard}
        onAddCards={onAddCards}
        existingCardTypes={existingCardTypes}
      />

      {/* Configure Card Modal */}
      <ConfigureCardModal
        isOpen={isConfigureCardOpen}
        card={cardToEdit}
        onClose={onCloseConfigureCard}
        onSave={onSaveCardConfig}
      />

      {/* Reset Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        onClose={onCloseResetConfirm}
        onConfirm={onResetConfirmed}
        title={t('confirmDialog.resetDashboardTitle')}
        message={t('confirmDialog.resetDashboardMessage')}
        confirmLabel={t('actions.reset')}
        variant="warning"
      />

      {/* Remove Card Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showRemoveCardConfirm}
        onClose={onCloseRemoveCardConfirm}
        onConfirm={onRemoveCardConfirmed}
        title={t('confirmDialog.removeCardTitle')}
        message={cardToRemove?.title
          ? t('confirmDialog.removeCardMessageWithTitle', { title: cardToRemove.title })
          : t('confirmDialog.removeCardMessage')}
        confirmLabel={t('actions.remove')}
        variant="danger"
      />
    </>
  )
}
