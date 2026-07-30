/**
 * Widget Export Modal
 *
 * Allows users to export dashboard cards as standalone desktop widgets
 * for Übersicht (macOS) and other platforms.
 */

import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BaseModal } from '../../../lib/modals'
import { WidgetExportModalParts } from './WidgetExportModalContent.parts'

interface WidgetExportModalProps {
  isOpen: boolean
  onClose: () => void
  cardType?: string
  mode?: 'card' | 'stat' | 'template' | 'picker'
  /** When true, renders content inline without BaseModal wrapper (used by Console Studio) */
  embedded?: boolean
}

export function WidgetExportModal({
  isOpen,
  onClose,
  cardType,
  mode: _mode = 'picker',
  embedded = false
}: WidgetExportModalProps) {
  const { t } = useTranslation('common')
  const widgetContent = <WidgetExportModalParts cardType={cardType} />

  if (embedded) {
    return (
      <div className="h-full flex flex-col overflow-hidden p-4">
        {widgetContent}
      </div>
    )
  }

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
    >
      <BaseModal.Header
        title={t('widgets.exportDesktopWidget')}
        icon={Download}
        onClose={onClose}
      />
      <BaseModal.Content>{widgetContent}</BaseModal.Content>
    </BaseModal>
  )
}

export default WidgetExportModal
