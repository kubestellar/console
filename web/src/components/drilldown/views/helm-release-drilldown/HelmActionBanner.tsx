import { AlertTriangle, CheckCircle, Loader2, RotateCcw, Trash2, XCircle } from 'lucide-react'
import { cn } from '../../../../lib/cn'
import type { ConfirmActionState } from './types'

export interface HelmActionFeedbackBannerProps {
  actionFeedback: { success: boolean; message: string } | null
}

export function HelmActionFeedbackBanner({ actionFeedback }: HelmActionFeedbackBannerProps) {
  if (!actionFeedback) return null

  return (
    <div className={cn(
      'mx-6 mb-2 px-4 py-2 rounded-lg flex items-center gap-2 text-sm',
      actionFeedback.success
        ? 'bg-green-500/10 border border-green-500/20 text-green-400'
        : 'bg-red-500/10 border border-red-500/20 text-red-400',
    )}>
      {actionFeedback.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {actionFeedback.message}
    </div>
  )
}

export interface HelmConfirmActionBannerProps {
  confirmAction: ConfirmActionState | null
  releaseName: string
  namespace: string
  helmActionLoading: boolean
  onCancel: () => void
  onConfirmRollback: (revision: number) => void
  onConfirmUninstall: () => void
}

export function HelmConfirmActionBanner({
  confirmAction,
  releaseName,
  namespace,
  helmActionLoading,
  onCancel,
  onConfirmRollback,
  onConfirmUninstall,
}: HelmConfirmActionBannerProps) {
  if (!confirmAction) return null

  return (
    <div className="mx-6 mb-2 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-5 h-5 text-yellow-400" />
        <span className="font-medium text-yellow-400">Confirm {confirmAction.type}</span>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        {confirmAction.type === 'rollback'
          ? `Roll back "${releaseName}" to revision ${confirmAction.revision}? This will create a new revision.`
          : `Uninstall "${releaseName}" from ${namespace}? This will remove all associated resources.`}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (confirmAction.type === 'rollback' && confirmAction.revision) {
              onConfirmRollback(confirmAction.revision)
            } else if (confirmAction.type === 'uninstall') {
              onConfirmUninstall()
            }
          }}
          disabled={helmActionLoading}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50',
            confirmAction.type === 'uninstall'
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30',
          )}
        >
          {helmActionLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : confirmAction.type === 'rollback' ? (
            <RotateCcw className="w-4 h-4" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
          {helmActionLoading ? 'Processing...' : confirmAction.label}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
