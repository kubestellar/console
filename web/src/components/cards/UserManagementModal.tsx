import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '../../lib/modals'

// Split helper component; parent card owns useCardLoadingState.

interface DeleteUserConfirmModalProps {
  userId: string | null
  onClose: () => void
  onConfirm: (userId: string) => Promise<void>
}

export function DeleteUserConfirmModal({ userId, onClose, onConfirm }: DeleteUserConfirmModalProps) {
  const { t } = useTranslation(['cards', 'common'])
  const [isDeleting, setIsDeleting] = useState(false)
  const isOpen = userId !== null

  if (!isOpen) return null

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      isLoading={isDeleting}
      onConfirm={async () => {
        if (userId) {
          setIsDeleting(true)
          try {
            await onConfirm(userId)
          } finally {
            setIsDeleting(false)
            onClose()
          }
        }
      }}
      title={t('userManagement.deleteUser')}
      message={t('userManagement.confirmDelete')}
      confirmLabel={t('common:actions.delete')}
      cancelLabel={t('common:actions.cancel')}
      variant="danger"
    />
  )
}
