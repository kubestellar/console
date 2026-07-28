import { useCallback, useEffect, useState } from 'react'
import { useMissions } from '../../../../../hooks/useMissions'
import { useDrillDown } from '../../../../../hooks/useDrillDown'
import { useCanI } from '../../../../../hooks/usePermissions'
import { useToast } from '../../../../ui/Toast'
import { useTranslation } from 'react-i18next'
import type { PodDeleteRepairActionProps } from './types'

export function usePodDeleteRepairActions({
  cluster,
  namespace,
  podName,
  status,
  restarts,
  issues,
  agentConnected,
  backendActionUnavailable,
  backendUnavailableMessage,
  ownerChain,
  openTrackedWs,
  parseWsMessage,
}: PodDeleteRepairActionProps) {
  const { t } = useTranslation()
  const { startMission } = useMissions()
  const { close: closeDrillDown } = useDrillDown()
  const { checkPermission } = useCanI()
  const { showToast } = useToast()

  const [canDeletePod, setCanDeletePod] = useState<boolean | null>(null)
  const [deletingPod, setDeletingPod] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showDeletePodConfirm, setShowDeletePodConfirm] = useState(false)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (backendActionUnavailable) {
        if (!cancelled) setCanDeletePod(false)
        return
      }
      try {
        const result = await checkPermission({
          cluster,
          verb: 'delete',
          resource: 'pods',
          namespace,
        })
        if (!cancelled) setCanDeletePod(result.allowed)
      } catch {
        if (!cancelled) setCanDeletePod(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [backendActionUnavailable, cluster, namespace, checkPermission])

  const isManagedPod = ownerChain.some(owner =>
    ['ReplicaSet', 'Deployment', 'StatefulSet', 'DaemonSet', 'Job'].includes(owner.kind),
  )

  const handleRepairPod = useCallback((checkKeyAndRun: (fn: () => void) => void) => {
    if (backendActionUnavailable) {
      showToast(backendUnavailableMessage, 'error')
      return
    }
    checkKeyAndRun(() => {
      closeDrillDown()
      startMission({
        title: `Repair Pod ${podName}`,
        description: `Diagnose and fix issues with pod ${podName}`,
        type: 'repair',
        cluster,
        initialPrompt: `I need help diagnosing and repairing issues with pod "${podName}" in namespace "${namespace}" on cluster "${cluster}".

Current Status: ${status}
Restarts: ${restarts}
${issues.length > 0 ? `Issues: ${issues.join(', ')}` : ''}

Please:
1. Investigate the root cause — check pod logs, events, and configuration.
2. Tell me what you found, then ask:
   - "Should I apply the fix?"
   - "Show me more details first"
3. If I say fix it, apply and verify. Then ask:
   - "Should I check for related issues?"
   - "All done"`,
        context: {
          podName,
          namespace,
          cluster,
          status,
          restarts,
          issues,
        },
      })
    })
  }, [backendActionUnavailable, backendUnavailableMessage, showToast, closeDrillDown, startMission, podName, namespace, cluster, status, restarts, issues])

  const handleDeletePod = useCallback(async () => {
    if (backendActionUnavailable) {
      setDeleteError(backendUnavailableMessage)
      showToast(backendUnavailableMessage, 'error')
      return
    }
    if (!agentConnected || !canDeletePod) return

    setDeletingPod(true)
    setDeleteError(null)

    try {
      const ws = await openTrackedWs()
      const requestId = `delete-pod-${Date.now()}`

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, args: ['delete', 'pod', podName, '-n', namespace] },
        }))
      }

      ws.onmessage = (event: MessageEvent) => {
        const msg = parseWsMessage(event, 'delete pod')
        if (!msg) {
          setDeleteError(t('drilldown.errors.failedToParseResponse'))
          setDeletingPod(false)
          ws.close()
          return
        }

        if (msg.id === requestId) {
          if (msg.type === 'error' || msg.payload?.exitCode !== 0) {
            setDeleteError(msg.payload?.error || t('drilldown.errors.failedToDeletePod'))
          } else {
            showToast(t('drilldown.success.podDeleted', { name: podName }), 'success')
            closeDrillDown()
          }
        }
        ws.close()
        setDeletingPod(false)
      }

      ws.onerror = () => {
        setDeleteError('Connection error')
        setDeletingPod(false)
        ws.close()
      }
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Unknown error')
      setDeletingPod(false)
    }
  }, [backendActionUnavailable, backendUnavailableMessage, showToast, agentConnected, canDeletePod, openTrackedWs, parseWsMessage, cluster, podName, namespace, closeDrillDown, t])

  return {
    canDeletePod,
    deletingPod,
    deleteError,
    showDeletePodConfirm,
    setShowDeletePodConfirm,
    isManagedPod,
    handleRepairPod,
    handleDeletePod,
  }
}
