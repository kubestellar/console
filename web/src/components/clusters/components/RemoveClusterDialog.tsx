import { useState } from 'react'
import { Loader2, Trash2, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BaseModal } from '../../../lib/modals'

interface RemoveClusterDialogProps {
  isOpen?: boolean
  /** Context name as stored in kubeconfig (what the backend needs) */
  contextName: string
  /** Friendly display name shown to the user */
  displayName: string
  onClose: () => void
  /** Resolves on success, rejects with an Error on failure */
  onConfirm: (contextName: string) => Promise<void>
}

/**
 * Confirmation dialog for removing an offline cluster's kubeconfig context.
 *
 * Implements issue #5901: the backend endpoint for removing a stale kubeconfig
 * context (`/kubeconfig/remove`) was added in #5658 but there was no UI affordance
 * to invoke it. This dialog is surfaced from the cluster card's "Remove cluster"
 * button, which only appears for unreachable clusters.
 */
export function RemoveClusterDialog({
  isOpen = true,
  contextName,
  displayName,
  onClose,
  onConfirm }: RemoveClusterDialogProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<{ removing: boolean; error: string | null }>({
    removing: false,
    error: null })

  const handleConfirm = async () => {
    setStatus({ removing: true, error: null })
    try {
      await onConfirm(contextName)
      onClose()
    } catch (err) {
      setStatus({
        removing: false,
        error: err instanceof Error ? err.message : t('cluster.removeClusterError') })
    }
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="sm" closeOnBackdrop={!status.removing}>
      <BaseModal.Header
        title={t('cluster.removeClusterTitle')}
        icon={Trash2}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content>
        <div className="flex items-start gap-3 mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <p className="text-sm text-yellow-200">
            {t('cluster.removeClusterWarning')}
          </p>
        </div>

        <p className="text-sm text-muted-foreground mb-2">
          {t('cluster.removeClusterContext')}
        </p>
        <p className="text-foreground font-mono text-xs break-all mb-4">{displayName}</p>

        {status.error && (
          <p className="text-sm text-red-400 mb-2" role="alert">
            {status.error}
          </p>
        )}

        <p className="text-xs text-muted-foreground">{t('cluster.removeClusterDesc')}</p>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints>
        <div className="flex-1" />
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={status.removing}
            className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={status.removing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-red-500/80 text-white hover:bg-red-500 disabled:opacity-50"
            aria-label={t('cluster.removeClusterConfirm')}
          >
            {status.removing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                {t('cluster.removeClusterRemoving')}
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                {t('cluster.removeClusterConfirm')}
              </>
            )}
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
