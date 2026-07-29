import { useState, useEffect, useRef, startTransition } from 'react'
import { useTranslation } from 'react-i18next'
import { GitBranch, Loader2 } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { FETCH_DEFAULT_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../lib/constants'
import { getStoredAuthToken } from '../../lib/authToken'
import { agentFetch } from '../../hooks/mcp/shared'
import {
  type DriftedResource,
  type SyncLogEntry,
  type SyncPhase,
  type SyncPlan,
  SyncPhaseIndicator,
  SyncResourcePreview,
  SyncConsoleOutput,
  SyncConfirmationFooter,
} from './SyncDialog.parts'

interface SyncDialogProps {
  isOpen: boolean
  onClose: () => void
  appName: string
  namespace: string
  cluster: string
  repoUrl: string
  path: string
  onSyncComplete: () => void
}

export function SyncDialog({
  isOpen,
  onClose,
  appName,
  namespace,
  cluster,
  repoUrl,
  path,
  onSyncComplete,
}: SyncDialogProps) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<SyncPhase>('detection')
  const [driftedResources, setDriftedResources] = useState<DriftedResource[]>([])
  const [syncPlan, setSyncPlan] = useState<SyncPlan[]>([])
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([])
  const [tokenCount, setTokenCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(false)
  const logContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [syncLogs])

  const addLog = (message: string, status: SyncLogEntry['status'] = 'pending') => {
    const entry: SyncLogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      message,
      status,
    }
    setSyncLogs(previous => [...previous, entry])
  }

  const updateLastLog = (status: SyncLogEntry['status']) => {
    setSyncLogs(previous => {
      if (previous.length === 0) return previous
      const updated = [...previous]
      updated[updated.length - 1] = { ...updated[updated.length - 1], status }
      return updated
    })
  }

  const runDetection = async () => {
    setIsInitializing(true)
    addLog('Connecting to cluster...', 'running')

    try {
      const token = await getStoredAuthToken()
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/gitops/detect-drift`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ repoUrl, path, cluster, namespace }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      updateLastLog('success')
      addLog('Analyzing drift...', 'running')

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to detect drift')
      }

      const data = await response.json()
      updateLastLog('success')

      if (data.resources && data.resources.length > 0) {
        setDriftedResources(data.resources)
        addLog(`Found ${data.resources.length} drifted resources`, 'success')
      } else if (data.drifted) {
        const genericDrift: DriftedResource[] = [{
          kind: 'Resource',
          name: appName,
          namespace,
          field: 'configuration',
          gitValue: 'git state',
          clusterValue: 'cluster state',
        }]
        setDriftedResources(genericDrift)
        addLog('Drift detected (see raw diff)', 'success')
      } else {
        addLog('No drift detected - cluster is in sync', 'success')
        setDriftedResources([])
      }

      if (data.tokensUsed) {
        setTokenCount(previous => previous + data.tokensUsed)
      }

      setPhase('plan')
    } catch (detectedError: unknown) {
      updateLastLog('error')
      const message = detectedError instanceof Error ? detectedError.message : 'Detection failed'
      addLog(`Error: ${message}`, 'error')
      setError(message)
    } finally {
      setIsInitializing(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      setError(null)
      startTransition(() => {
        setPhase('detection')
        setDriftedResources([])
        setSyncPlan([])
        setSyncLogs([])
        setTokenCount(0)
      })
      void runDetection()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (phase === 'plan' && driftedResources.length > 0) {
      const plan: SyncPlan[] = driftedResources.map(resource => ({
        action: 'update' as const,
        resource: `${resource.kind}/${resource.name}`,
        details: `${resource.field}: ${resource.clusterValue} → ${resource.gitValue}`,
      }))
      setSyncPlan(plan)
    }
  }, [phase, driftedResources])

  const runSync = async () => {
    setPhase('execution')
    addLog('Starting sync...', 'running')

    try {
      const token = await getStoredAuthToken()
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/gitops/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ repoUrl, path, cluster, namespace }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      updateLastLog('success')

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Sync failed')
      }

      const data = await response.json()

      if (data.applied && data.applied.length > 0) {
        for (const resource of data.applied) {
          addLog(`✓ ${resource}`, 'success')
        }
      }

      if (data.errors && data.errors.length > 0) {
        for (const syncError of data.errors) {
          addLog(`✗ ${syncError}`, 'error')
        }
      }

      if (data.tokensUsed) {
        setTokenCount(previous => previous + data.tokensUsed)
      }

      if (data.success) {
        addLog('Sync complete!', 'success')
        setPhase('complete')
      } else {
        addLog(`Sync failed: ${data.message}`, 'error')
        setError(data.message)
      }
    } catch (syncError: unknown) {
      updateLastLog('error')
      const message = syncError instanceof Error ? syncError.message : 'Sync failed'
      addLog(`Error: ${message}`, 'error')
      setError(message)
    }
  }

  const handleClose = () => {
    if (phase === 'complete') {
      onSyncComplete()
    }
    onClose()
  }

  const phaseProgress: Record<SyncPhase, number> = {
    detection: 1,
    plan: 2,
    execution: 3,
    complete: 4,
  }

  const isSyncing = phase === 'plan' || phase === 'execution'

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} size="lg" closeOnBackdrop={!isSyncing} closeOnEscape={!isSyncing}>
      <BaseModal.Header
        title={`GitOps Sync: ${appName}`}
        description={`${namespace} • ${cluster}`}
        icon={GitBranch}
        onClose={handleClose}
        showBack={false}
      />

      <SyncPhaseIndicator phase={phase} phaseProgress={phaseProgress} />

      <BaseModal.Content className="max-h-[400px]">
        {isInitializing && phase === 'detection' && syncLogs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <p className="text-sm text-muted-foreground">Initializing drift detection...</p>
          </div>
        )}

        {phase === 'detection' && syncLogs.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t('gitops.detectingDrift')}</span>
            </div>
          </div>
        )}

        {phase === 'plan' && (
          <SyncResourcePreview driftedResources={driftedResources} syncPlan={syncPlan} />
        )}

        {(phase === 'execution' || phase === 'complete') && (
          <SyncConsoleOutput tokenCount={tokenCount} syncLogs={syncLogs} logContainerRef={logContainerRef} />
        )}

        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
            {error}
          </div>
        )}
      </BaseModal.Content>

      <BaseModal.Footer>
        <SyncConfirmationFooter
          phase={phase}
          repoUrl={repoUrl}
          path={path}
          onClose={handleClose}
          onRunSync={runSync}
        />
      </BaseModal.Footer>
    </BaseModal>
  )
}
