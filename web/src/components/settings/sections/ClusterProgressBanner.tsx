import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, AlertTriangle, Loader2, X } from 'lucide-react'
import { CLUSTER_PROGRESS_AUTO_DISMISS_MS } from '../../../hooks/useClusterProgress'
import { friendlyErrorMessage } from '../../../lib/clusterErrors'
import type { ClusterProgress } from '../../../hooks/useClusterProgress'

/** Inline progress feedback for create/delete operations. */
export function ClusterProgressBanner({
  progress,
  onDismiss,
  isStale,
}: {
  progress: ClusterProgress | null
  onDismiss: () => void
  isStale: boolean
}) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (progress) {
      setVisible(true)
    }
  }, [progress])

  // Auto-dismiss after success
  useEffect(() => {
    if (progress?.status === 'done') {
      const timer = setTimeout(() => {
        setVisible(false)
        onDismiss()
      }, CLUSTER_PROGRESS_AUTO_DISMISS_MS)
      return () => clearTimeout(timer)
    }
  }, [progress?.status, onDismiss])

  if (!visible || !progress) return null

  const isActive = !['done', 'failed'].includes(progress.status)
  const isDone = progress.status === 'done'
  const isFailed = progress.status === 'failed'

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm mb-4 ${
        isDone
          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
          : isFailed
            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
            : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
      }`}
      role="status"
      aria-live="polite"
    >
      {isActive && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
      {isDone && <Check className="w-4 h-4 shrink-0" />}
      {isFailed && <AlertTriangle className="w-4 h-4 shrink-0" />}

      <span className="flex-1">
        {isFailed && isStale
          ? t('settings.localClusters.connectionStale')
          : isFailed
            ? friendlyErrorMessage(progress.message)
            : progress.message}
      </span>

      {isActive && (
        <div className="w-24 bg-secondary rounded-full h-1.5 shrink-0">
          <div
            className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${progress.progress}%` }}
          />
        </div>
      )}

      <button
        onClick={() => {
          setVisible(false)
          onDismiss()
        }}
        className="p-1 hover:bg-secondary/50 rounded shrink-0"
        aria-label={t('actions.dismiss')}
        title={t('actions.dismiss')}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
