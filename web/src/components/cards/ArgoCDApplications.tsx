import { useState, useMemo } from 'react'
import { GitBranch, CheckCircle, XCircle, RefreshCw, Clock, AlertTriangle, ChevronRight } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { ClusterBadge } from '../ui/ClusterBadge'
import { Skeleton } from '../ui/Skeleton'

interface ArgoCDApplicationsProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

interface ArgoApplication {
  name: string
  namespace: string
  cluster: string
  syncStatus: 'Synced' | 'OutOfSync' | 'Unknown'
  healthStatus: 'Healthy' | 'Degraded' | 'Progressing' | 'Missing' | 'Unknown'
  source: {
    repoURL: string
    path: string
    targetRevision: string
  }
  lastSynced?: string
}

// Mock ArgoCD applications
function getMockArgoApplications(clusters: string[]): ArgoApplication[] {
  const apps: ArgoApplication[] = []

  clusters.forEach((cluster) => {
    const baseApps = [
      {
        name: 'frontend-app',
        namespace: 'production',
        syncStatus: 'Synced' as const,
        healthStatus: 'Healthy' as const,
        source: {
          repoURL: 'https://github.com/org/frontend',
          path: 'k8s/overlays/production',
          targetRevision: 'main',
        },
        lastSynced: '2 minutes ago',
      },
      {
        name: 'api-gateway',
        namespace: 'production',
        syncStatus: 'OutOfSync' as const,
        healthStatus: 'Healthy' as const,
        source: {
          repoURL: 'https://github.com/org/api-gateway',
          path: 'deploy',
          targetRevision: 'v2.3.0',
        },
        lastSynced: '15 minutes ago',
      },
      {
        name: 'backend-service',
        namespace: 'staging',
        syncStatus: 'Synced' as const,
        healthStatus: 'Progressing' as const,
        source: {
          repoURL: 'https://github.com/org/backend',
          path: 'manifests',
          targetRevision: 'develop',
        },
        lastSynced: '1 minute ago',
      },
      {
        name: 'monitoring-stack',
        namespace: 'monitoring',
        syncStatus: 'OutOfSync' as const,
        healthStatus: 'Degraded' as const,
        source: {
          repoURL: 'https://github.com/org/monitoring',
          path: 'helm/prometheus',
          targetRevision: 'HEAD',
        },
        lastSynced: '30 minutes ago',
      },
    ]

    baseApps.forEach((app, idx) => {
      // Only add some apps to some clusters
      if ((cluster.includes('prod') && idx < 3) ||
          (cluster.includes('staging') && idx > 1) ||
          (!cluster.includes('prod') && !cluster.includes('staging'))) {
        apps.push({ ...app, cluster })
      }
    })
  })

  return apps
}

const syncStatusConfig = {
  Synced: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20' },
  OutOfSync: { icon: RefreshCw, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  Unknown: { icon: AlertTriangle, color: 'text-gray-400', bg: 'bg-gray-500/20' },
}

const healthStatusConfig = {
  Healthy: { icon: CheckCircle, color: 'text-green-400' },
  Degraded: { icon: XCircle, color: 'text-red-400' },
  Progressing: { icon: Clock, color: 'text-blue-400' },
  Missing: { icon: AlertTriangle, color: 'text-orange-400' },
  Unknown: { icon: AlertTriangle, color: 'text-gray-400' },
}

export function ArgoCDApplications({ config }: ArgoCDApplicationsProps) {
  const { clusters, isLoading, refetch } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'outOfSync' | 'unhealthy'>('all')

  const filteredClusters = useMemo(() => {
    if (isAllClustersSelected) return clusters.map(c => c.name)
    return selectedClusters
  }, [clusters, selectedClusters, isAllClustersSelected])

  const applications = useMemo(() => {
    const allApps = getMockArgoApplications(filteredClusters)

    // Filter by config
    let filtered = allApps
    if (config?.cluster) {
      filtered = filtered.filter(a => a.cluster === config.cluster)
    }
    if (config?.namespace) {
      filtered = filtered.filter(a => a.namespace === config.namespace)
    }

    // Filter by status
    if (selectedFilter === 'outOfSync') {
      filtered = filtered.filter(a => a.syncStatus === 'OutOfSync')
    } else if (selectedFilter === 'unhealthy') {
      filtered = filtered.filter(a => a.healthStatus !== 'Healthy')
    }

    return filtered
  }, [filteredClusters, config, selectedFilter])

  const stats = useMemo(() => ({
    synced: applications.filter(a => a.syncStatus === 'Synced').length,
    outOfSync: applications.filter(a => a.syncStatus === 'OutOfSync').length,
    healthy: applications.filter(a => a.healthStatus === 'Healthy').length,
    unhealthy: applications.filter(a => a.healthStatus !== 'Healthy').length,
  }), [applications])

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={150} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <div className="space-y-2">
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium text-muted-foreground">ArgoCD Applications</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
            {applications.length}
          </span>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-secondary rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="text-center p-2 rounded-lg bg-green-500/10 cursor-pointer hover:bg-green-500/20"
             onClick={() => setSelectedFilter('all')}>
          <p className="text-lg font-bold text-green-400">{stats.synced}</p>
          <p className="text-xs text-muted-foreground">Synced</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-yellow-500/10 cursor-pointer hover:bg-yellow-500/20"
             onClick={() => setSelectedFilter('outOfSync')}>
          <p className="text-lg font-bold text-yellow-400">{stats.outOfSync}</p>
          <p className="text-xs text-muted-foreground">Out of Sync</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-green-500/10 cursor-pointer hover:bg-green-500/20"
             onClick={() => setSelectedFilter('all')}>
          <p className="text-lg font-bold text-green-400">{stats.healthy}</p>
          <p className="text-xs text-muted-foreground">Healthy</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-red-500/10 cursor-pointer hover:bg-red-500/20"
             onClick={() => setSelectedFilter('unhealthy')}>
          <p className="text-lg font-bold text-red-400">{stats.unhealthy}</p>
          <p className="text-xs text-muted-foreground">Unhealthy</p>
        </div>
      </div>

      {/* Filter indicator */}
      {selectedFilter !== 'all' && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground">Showing:</span>
          <button
            onClick={() => setSelectedFilter('all')}
            className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 flex items-center gap-1"
          >
            {selectedFilter === 'outOfSync' ? 'Out of Sync' : 'Unhealthy'}
            <XCircle className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Applications list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {applications.map((app, idx) => {
          const syncConfig = syncStatusConfig[app.syncStatus]
          const healthConfig = healthStatusConfig[app.healthStatus]
          const SyncIcon = syncConfig.icon
          const HealthIcon = healthConfig.icon

          return (
            <div
              key={`${app.cluster}-${app.namespace}-${app.name}-${idx}`}
              className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors group"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{app.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${syncConfig.bg} ${syncConfig.color}`}>
                    <SyncIcon className="w-3 h-3 inline mr-1" />
                    {app.syncStatus}
                  </span>
                  <HealthIcon className={`w-4 h-4 ${healthConfig.color}`} aria-label={app.healthStatus} />
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <ClusterBadge cluster={app.cluster} size="sm" />
                  <span>/{app.namespace}</span>
                </div>
                <span>{app.lastSynced}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
