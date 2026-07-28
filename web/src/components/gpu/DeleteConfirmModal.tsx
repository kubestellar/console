import { Trash2, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BaseModal } from '../../lib/modals'
import type { GPUReservation } from '../../hooks/useGPUReservations'

interface DeleteConfirmModalProps {
  deleteConfirmReservation: GPUReservation | null
  isDeleting: boolean
  onClose: () => void
  onConfirmDelete: () => void
}

export function DeleteConfirmModal({
  deleteConfirmReservation,
  isDeleting,
  onClose,
  onConfirmDelete,
}: DeleteConfirmModalProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <BaseModal isOpen={!!deleteConfirmReservation} onClose={onClose} size="sm" closeOnBackdrop={false} closeOnEscape={true}>
      <BaseModal.Header title={t('gpuReservations.delete.title')} icon={Trash2} onClose={onClose} showBack={false} />
      <BaseModal.Content>
        <div className="text-muted-foreground">
          {t('gpuReservations.delete.confirmMessage')} <strong className="text-foreground">{deleteConfirmReservation?.title}</strong>?
        </div>
        <div className="text-sm text-red-400 mt-2">
          {t('gpuReservations.delete.cannotUndo')}
        </div>
      </BaseModal.Content>
      <BaseModal.Footer>
        <div className="flex-1" />
        <div className="flex gap-3">
          {([
            { key: 'cancel', label: t('gpuReservations.delete.cancel'), onClick: onClose, disabled: false, className: 'px-4 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors' },
            { key: 'delete', label: t('gpuReservations.delete.delete'), onClick: onConfirmDelete, disabled: isDeleting, className: 'flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors' },
          ] as const).map(({ key, label, onClick, disabled, className }) => (
            <button key={key} onClick={onClick} disabled={disabled} className={className}>
              {key === 'delete' && isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
              {label}
            </button>
          ))}
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
