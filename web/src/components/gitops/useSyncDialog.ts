import { useState, useEffect, useRef, startTransition } from 'react'
import { FETCH_DEFAULT_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../lib/constants'
import { getStoredAuthToken } from '../../lib/authToken'
import { agentFetch } from '../../hooks/mcp/shared'
import type { SyncPhase, DriftedResource, SyncPlan, SyncLogEntry } from './SyncDialog.parts'

interface UseSyncDialogProps {
  isOpen: boolean
  appName: string
  namespace: string
  cluster: string
  repoUrl: string
  path: string
  onSyncComplete: () => void
  onClose: () => void
}

export function useSyncDialog({ isOpen, appName, namespace, cluster, repoUrl, path, onSyncComplete, onClose }: UseSyncDialogProps) {
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
      status }
    setSyncLogs(prev => [...prev, entry])
  }

  const updateLastLog = (status: SyncLogEntry['status']) => {
    setSyncLogs(prev => {
      if (prev.length === 0) return prev
      const updated = [...prev]
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
          ...(token && { 'Authorization': `Bearer ${token}` }) },
        body: JSON.stringify({ repoUrl, path, cluster, namespace }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })

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
          clusterValue: 'cluster state' }]
        setDriftedResources(genericDrift)
        addLog('Drift detected (see raw diff)', 'success')
      } else {
        addLog('No drift detected - cluster is in sync', 'success')
        setDriftedResources([])
      }

      if (data.tokensUsed) {
        setTokenCount(prev => prev + data.tokensUsed)
      }

      setPhase('plan')
    } catch (err: unknown) {
      updateLastLog('error')
      const message = err instanceof Error ? err.message : 'Detection failed'
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
      runDetection()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (phase === 'plan' && driftedResources.length > 0) {
      const plan: SyncPlan[] = driftedResources.map(r => ({
        action: 'update' as const,
        resource: `${r.kind}/${r.name}`,
        details: `${r.field}: ${r.clusterValue} → ${r.gitValue}` }))
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
          ...(token && { 'Authorization': `Bearer ${token}` }) },
        body: JSON.stringify({ repoUrl, path, cluster, namespace }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })

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
        for (const e of data.errors) {
          addLog(`✗ ${e}`, 'error')
        }
      }

      if (data.tokensUsed) {
        setTokenCount(prev => prev + data.tokensUsed)
      }

      if (data.success) {
        addLog('Sync complete!', 'success')
        setPhase('complete')
      } else {
        addLog(`Sync failed: ${data.message}`, 'error')
        setError(data.message)
      }
    } catch (err: unknown) {
      updateLastLog('error')
      const message = err instanceof Error ? err.message : 'Sync failed'
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

  const isSyncing = phase === 'plan' || phase === 'execution'

  return {
    phase,
    driftedResources,
    syncPlan,
    syncLogs,
    tokenCount,
    error,
    isInitializing,
    logContainerRef,
    isSyncing,
    runSync,
    handleClose,
  }
}
