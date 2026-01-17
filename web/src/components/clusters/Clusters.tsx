import { useState, useMemo, useEffect } from 'react'
import { Pencil, X, Check, Loader2, Globe, User, Hourglass } from 'lucide-react'
import { useClusters, useClusterHealth, usePodIssues, useDeploymentIssues, useGPUNodes } from '../../hooks/useMCP'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { StatusIndicator } from '../charts/StatusIndicator'
import { Gauge } from '../charts/Gauge'

interface RenameModalProps {
  clusterName: string
  currentDisplayName: string
  onClose: () => void
  onRename: (oldName: string, newName: string) => Promise<void>
}

function RenameModal({ clusterName, currentDisplayName, onClose, onRename }: RenameModalProps) {
  const [newName, setNewName] = useState('')
  const [isRenaming, setIsRenaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleRename = async () => {
    if (!newName.trim()) {
      setError('Name cannot be empty')
      return
    }
    if (newName.includes(' ')) {
      setError('Name cannot contain spaces')
      return
    }

    setIsRenaming(true)
    setError(null)

    try {
      await onRename(clusterName, newName.trim())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename context')
    } finally {
      setIsRenaming(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="glass p-6 rounded-lg w-[400px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Rename Context</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Current: <span className="text-foreground font-mono text-xs break-all">{currentDisplayName}</span>
        </p>

        <div className="mb-4">
          <label htmlFor="new-context-name" className="block text-sm text-muted-foreground mb-1">New name</label>
          <input
            id="new-context-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g., vllm-d, prod-east"
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          />
        </div>

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50">
            Cancel
          </button>
          <button
            onClick={handleRename}
            disabled={isRenaming || !newName.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
          >
            {isRenaming ? <><Loader2 className="w-4 h-4 animate-spin" />Renaming...</> : <><Check className="w-4 h-4" />Rename</>}
          </button>
        </div>

        <p className="text-xs text-muted-foreground mt-4">This updates your kubeconfig via the local agent.</p>
      </div>
    </div>
  )
}

interface ClusterDetailProps {
  clusterName: string
  onClose: () => void
}

function ClusterDetail({ clusterName, onClose }: ClusterDetailProps) {
  const { health, isLoading } = useClusterHealth(clusterName)
  const { issues: podIssues } = usePodIssues(clusterName)
  const { issues: deploymentIssues } = useDeploymentIssues()
  const { nodes: gpuNodes } = useGPUNodes()

  // ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const clusterGPUs = gpuNodes.filter(n => n.cluster === clusterName || n.cluster.includes(clusterName.split('/')[0]))
  const clusterDeploymentIssues = deploymentIssues.filter(d => d.cluster === clusterName || d.cluster?.includes(clusterName.split('/')[0]))

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="glass p-8 rounded-lg">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="glass p-6 rounded-lg w-[800px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <StatusIndicator status={health?.healthy ? 'healthy' : 'error'} />
            <h2 className="text-xl font-semibold text-foreground">{clusterName.split('/').pop()}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-card/50 border border-border">
            <div className="text-2xl font-bold text-foreground">{health?.nodeCount || 0}</div>
            <div className="text-sm text-muted-foreground">Nodes</div>
            <div className="text-xs text-green-400">{health?.readyNodes || 0} ready</div>
          </div>
          <div className="p-4 rounded-lg bg-card/50 border border-border">
            <div className="text-2xl font-bold text-foreground">{health?.podCount || 0}</div>
            <div className="text-sm text-muted-foreground">Pods</div>
          </div>
          <div className="p-4 rounded-lg bg-card/50 border border-border">
            <div className="text-2xl font-bold text-foreground">{clusterGPUs.reduce((sum, n) => sum + n.gpuCount, 0)}</div>
            <div className="text-sm text-muted-foreground">GPUs</div>
            <div className="text-xs text-yellow-400">{clusterGPUs.reduce((sum, n) => sum + n.gpuAllocated, 0)} allocated</div>
          </div>
        </div>

        {/* Issues Section */}
        {(podIssues.length > 0 || clusterDeploymentIssues.length > 0) && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Issues</h3>
            <div className="space-y-2">
              {podIssues.slice(0, 5).map((issue, i) => (
                <div key={i} className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{issue.name}</span>
                    <span className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400">{issue.status}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{issue.namespace}</div>
                  {issue.issues.length > 0 && (
                    <div className="text-xs text-red-400 mt-1">{issue.issues.join(', ')}</div>
                  )}
                </div>
              ))}
              {clusterDeploymentIssues.slice(0, 3).map((issue, i) => (
                <div key={`dep-${i}`} className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{issue.name}</span>
                    <span className="text-xs px-2 py-1 rounded bg-orange-500/20 text-orange-400">
                      {issue.readyReplicas}/{issue.replicas} ready
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{issue.namespace}</div>
                  {issue.message && (
                    <div className="text-xs text-orange-400 mt-1">{issue.message}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* GPU Nodes */}
        {clusterGPUs.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">GPU Nodes</h3>
            <div className="space-y-2">
              {clusterGPUs.map((node, i) => (
                <div key={i} className="p-3 rounded-lg bg-card/50 border border-border flex items-center justify-between">
                  <div>
                    <div className="font-medium text-foreground text-sm">{node.name}</div>
                    <div className="text-xs text-muted-foreground">{node.gpuType}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-20">
                      <Gauge
                        value={node.gpuAllocated}
                        max={node.gpuCount}
                        size="sm"
                      />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {node.gpuAllocated}/{node.gpuCount}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function Clusters() {
  const { clusters, isLoading, isUpdating, error, refetch } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()
  const { isConnected } = useLocalAgent()
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'healthy' | 'unhealthy'>('all')
  const [renamingCluster, setRenamingCluster] = useState<string | null>(null)

  const handleRenameContext = async (oldName: string, newName: string) => {
    if (!isConnected) throw new Error('Local agent not connected')
    const response = await fetch('http://127.0.0.1:8585/rename-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName, newName }),
    })
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.message || 'Failed to rename context')
    }
    refetch()
  }

  const filteredClusters = useMemo(() => {
    return clusters.filter(c => {
      if (filter === 'healthy') return c.healthy
      if (filter === 'unhealthy') return !c.healthy
      return true
    })
  }, [clusters, filter])

  // Get GPU count per cluster
  const gpuByCluster = useMemo(() => {
    const map: Record<string, { total: number; allocated: number }> = {}
    gpuNodes.forEach(node => {
      const clusterKey = node.cluster.split('/')[0]
      if (!map[clusterKey]) {
        map[clusterKey] = { total: 0, allocated: 0 }
      }
      map[clusterKey].total += node.gpuCount
      map[clusterKey].allocated += node.gpuAllocated
    })
    return map
  }, [gpuNodes])

  const stats = useMemo(() => ({
    total: clusters.length,
    healthy: clusters.filter(c => c.healthy).length,
    unhealthy: clusters.filter(c => !c.healthy).length,
    totalNodes: clusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0),
    totalCPUs: clusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0),
    totalPods: clusters.reduce((sum, c) => sum + (c.podCount || 0), 0),
  }), [clusters])

  if (isLoading) {
    return (
      <div className="pt-16">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Clusters</h1>
          <p className="text-muted-foreground">Manage your Kubernetes clusters</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pt-16">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Clusters</h1>
          <p className="text-muted-foreground">Manage your Kubernetes clusters</p>
        </div>
        <div className="p-6 rounded-lg border border-red-500/20 bg-red-500/10">
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-16">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Clusters</h1>
          {isUpdating && (
            <span className="flex items-center gap-1.5 text-sm text-amber-400 animate-pulse" title="Updating cluster list...">
              <Hourglass className="w-4 h-4" />
              <span>Updating...</span>
            </span>
          )}
        </div>
        <p className="text-muted-foreground">Manage your Kubernetes clusters</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-foreground">{stats.total}</div>
          <div className="text-sm text-muted-foreground">Total Clusters</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-green-400">{stats.healthy}</div>
          <div className="text-sm text-muted-foreground">Healthy</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-red-400">{stats.unhealthy}</div>
          <div className="text-sm text-muted-foreground">Unhealthy</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-foreground">{stats.totalNodes}</div>
          <div className="text-sm text-muted-foreground">Total Nodes</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-foreground">{stats.totalCPUs}</div>
          <div className="text-sm text-muted-foreground">Total CPUs</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-foreground">{stats.totalPods}</div>
          <div className="text-sm text-muted-foreground">Total Pods</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-card/50 text-muted-foreground hover:text-foreground'
          }`}
        >
          All ({stats.total})
        </button>
        <button
          onClick={() => setFilter('healthy')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'healthy'
              ? 'bg-green-500 text-white'
              : 'bg-card/50 text-muted-foreground hover:text-foreground'
          }`}
        >
          Healthy ({stats.healthy})
        </button>
        <button
          onClick={() => setFilter('unhealthy')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === 'unhealthy'
              ? 'bg-red-500 text-white'
              : 'bg-card/50 text-muted-foreground hover:text-foreground'
          }`}
        >
          Unhealthy ({stats.unhealthy})
        </button>
      </div>

      {/* Cluster Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredClusters.map((cluster) => {
          const clusterKey = cluster.name.split('/')[0]
          const gpuInfo = gpuByCluster[clusterKey] || gpuByCluster[cluster.name]

          return (
            <div
              key={cluster.name}
              onClick={() => setSelectedCluster(cluster.name)}
              className="glass p-5 rounded-lg cursor-pointer transition-all hover:scale-[1.02] hover:border-primary/50 border border-transparent"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <StatusIndicator status={cluster.healthy ? 'healthy' : 'error'} size="lg" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">
                        {cluster.context || cluster.name.split('/').pop()}
                      </h3>
                      {isConnected && (cluster.source === 'kubeconfig' || !cluster.source) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setRenamingCluster(cluster.name) }}
                          className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
                          title="Rename context"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {/* Server and User with icons */}
                    <div className="flex flex-col gap-1 mt-1">
                      {cluster.server && (
                        <span
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-default truncate max-w-[220px]"
                          title={`Server: ${cluster.server}`}
                        >
                          <Globe className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{cluster.server.replace(/^https?:\/\//, '')}</span>
                        </span>
                      )}
                      {cluster.user && (
                        <span
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-default truncate max-w-[220px]"
                          title={`User: ${cluster.user}`}
                        >
                          <User className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{cluster.user}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {cluster.isCurrent && (
                  <span className="text-xs px-2 py-1 rounded bg-primary/20 text-primary">
                    Current
                  </span>
                )}
              </div>

              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-lg font-bold text-foreground">{cluster.nodeCount || 0}</div>
                  <div className="text-xs text-muted-foreground">Nodes</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-foreground">{cluster.cpuCores || 0}</div>
                  <div className="text-xs text-muted-foreground">CPUs</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-foreground">{cluster.podCount || 0}</div>
                  <div className="text-xs text-muted-foreground">Pods</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-foreground">{gpuInfo?.total || 0}</div>
                  <div className="text-xs text-muted-foreground">GPUs</div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Source: {cluster.source || 'kubeconfig'}</span>
                  <span className="text-primary">View Details →</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {filteredClusters.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No clusters match the current filter</p>
        </div>
      )}

      {selectedCluster && (
        <ClusterDetail
          clusterName={selectedCluster}
          onClose={() => setSelectedCluster(null)}
        />
      )}

      {renamingCluster && (
        <RenameModal
          clusterName={renamingCluster}
          currentDisplayName={clusters.find(c => c.name === renamingCluster)?.context || renamingCluster}
          onClose={() => setRenamingCluster(null)}
          onRename={handleRenameContext}
        />
      )}
    </div>
  )
}
