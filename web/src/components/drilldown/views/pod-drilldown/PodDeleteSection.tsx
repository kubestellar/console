import { Loader2, Trash2 } from 'lucide-react'
import { cn } from '../../../../lib/cn'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '../../../../lib/modals'

export interface PodDeleteSectionProps {
  podName: string
  agentConnected: boolean
  backendUnavailable?: boolean
  canDeletePod: boolean | null
  deletingPod: boolean
  deleteError: string | null
  showDeletePodConfirm: boolean
  setShowDeletePodConfirm: (v: boolean) => void
  isManagedPod: boolean
  handleDeletePod: () => void
}

export function PodDeleteSection({
  podName,
  agentConnected,
  backendUnavailable,
  canDeletePod,
  deletingPod,
  deleteError,
  showDeletePodConfirm,
  setShowDeletePodConfirm,
  isManagedPod,
  handleDeletePod,
}: PodDeleteSectionProps) {
  const { t } = useTranslation()

  return (
    <>
      {/* Delete Pod button */}
      <div className="px-4 pb-4">
        {deleteError && (
          <div className="mb-2 p-2 rounded bg-red-500/20 border border-red-500/30 text-red-300 text-sm">
            {deleteError}
          </div>
        )}
        <button
          onClick={() => setShowDeletePodConfirm(true)}
          disabled={!agentConnected || backendUnavailable || canDeletePod === false || deletingPod}
          title={
            backendUnavailable
              ? t('layout.connectionLostHint')
              : !agentConnected
              ? 'Agent not connected'
              : canDeletePod === false
              ? 'No permission to delete pods in this namespace'
              : canDeletePod === null
              ? 'Checking permissions...'
              : isManagedPod
              ? 'Delete pod (will be recreated by controller)'
              : 'Delete pod (will NOT be recreated)'
          }
          className={cn(
            'w-full py-2.5 px-4 rounded-lg transition-all flex items-center justify-center gap-2 text-sm font-medium',
            canDeletePod === false || !agentConnected || backendUnavailable
              ? 'bg-secondary/30 text-muted-foreground cursor-not-allowed opacity-50'
              : 'bg-red-600/20 text-red-300 hover:bg-red-500/30 border border-red-500/40 hover:border-red-500/60'
          )}
        >
          {deletingPod ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t('common.deleting')}</span>
            </>
          ) : canDeletePod === null ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t('drilldown.status.checkingPermissions')}</span>
            </>
          ) : (
            <>
              <Trash2 className="w-4 h-4" />
              <span>{t('drilldown.actions.deletePod')}</span>
              {isManagedPod && (
                <span className="text-xs text-red-400/60">{t('drilldown.status.willBeRecreated')}</span>
              )}
            </>
          )}
        </button>
      </div>

      <ConfirmDialog
        isOpen={showDeletePodConfirm}
        onClose={() => setShowDeletePodConfirm(false)}
        onConfirm={() => {
          setShowDeletePodConfirm(false)
          handleDeletePod()
        }}
        title={t('drilldown.actions.deletePod')}
        message={
          isManagedPod
            ? t('drilldown.confirmDelete.managedPod', { name: podName })
            : t('drilldown.confirmDelete.unmanagedPod', { name: podName })
        }
        confirmLabel={t('drilldown.actions.deletePod')}
        variant="danger"
      />
    </>
  )
}
