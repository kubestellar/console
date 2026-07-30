import { Trash2 } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { Button } from '../ui/Button'
import type { QuotaDeleteTarget } from './NamespaceQuotas.types'

// Split helper component; parent card owns useCardLoadingState.

interface NamespaceQuotasDeleteModalProps {
  deleteConfirm: QuotaDeleteTarget | null
  onClose: () => void
  onDelete: (target: QuotaDeleteTarget) => void
  isLoading: boolean
}

export function NamespaceQuotasDeleteModal({
  deleteConfirm,
  onClose,
  onDelete,
  isLoading,
}: NamespaceQuotasDeleteModalProps) {
  return (
    <BaseModal isOpen={!!deleteConfirm} onClose={onClose} size="md">
      <BaseModal.Header
        title="Delete ResourceQuota?"
        icon={Trash2}
        onClose={onClose}
        showBack={false}
      />
      <BaseModal.Content>
        <p className="text-sm text-muted-foreground mb-4">
          Are you sure you want to delete the quota{' '}
          <span className="text-yellow-400">{deleteConfirm?.name}</span> from{' '}
          <span className="text-blue-400">{deleteConfirm?.namespace}</span> in{' '}
          <span className="text-foreground">{deleteConfirm?.cluster}</span>?
        </p>
        <p className="text-sm text-red-400">
          This action cannot be undone. Pods and deployments will no longer be constrained by this quota.
        </p>
      </BaseModal.Content>
      <BaseModal.Footer>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="lg"
            onClick={() => deleteConfirm && onDelete(deleteConfirm)}
            disabled={isLoading}
            loading={isLoading}
          >
            Delete
          </Button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
