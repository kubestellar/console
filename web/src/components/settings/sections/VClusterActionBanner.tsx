import { useState, useEffect } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Check, AlertTriangle, Loader2, X } from 'lucide-react'
import { CLUSTER_PROGRESS_AUTO_DISMISS_MS } from '../../../hooks/useClusterProgress'
import { friendlyErrorMessage } from '../../../lib/clusterErrors'
import type { VClusterActionFeedback } from '../../../hooks/useLocalClusterTools'

function getVClusterActionMessage(feedback: VClusterActionFeedback, t: TFunction): string {
  const keyBase = `settings.localClusters.vclusterFeedback.${feedback.action}.${feedback.state}`

  if (feedback.state === 'error') {
    return feedback.message
      ? friendlyErrorMessage(feedback.message)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : String(t(`${keyBase}Fallback` as any, { name: feedback.name, namespace: feedback.namespace }))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return String(t(keyBase as any, { name: feedback.name, namespace: feedback.namespace }))
}

/** Inline feedback banner for vCluster create/connect/disconnect/delete operations. */
export function VClusterActionBanner({
  feedback,
  onDismiss,
}: {
  feedback: VClusterActionFeedback | null
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (feedback) {
      setVisible(true)
    }
  }, [feedback])

  useEffect(() => {
    if (feedback?.state === 'success') {
      const timer = setTimeout(() => {
        setVisible(false)
        onDismiss()
      }, CLUSTER_PROGRESS_AUTO_DISMISS_MS)
      return () => clearTimeout(timer)
    }
  }, [feedback?.state, onDismiss])

  if (!visible || !feedback) return null

  const isPending = feedback.state === 'pending'
  const isSuccess = feedback.state === 'success'
  const isError = feedback.state === 'error'

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm mb-4 ${
        isSuccess
          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
          : isError
            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
            : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
      }`}
      role="status"
      aria-live="polite"
    >
      {isPending && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
      {isSuccess && <Check className="w-4 h-4 shrink-0" />}
      {isError && <AlertTriangle className="w-4 h-4 shrink-0" />}

      <span className="flex-1">{getVClusterActionMessage(feedback, t)}</span>

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
