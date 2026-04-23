import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { BaseModal } from '../../lib/modals'
import type { NamespaceDetails } from './types'

interface DeleteConfirmModalProps {
  namespace: NamespaceDetails
  onClose: () => void
  onConfirm: () => void
}

export function DeleteConfirmModal({ namespace, onClose, onConfirm }: DeleteConfirmModalProps) {
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const canDelete = confirmText === namespace.name

  const handleDelete = async () => {
    if (!canDelete) return
    setDeleting(true)
    await onConfirm()
  }

  return (
    <BaseModal isOpen={true} onClose={onClose} size="md">
      <BaseModal.Header
        title="Delete Namespace"
        description="This action cannot be undone"
        icon={Trash2}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content>
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-sm text-red-300">
            You are about to delete namespace <strong>&quot;{namespace.name}&quot;</strong> from cluster <strong>&quot;{namespace.cluster}&quot;</strong>.
            This will permanently delete all resources within the namespace.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">
            Type <span className="text-red-400 font-mono">{namespace.name}</span> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Enter namespace name"
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-red-500/50"
          />
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <div className="flex-1" />
        <div className="flex gap-3">
          <Button
            variant="ghost"
            size="lg"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="lg"
            onClick={handleDelete}
            disabled={!canDelete || deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Namespace'}
          </Button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
