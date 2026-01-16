import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Check, AlertTriangle, Play, Loader2, ChevronRight, GitBranch, Box, Server, Shield, Settings, Database, Network, Layers, Container, FileText, Puzzle } from 'lucide-react'

// Sync phases
type SyncPhase = 'detection' | 'plan' | 'execution' | 'complete'

// Get icon for Kubernetes resource kind
function getResourceIcon(kind: string) {
  const k = kind?.toLowerCase() || ''
  if (k.includes('deployment')) return <Box className="w-4 h-4 text-blue-400" />
  if (k.includes('service')) return <Network className="w-4 h-4 text-green-400" />
  if (k.includes('pod')) return <Container className="w-4 h-4 text-cyan-400" />
  if (k.includes('configmap')) return <Settings className="w-4 h-4 text-purple-400" />
  if (k.includes('secret')) return <Shield className="w-4 h-4 text-red-400" />
  if (k.includes('serviceaccount')) return <Server className="w-4 h-4 text-orange-400" />
  if (k.includes('role') || k.includes('clusterrole')) return <Shield className="w-4 h-4 text-yellow-400" />
  if (k.includes('customresourcedefinition') || k.includes('crd')) return <Puzzle className="w-4 h-4 text-pink-400" />
  if (k.includes('namespace')) return <Layers className="w-4 h-4 text-indigo-400" />
  if (k.includes('persistentvolume') || k.includes('pvc')) return <Database className="w-4 h-4 text-teal-400" />
  if (k.includes('ingress')) return <Network className="w-4 h-4 text-emerald-400" />
  if (k.includes('statefulset') || k.includes('daemonset') || k.includes('replicaset')) return <Layers className="w-4 h-4 text-blue-400" />
  if (k.includes('job') || k.includes('cronjob')) return <Settings className="w-4 h-4 text-amber-400" />
  if (k.includes('webhook')) return <Network className="w-4 h-4 text-violet-400" />
  return <FileText className="w-4 h-4 text-yellow-500" />
}

// Format resource kind for display
function formatResourceKind(kind: string): string {
  if (!kind) return 'Resource'
  // Common abbreviations
  if (kind.toLowerCase() === 'customresourcedefinition') return 'CRD'
  if (kind.toLowerCase() === 'serviceaccount') return 'ServiceAccount'
  if (kind.toLowerCase() === 'clusterrole') return 'ClusterRole'
  if (kind.toLowerCase() === 'clusterrolebinding') return 'ClusterRoleBinding'
  return kind
}

interface DriftedResource {
  kind: string
  name: string
  namespace: string
  field: string
  gitValue: string
  clusterValue: string
}

interface SyncPlan {
  action: 'create' | 'update' | 'delete'
  resource: string
  details: string
}

