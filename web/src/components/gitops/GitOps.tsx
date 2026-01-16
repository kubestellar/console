import { useState, useMemo, useCallback, useEffect } from 'react'
import { useClusters } from '../../hooks/useMCP'
import { StatusIndicator } from '../charts/StatusIndicator'
import { useToast } from '../ui/Toast'
import { RefreshCw, GitBranch, FolderGit, Box, Loader2 } from 'lucide-react'
import { SyncDialog } from './SyncDialog'
import { api } from '../../lib/api'

// GitOps app configuration (repos to monitor)
interface GitOpsAppConfig {
  name: string
  namespace: string
  cluster: string
  repoUrl: string
  path: string
}

// GitOps app with detected status
interface GitOpsApp extends GitOpsAppConfig {
  syncStatus: 'synced' | 'out-of-sync' | 'unknown' | 'checking'
  healthStatus: 'healthy' | 'degraded' | 'progressing' | 'missing'
  lastSyncTime?: string
  driftDetails?: string[]
}

// Drift detection result from API
interface DriftResult {
  drifted: boolean
  resources: Array<{
    kind: string
    name: string
    namespace: string
    field: string
    gitValue: string
    clusterValue: string
  }>
  error?: string
}

// Apps to monitor - these could come from a config file or API
function getGitOpsAppConfigs(): GitOpsAppConfig[] {
  return [
    {
      name: 'gatekeeper',
      namespace: 'gatekeeper-system',
      cluster: '',
      repoUrl: 'https://github.com/open-policy-agent/gatekeeper',
      path: 'deploy/',
    },
    {
      name: 'kuberay-operator',
      namespace: 'ray-system',
      cluster: '',
      repoUrl: 'https://github.com/ray-project/kuberay',
      path: 'ray-operator/config/default/',
    },
    {
      name: 'kserve',
      namespace: 'kserve',
      cluster: '',
      repoUrl: 'https://github.com/kserve/kserve',
      path: 'config/default/',
    },
    {
      name: 'gpu-operator',
      namespace: 'gpu-operator',
      cluster: '',
      repoUrl: 'https://github.com/NVIDIA/gpu-operator',
      path: 'deployments/gpu-operator/',
    },
  ]
}

function getTimeAgo(timestamp: string | undefined): string {
  if (!timestamp) return 'Unknown'
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)

  if (diffHours > 0) return `${diffHours}h ago`
  if (diffMins > 0) return `${diffMins}m ago`
  return 'Just now'
}

