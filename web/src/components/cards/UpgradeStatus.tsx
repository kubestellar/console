import { RefreshCw, ArrowUp, CheckCircle, AlertTriangle, Clock } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'

interface UpgradeStatusProps {
  config?: Record<string, unknown>
}

export function UpgradeStatus({ config: _config }: UpgradeStatusProps) {
  const { clusters, isLoading, refetch } = useClusters()

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  // Mock version data for clusters (in real implementation, this would come from cluster API)
  const clusterVersions = clusters.map((c) => ({
    name: c.name,
    currentVersion: getClusterVersion(c.name),
    targetVersion: getTargetVersion(c.name),
    status: getUpgradeStatus(c.name),
    progress: getUpgradeProgress(c.name),
  }))

  const upgradesInProgress = clusterVersions.filter((c) => c.status === 'upgrading').length
  const pendingUpgrades = clusterVersions.filter((c) => c.status === 'available').length

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Upgrade Status</span>
          {upgradesInProgress > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
              {upgradesInProgress} in progress
            </span>
          )}
          {pendingUpgrades > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
              {pendingUpgrades} available
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-secondary rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Clusters list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {clusterVersions.map((cluster) => (
          <div
            key={cluster.name}
            className="p-3 rounded-lg bg-secondary/30"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-white truncate">{cluster.name}</span>
              {getStatusIcon(cluster.status)}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{cluster.currentVersion}</span>
              {cluster.targetVersion && cluster.targetVersion !== cluster.currentVersion && (
                <>
                  <ArrowUp className="w-3 h-3" />
                  <span className="font-mono text-green-400">{cluster.targetVersion}</span>
                </>
              )}
            </div>
            {cluster.status === 'upgrading' && (
              <div className="mt-2">
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${cluster.progress}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{cluster.progress}% complete</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'current':
      return <CheckCircle className="w-4 h-4 text-green-400" />
    case 'upgrading':
      return <Clock className="w-4 h-4 text-blue-400 animate-pulse" />
    case 'available':
      return <ArrowUp className="w-4 h-4 text-yellow-400" />
    case 'failed':
      return <AlertTriangle className="w-4 h-4 text-red-400" />
    default:
      return null
  }
}

// Mock functions - would be replaced with real API calls
function getClusterVersion(name: string): string {
  const versions: Record<string, string> = {
    'ops': 'v1.29.2',
    'prow': 'v1.28.5',
    'kubestellar-docs': 'v1.29.1',
    'oci': 'v1.28.3',
  }
  return versions[name] || 'v1.28.0'
}

function getTargetVersion(name: string): string {
  const targets: Record<string, string> = {
    'prow': 'v1.29.2',
    'oci': 'v1.29.2',
  }
  return targets[name] || getClusterVersion(name)
}

function getUpgradeStatus(name: string): 'current' | 'upgrading' | 'available' | 'failed' {
  if (name === 'prow') return 'available'
  if (name === 'oci') return 'available'
  return 'current'
}

function getUpgradeProgress(_name: string): number {
  return 0
}
