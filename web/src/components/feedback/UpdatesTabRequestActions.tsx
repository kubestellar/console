import { Loader2, RefreshCw } from 'lucide-react'
import type { CloseRequestInput } from '../../hooks/useFeatureRequests'

export function RequestActions({
  requestId,
  canPerformActions,
  isLoading,
  showConfirm,
  onRequestUpdate,
  onCloseRequest,
  onSetConfirmClose,
  onShowLoginPrompt,
}: {
  requestId: string
  canPerformActions: boolean
  isLoading: boolean
  showConfirm: boolean
  onRequestUpdate: (id: string) => Promise<void>
  onCloseRequest: (id: string, input?: CloseRequestInput) => Promise<boolean>
  onSetConfirmClose: (id: string | null) => void
  onShowLoginPrompt: () => void
}) {
  return (
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
      {!canPerformActions ? (
        <>
          <button
            onClick={onShowLoginPrompt}
            className="px-2 py-1 text-xs rounded bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors flex items-center gap-1"
            title="Please login to request updates"
          >
            <RefreshCw className="w-3 h-3" />
            Request Update
          </button>
          <button
            onClick={onShowLoginPrompt}
            className="px-2 py-1 text-xs rounded text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            title="Please login to close requests"
          >
            Close
          </button>
        </>
      ) : showConfirm ? (
        <>
          <span className="text-xs text-muted-foreground">Close this request?</span>
          <button
            onClick={() => void onCloseRequest(requestId)}
            disabled={isLoading}
            className="px-2 py-1 text-xs rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Closing...' : 'Confirm'}
          </button>
          <button
            onClick={() => onSetConfirmClose(null)}
            className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 text-muted-foreground transition-colors"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => void onRequestUpdate(requestId)}
            disabled={isLoading}
            className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Request Update
          </button>
          <button
            onClick={() => onSetConfirmClose(requestId)}
            className="px-2 py-1 text-xs rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Close
          </button>
        </>
      )}
    </div>
  )
}
