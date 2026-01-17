import { useState, useMemo, useCallback, useEffect } from 'react'
import { useClusters } from '../../hooks/useMCP'
import { StatusIndicator } from '../charts/StatusIndicator'
import { useToast } from '../ui/Toast'
import { RefreshCw, Box, Loader2, Package } from 'lucide-react'

interface HelmRelease {
  name: string
  namespace: string
  revision: string
  updated: string
  status: string
  chart: string
  app_version: string
}

function getTimeAgo(timestamp: string | undefined): string {
  if (!timestamp) return 'Unknown'
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) return `${diffDays}d ago`
  if (diffHours > 0) return `${diffHours}h ago`
  if (diffMins > 0) return `${diffMins}m ago`
  return 'Just now'
}

export function GitOps() {
  const { clusters } = useClusters()
  const { showToast } = useToast()
  const [selectedCluster, setSelectedCluster] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [releases, setReleases] = useState<HelmRelease[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch Helm releases
  const fetchReleases = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const url = selectedCluster
        ? `/api/gitops/helm-releases?cluster=${encodeURIComponent(selectedCluster)}`
        : '/api/gitops/helm-releases'

      const response = await fetch(url, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to fetch Helm releases')
      }

      const data = await response.json()
      setReleases(data.releases || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch Helm releases')
      setReleases([])
    } finally {
      setIsLoading(false)
    }
  }, [selectedCluster])

  // Fetch releases on mount and when cluster changes
  useEffect(() => {
    fetchReleases()
  }, [fetchReleases])

  // Handle refresh
  const handleRefresh = useCallback(() => {
    fetchReleases()
    showToast('Refreshing Helm releases...', 'info')
  }, [fetchReleases, showToast])

  const filteredReleases = useMemo(() => {
    return releases.filter(release => {
      // Only filter by status if not 'all'
      if (statusFilter === 'deployed' && release.status !== 'deployed') return false
      if (statusFilter === 'failed' && release.status !== 'failed') return false
      if (statusFilter === 'pending' && !release.status.includes('pending')) return false
      return true
    })
  }, [releases, statusFilter])

  const stats = useMemo(() => ({
    total: releases.length,
    deployed: releases.filter(r => r.status === 'deployed').length,
    failed: releases.filter(r => r.status === 'failed').length,
    pending: releases.filter(r => r.status.includes('pending')).length,
  }), [releases])

  const statusColor = (status: string) => {
    switch (status) {
      case 'deployed': return 'text-green-400 bg-green-500/20'
      case 'failed': return 'text-red-400 bg-red-500/20'
      case 'pending-install':
      case 'pending-upgrade':
      case 'pending-rollback': return 'text-blue-400 bg-blue-500/20'
      case 'superseded': return 'text-muted-foreground bg-card/50'
      case 'uninstalling': return 'text-yellow-400 bg-yellow-500/20'
      default: return 'text-muted-foreground bg-card'
    }
  }

  const healthStatusIndicator = (status: string): 'healthy' | 'warning' | 'error' => {
    switch (status) {
      case 'deployed': return 'healthy'
      case 'failed': return 'error'
      default: return 'warning'
    }
  }

  return (
    <div className="pt-16">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Helm Releases</h1>
          <p className="text-muted-foreground">Helm releases across your clusters</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="px-4 py-2 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card transition-colors flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-foreground">{stats.total}</div>
          <div className="text-sm text-muted-foreground">Total Releases</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-green-400">{stats.deployed}</div>
          <div className="text-sm text-muted-foreground">Deployed</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-red-400">{stats.failed}</div>
          <div className="text-sm text-muted-foreground">Failed</div>
        </div>
        <div className="glass p-4 rounded-lg">
          <div className="text-3xl font-bold text-blue-400">{stats.pending}</div>
          <div className="text-sm text-muted-foreground">Pending</div>
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
            onClick={() => setStatusFilter('deployed')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'deployed'
                ? 'bg-green-500 text-white'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            Deployed
          </button>
          <button
            onClick={() => setStatusFilter('failed')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'failed'
                ? 'bg-red-500 text-white'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            Failed
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-lg text-foreground">Loading Helm releases...</p>
        </div>
      ) : filteredReleases.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg text-foreground">No Helm releases found</p>
          <p className="text-sm text-muted-foreground">Install Helm charts to see them here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReleases.map((release, i) => (
            <div
              key={`${release.namespace}-${release.name}-${i}`}
              className={`glass p-4 rounded-lg border-l-4 ${
                release.status === 'deployed' ? 'border-l-green-500' :
                release.status === 'failed' ? 'border-l-red-500' :
                'border-l-blue-500'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <StatusIndicator status={healthStatusIndicator(release.status)} size="lg" />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground">{release.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded capitalize ${statusColor(release.status)}`}>
                        {release.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1" title="Kubernetes Namespace">
                        <Box className="w-3 h-3" />
                        <span>{release.namespace}</span>
                      </span>
                      <span className="flex items-center gap-1" title="Revision">
                        <span className="text-muted-foreground/50">rev</span>
                        <span>{release.revision}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1" title="Helm Chart">
                      <Package className="w-3 h-3 text-purple-400" />
                      <span className="font-mono">{release.chart}</span>
                    </div>
                    {release.app_version && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        App version: {release.app_version}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>Updated: {getTimeAgo(release.updated)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div className="mt-8 p-4 rounded-lg bg-card/30 border border-border">
        <h3 className="text-lg font-semibold text-foreground mb-3">Helm Release Management</h3>
        <p className="text-sm text-muted-foreground">
          This page shows all Helm releases installed across your clusters. Use the cluster filter to view releases from specific clusters.
        </p>
      </div>
    </div>
  )
}