export function GitOps() {
  const { clusters } = useClusters()
  const { showToast } = useToast()
  const [selectedCluster, setSelectedCluster] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [syncedApps, setSyncedApps] = useState<Set<string>>(new Set())
  const [syncDialogApp, setSyncDialogApp] = useState<GitOpsApp | null>(null)
  const [driftResults, setDriftResults] = useState<Map<string, DriftResult>>(new Map())
  const [isDetecting, setIsDetecting] = useState(true)

  // Detect drift for all apps on mount
  useEffect(() => {
    async function detectAllDrift() {
      setIsDetecting(true)
      const results = new Map<string, DriftResult>()
      const configs = getGitOpsAppConfigs()

      for (const appConfig of configs) {
        try {
          const response = await api.post<{
            drifted: boolean
            resources: DriftResult['resources']
            rawDiff?: string
          }>('/api/gitops/detect-drift', {
            repoUrl: appConfig.repoUrl,
            path: appConfig.path,
            namespace: appConfig.namespace,
            cluster: appConfig.cluster || undefined,
          })

          results.set(appConfig.name, {
            drifted: response.data.drifted,
            resources: response.data.resources || [],
          })
        } catch (err) {
          // On error, mark as unknown (not drifted)
          console.error(`Failed to detect drift for ${appConfig.name}:`, err)
          results.set(appConfig.name, {
            drifted: false,
            resources: [],
            error: 'Failed to detect drift',
          })
        }
      }

      setDriftResults(results)
      setIsDetecting(false)
    }

    detectAllDrift()
  }, [])

  // Handle sync action - open the sync dialog
  const handleSync = useCallback((app: GitOpsApp) => {
    setSyncDialogApp(app)
  }, [])

  // Handle sync complete - mark app as synced and refresh drift status
  const handleSyncComplete = useCallback(() => {
    if (syncDialogApp) {
      setSyncedApps(prev => new Set(prev).add(syncDialogApp.name))
      // Also update drift results to show synced
      setDriftResults(prev => {
        const updated = new Map(prev)
        updated.set(syncDialogApp.name, { drifted: false, resources: [] })
        return updated
      })
      showToast(`${syncDialogApp.name} synced successfully!`, 'success')
    }
  }, [syncDialogApp, showToast])

  // Build apps list with real drift status
  const apps = useMemo(() => {
    const configs = getGitOpsAppConfigs()
    return configs.map((config): GitOpsApp => {
      // If manually synced, show as synced
      if (syncedApps.has(config.name)) {
        return {
          ...config,
          syncStatus: 'synced',
          healthStatus: 'healthy',
          lastSyncTime: new Date().toISOString(),
          driftDetails: undefined,
        }
      }

      // If still detecting, show checking state
      if (isDetecting) {
        return {
          ...config,
          syncStatus: 'checking',
          healthStatus: 'progressing',
          lastSyncTime: undefined,
          driftDetails: undefined,
        }
      }

      // Use real drift detection results
      const drift = driftResults.get(config.name)
      if (drift) {
        const driftDetails = drift.resources.length > 0
          ? drift.resources.map(r => `${r.kind}/${r.name}: ${r.field || 'modified'}`)
          : drift.error
            ? [drift.error]
            : undefined

        return {
          ...config,
          syncStatus: drift.drifted ? 'out-of-sync' : 'synced',
          healthStatus: drift.drifted ? 'progressing' : 'healthy',
          lastSyncTime: new Date().toISOString(),
          driftDetails,
        }
      }

      // Default to unknown if no results
      return {
        ...config,
        syncStatus: 'unknown',
        healthStatus: 'missing',
        lastSyncTime: undefined,
        driftDetails: undefined,
      }
    })
  }, [driftResults, isDetecting, syncedApps])

  const filteredApps = useMemo(() => {
    console.log('Filtering with:', { selectedCluster, statusFilter, appsCount: apps.length })
    const filtered = apps.map(app => {
      // If app was manually synced, update its status
      if (syncedApps.has(app.name)) {
        return {
          ...app,
          syncStatus: 'synced' as const,
          healthStatus: 'healthy' as const,
          driftDetails: undefined,
          lastSyncTime: new Date().toISOString(),
        }
      }
      return app
    }).filter(app => {
      // Only filter by cluster if one is selected
      if (selectedCluster && app.cluster !== selectedCluster) return false
      // Only filter by status if not 'all'
      if (statusFilter === 'synced' && app.syncStatus !== 'synced') return false
      if (statusFilter === 'drifted' && app.syncStatus !== 'out-of-sync') return false
      return true
    })
    console.log('Filtered apps:', filtered.length)
    return filtered
  }, [apps, selectedCluster, statusFilter, syncedApps])

  const stats = useMemo(() => ({
    total: apps.length,
    synced: apps.filter(a => a.syncStatus === 'synced').length,
    drifted: apps.filter(a => a.syncStatus === 'out-of-sync').length,
    healthy: apps.filter(a => a.healthStatus === 'healthy').length,
    checking: apps.filter(a => a.syncStatus === 'checking').length,
  }), [apps])

  const syncStatusColor = (status: string) => {
    switch (status) {
      case 'synced': return 'text-green-400 bg-green-500/20'
      case 'out-of-sync': return 'text-yellow-400 bg-yellow-500/20'
      case 'checking': return 'text-blue-400 bg-blue-500/20'
      default: return 'text-muted-foreground bg-card'
    }
  }

  const syncStatusLabel = (status: string) => {
    switch (status) {
      case 'synced': return 'Synced'
      case 'out-of-sync': return 'Out of Sync'
      case 'checking': return 'Checking...'
      default: return 'Unknown'
    }
  }

  const healthStatusIndicator = (status: string): 'healthy' | 'warning' | 'error' => {
    switch (status) {
      case 'healthy': return 'healthy'
      case 'progressing': return 'warning'
      default: return 'error'
    }
  }

  return (
    <div className="pt-16">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">GitOps</h1>
        <p className="text-muted-foreground">GitOps drift detection and sync status</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-foreground">{stats.total}</div>
          <div className="text-sm text-muted-foreground">Total Apps</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-green-400">{stats.synced}</div>
          <div className="text-sm text-muted-foreground">In Sync</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-yellow-400">{stats.drifted}</div>
          <div className="text-sm text-muted-foreground">Drifted</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-green-400">{stats.healthy}</div>
          <div className="text-sm text-muted-foreground">Healthy</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <select
          value={selectedCluster}
          onChange={(e) => setSelectedCluster(e.target.value)}
          className="px-4 py-2 rounded-lg bg-card/50 border border-border text-foreground text-sm"
        >
          <option value="">All Clusters</option>
          {clusters.map((cluster) => (
            <option key={cluster.name} value={cluster.context || cluster.name.split('/').pop()}>
              {cluster.context || cluster.name.split('/').pop()}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setStatusFilter('synced')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'synced'
                ? 'bg-green-500 text-white'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            Synced
          </button>
          <button
            onClick={() => setStatusFilter('drifted')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'drifted'
                ? 'bg-yellow-500 text-white'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            Drifted
          </button>
        </div>
      </div>

      {/* Apps List */}
      {filteredApps.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🔄</div>
          <p className="text-lg text-foreground">No GitOps applications found</p>
          <p className="text-sm text-muted-foreground">Configure ArgoCD or Flux to see sync status</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredApps.map((app, i) => (
            <div
              key={i}
              className={`glass p-4 rounded-lg border-l-4 ${
                app.syncStatus === 'synced' ? 'border-l-green-500' :
                app.syncStatus === 'checking' ? 'border-l-blue-500' :
                app.syncStatus === 'out-of-sync' ? 'border-l-yellow-500' :
                'border-l-gray-500'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <StatusIndicator status={healthStatusIndicator(app.healthStatus)} size="lg" />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground">{app.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${syncStatusColor(app.syncStatus)}`}>
                        {app.syncStatus === 'checking' && <Loader2 className="w-3 h-3 animate-spin" />}
                        {syncStatusLabel(app.syncStatus)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1" title="Kubernetes Namespace">
                        <Box className="w-3 h-3" />
                        <span>{app.namespace}</span>
                      </span>
                      {app.cluster && (
                        <span className="flex items-center gap-1" title="Target Cluster">
                          <span className="text-muted-foreground/50">→</span>
                          <span>{app.cluster}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1" title="Git Repository Source">
                      <GitBranch className="w-3 h-3 text-purple-400" />
                      <span className="font-mono">github.com/{app.repoUrl.replace('https://github.com/', '')}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground" title="Path in Repository">
                      <FolderGit className="w-3 h-3 text-blue-400" />
                      <span className="font-mono">{app.path}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>Last sync: {getTimeAgo(app.lastSyncTime)}</div>
                  <div className="mt-1 capitalize">{app.healthStatus}</div>
                </div>
              </div>

              {/* Drift Details */}
              {app.driftDetails && app.driftDetails.length > 0 && (
                <div className="mt-3 p-3 rounded bg-yellow-500/10 border border-yellow-500/20">
                  <div className="text-sm font-medium text-yellow-400 mb-2">Drift Detected</div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {app.driftDetails.map((detail, j) => (
                      <li key={j} className="flex items-center gap-2">
                        <span className="text-yellow-400">•</span>
                        {detail}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handleSync(app)}
                    className="mt-2 px-3 py-1 rounded bg-yellow-500/20 text-yellow-400 text-xs hover:bg-yellow-500/30 transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Sync Now
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div className="mt-8 p-4 rounded-lg bg-card/30 border border-border">
        <h3 className="text-lg font-semibold text-foreground mb-3">GitOps Integration</h3>
        <p className="text-sm text-muted-foreground mb-3">
          GitOps integration detects drift between your Git repository and live cluster state
          using kubectl diff. Connect ArgoCD or Flux for enhanced sync capabilities.
        </p>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card transition-colors">
            Configure ArgoCD
          </button>
          <button className="px-4 py-2 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card transition-colors">
            Configure Flux
          </button>
        </div>
      </div>

      {/* Sync Dialog */}
      {syncDialogApp && (
        <SyncDialog
          isOpen={!!syncDialogApp}
          onClose={() => setSyncDialogApp(null)}
          appName={syncDialogApp.name}
          namespace={syncDialogApp.namespace}
          cluster={syncDialogApp.cluster}
          repoUrl={syncDialogApp.repoUrl}
          path={syncDialogApp.path}
          onSyncComplete={handleSyncComplete}
        />
      )}
    </div>
  )
}