interface SyncLogEntry {
  timestamp: string
  message: string
  status: 'pending' | 'running' | 'success' | 'error'
}

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
  const [phase, setPhase] = useState<SyncPhase>('detection')
  const [driftedResources, setDriftedResources] = useState<DriftedResource[]>([])
  const [syncPlan, setSyncPlan] = useState<SyncPlan[]>([])
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([])
  const [tokenCount, setTokenCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const logContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [syncLogs])

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setPhase('detection')
      setDriftedResources([])
      setSyncPlan([])
      setSyncLogs([])
      setTokenCount(0)
      setError(null)
      // Start detection
      runDetection()
    }
  }, [isOpen])

  const addLog = useCallback((message: string, status: SyncLogEntry['status'] = 'pending') => {
    const entry: SyncLogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      message,
      status,
    }
    setSyncLogs(prev => [...prev, entry])
  }, [])

  const updateLastLog = useCallback((status: SyncLogEntry['status']) => {
    setSyncLogs(prev => {
      if (prev.length === 0) return prev
      const updated = [...prev]
      updated[updated.length - 1] = { ...updated[updated.length - 1], status }
      return updated
    })
  }, [])

  // Phase 1: Detection
  const runDetection = useCallback(async () => {
    addLog('Connecting to cluster...', 'running')

    try {
      // Call the real API endpoint
      const token = localStorage.getItem('token')
      const response = await fetch('/api/gitops/detect-drift', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify({
          repoUrl,
          path,
          cluster,
          namespace,
        }),
      })

      updateLastLog('success')
      addLog('Analyzing drift...', 'running')

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to detect drift')
      }

      const data = await response.json()
      updateLastLog('success')

      // Parse the response
      if (data.resources && data.resources.length > 0) {
        setDriftedResources(data.resources)
        addLog(`Found ${data.resources.length} drifted resources`, 'success')
      } else if (data.drifted) {
        // Fallback: create a generic drift entry from raw diff
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
        setTokenCount(prev => prev + data.tokensUsed)
      }

      setPhase('plan')
    } catch (err) {
      updateLastLog('error')
      const message = err instanceof Error ? err.message : 'Detection failed'
      addLog(`Error: ${message}`, 'error')
      setError(message)
    }
  }, [appName, namespace, cluster, repoUrl, path, addLog, updateLastLog])

  // Phase 2: Generate Plan
  useEffect(() => {
    if (phase === 'plan' && driftedResources.length > 0) {
      const plan: SyncPlan[] = driftedResources.map(r => ({
        action: 'update' as const,
        resource: `${r.kind}/${r.name}`,
        details: `${r.field}: ${r.clusterValue} → ${r.gitValue}`,
      }))
      setSyncPlan(plan)
    }
  }, [phase, driftedResources])

  // Phase 3: Execute Sync
  const runSync = useCallback(async () => {
    setPhase('execution')
    addLog('Starting sync...', 'running')

    try {
      // Call the real sync API
      const token = localStorage.getItem('token')
      const response = await fetch('/api/gitops/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify({
          repoUrl,
          path,
          cluster,
          namespace,
        }),
      })

      updateLastLog('success')

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Sync failed')
      }

      const data = await response.json()

      // Log applied resources
      if (data.applied && data.applied.length > 0) {
        for (const resource of data.applied) {
          addLog(`✓ ${resource}`, 'success')
        }
      }

      // Log any errors
      if (data.errors && data.errors.length > 0) {
        for (const error of data.errors) {
          addLog(`✗ ${error}`, 'error')
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
    } catch (err) {
      updateLastLog('error')
      const message = err instanceof Error ? err.message : 'Sync failed'
      addLog(`Error: ${message}`, 'error')
      setError(message)
    }
  }, [cluster, namespace, repoUrl, path, addLog, updateLastLog])

  const handleClose = () => {
    if (phase === 'complete') {
      onSyncComplete()
    }
    onClose()
  }

  if (!isOpen) return null

  const phaseProgress = {
    detection: 1,
    plan: 2,
    execution: 3,
    complete: 4,
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-2xl mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <GitBranch className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold text-foreground">GitOps Sync: {appName}</h2>
              <p className="text-sm text-muted-foreground">{namespace} • {cluster}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Phase Indicator */}
        <div className="px-6 py-3 bg-muted/30 border-b border-border">
          <div className="flex items-center justify-between text-sm">
            {['Detection', 'Plan', 'Execute', 'Complete'].map((label, i) => {
              const stepNum = i + 1
              const isActive = phaseProgress[phase] === stepNum
              const isComplete = phaseProgress[phase] > stepNum

              return (
                <div key={label} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
                    ${isComplete ? 'bg-green-500 text-white' :
                      isActive ? 'bg-primary text-primary-foreground' :
                      'bg-muted text-muted-foreground'}`}
                  >
                    {isComplete ? <Check className="w-3 h-3" /> : stepNum}
                  </div>
                  <span className={isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                    {label}
                  </span>
                  {i < 3 && <ChevronRight className="w-4 h-4 text-muted-foreground mx-2" />}
                </div>
              )
            })}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[400px] overflow-y-auto">
          {/* Detection Phase */}
          {phase === 'detection' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Detecting drift...</span>
              </div>
            </div>
          )}

          {/* Plan Phase */}
          {phase === 'plan' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  Drift Detected ({driftedResources.length} resources)
                </h3>
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  {driftedResources.map((r, i) => (
                    <div key={i} className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                      <div className="flex items-center gap-2 text-sm">
                        {getResourceIcon(r.kind)}
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-card text-muted-foreground">
                          {formatResourceKind(r.kind)}
                        </span>
                        <span className="font-medium text-foreground truncate">{r.name}</span>
                      </div>
                      {(r.field || r.clusterValue || r.gitValue) && (
                        <div className="mt-2 text-xs font-mono pl-6">
                          {r.field && <span className="text-muted-foreground">{r.field}: </span>}
                          {r.clusterValue && <span className="text-red-400 line-through">{r.clusterValue}</span>}
                          {r.clusterValue && r.gitValue && <span className="text-muted-foreground"> → </span>}
                          {r.gitValue && <span className="text-green-400">{r.gitValue}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-foreground mb-3">Sync Plan ({syncPlan.length} changes)</h3>
                <div className="space-y-1 max-h-[120px] overflow-y-auto">
                  {syncPlan.map((item, i) => {
                    const [kind, name] = item.resource.includes('/') ? item.resource.split('/') : ['Resource', item.resource]
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm py-1">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          item.action === 'create' ? 'bg-green-500/20 text-green-400' :
                          item.action === 'delete' ? 'bg-red-500/20 text-red-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          {item.action.toUpperCase()}
                        </span>
                        {getResourceIcon(kind)}
                        <span className="text-muted-foreground text-xs">{formatResourceKind(kind)}</span>
                        <span className="text-foreground truncate">{name}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Execution Phase */}
          {(phase === 'execution' || phase === 'complete') && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Console Output</span>
                <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
                  Tokens: {tokenCount.toLocaleString()}
                </span>
              </div>
              <div
                ref={logContainerRef}
                className="h-48 p-3 rounded-lg bg-black/50 border border-border font-mono text-xs overflow-y-auto"
              >
                {syncLogs.map((log, i) => (
                  <div key={i} className="flex items-start gap-2 py-0.5">
                    <span className="text-muted-foreground shrink-0">{log.timestamp}</span>
                    {log.status === 'running' && <Loader2 className="w-3 h-3 animate-spin text-blue-400 mt-0.5" />}
                    {log.status === 'success' && <Check className="w-3 h-3 text-green-400 mt-0.5" />}
                    {log.status === 'error' && <X className="w-3 h-3 text-red-400 mt-0.5" />}
                    <span className={
                      log.status === 'success' ? 'text-green-400' :
                      log.status === 'error' ? 'text-red-400' :
                      'text-foreground'
                    }>{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/30">
          <div className="text-xs text-muted-foreground">
            {repoUrl.replace('https://github.com/', '')}:{path}
          </div>
          <div className="flex gap-2">
            {phase === 'plan' && (
              <>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={runSync}
                  className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Apply Sync
                </button>
              </>
            )}
            {phase === 'complete' && (
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-lg text-sm bg-green-500 text-white hover:bg-green-600 transition-colors flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
