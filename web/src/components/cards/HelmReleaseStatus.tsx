import { useState, useMemo } from 'react'
import { Anchor, CheckCircle, AlertTriangle, XCircle, RefreshCw, Clock } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'

interface HelmReleaseStatusProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

interface HelmRelease {
  name: string
  namespace: string
  chart: string
  version: string
  appVersion: string
  status: 'deployed' | 'failed' | 'pending' | 'superseded' | 'uninstalling'
  updated: string
  revision: number
}

export function HelmReleaseStatus({ config }: HelmReleaseStatusProps) {
  const { clusters, isLoading, refetch } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [selectedNamespace, setSelectedNamespace] = useState<string>(config?.namespace || '')

  // Mock Helm release data
  const allReleases: HelmRelease[] = selectedCluster ? [
    { name: 'prometheus', namespace: 'monitoring', chart: 'prometheus', version: '25.8.0', appVersion: '2.47.0', status: 'deployed', updated: '2024-01-10T14:30:00Z', revision: 5 },
    { name: 'grafana', namespace: 'monitoring', chart: 'grafana', version: '7.0.8', appVersion: '10.2.2', status: 'deployed', updated: '2024-01-09T10:15:00Z', revision: 3 },
    { name: 'nginx-ingress', namespace: 'ingress', chart: 'ingress-nginx', version: '4.9.0', appVersion: '1.9.5', status: 'deployed', updated: '2024-01-08T09:00:00Z', revision: 12 },
    { name: 'cert-manager', namespace: 'cert-manager', chart: 'cert-manager', version: '1.13.3', appVersion: '1.13.3', status: 'deployed', updated: '2024-01-05T16:45:00Z', revision: 2 },
    { name: 'redis', namespace: 'default', chart: 'redis', version: '18.6.1', appVersion: '7.2.3', status: 'failed', updated: '2024-01-11T08:20:00Z', revision: 4 },
    { name: 'postgresql', namespace: 'default', chart: 'postgresql', version: '13.2.24', appVersion: '16.1.0', status: 'pending', updated: '2024-01-11T11:00:00Z', revision: 1 },
  ] : []

  // Get unique namespaces
  const namespaces = useMemo(() => {
    const nsSet = new Set(allReleases.map(r => r.namespace))
    return Array.from(nsSet).sort()
  }, [allReleases])

  // Filter releases
  const releases = useMemo(() => {
    if (!selectedNamespace) return allReleases
    return allReleases.filter(r => r.namespace === selectedNamespace)
  }, [allReleases, selectedNamespace])

  const getStatusIcon = (status: HelmRelease['status']) => {
    switch (status) {
      case 'deployed': return CheckCircle
      case 'failed': return XCircle
      case 'pending': return Clock
      default: return AlertTriangle
    }
  }

  const getStatusColor = (status: HelmRelease['status']) => {
    switch (status) {
      case 'deployed': return 'green'
      case 'failed': return 'red'
      case 'pending': return 'blue'
      default: return 'orange'
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  }

  const deployedCount = releases.filter(r => r.status === 'deployed').length
  const failedCount = releases.filter(r => r.status === 'failed').length

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={140} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={32} className="mb-4" />
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
          <Anchor className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-muted-foreground">Helm Releases</span>
          {failedCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
              {failedCount} failed
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

      {/* Selectors */}
      <div className="flex gap-2 mb-4">
        <select
          value={selectedCluster}
          onChange={(e) => {
            setSelectedCluster(e.target.value)
            setSelectedNamespace('')
          }}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-white"
        >
          <option value="">Select cluster...</option>
          {clusters.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          value={selectedNamespace}
          onChange={(e) => setSelectedNamespace(e.target.value)}
          disabled={!selectedCluster}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-white disabled:opacity-50"
        >
          <option value="">All namespaces</option>
          {namespaces.map(ns => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </select>
      </div>

      {!selectedCluster ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a cluster to view releases
        </div>
      ) : (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            <ClusterBadge cluster={selectedCluster} />
            {selectedNamespace && (
              <>
                <span className="text-muted-foreground">/</span>
                <span className="text-sm text-white">{selectedNamespace}</span>
              </>
            )}
          </div>

          {/* Summary */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1 p-2 rounded-lg bg-blue-500/10 text-center">
              <span className="text-lg font-bold text-blue-400">{releases.length}</span>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-green-500/10 text-center">
              <span className="text-lg font-bold text-green-400">{deployedCount}</span>
              <p className="text-xs text-muted-foreground">Deployed</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-red-500/10 text-center">
              <span className="text-lg font-bold text-red-400">{failedCount}</span>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </div>

          {/* Releases list */}
          <div className="flex-1 space-y-2 overflow-y-auto">
            {releases.map((release, idx) => {
              const StatusIcon = getStatusIcon(release.status)
              const color = getStatusColor(release.status)

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-lg ${release.status === 'failed' ? 'bg-red-500/10 border border-red-500/20' : 'bg-secondary/30'} hover:bg-secondary/50 transition-colors`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`w-4 h-4 text-${color}-400`} />
                      <span className="text-sm text-white font-medium">{release.name}</span>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded bg-${color}-500/20 text-${color}-400`}>
                      {release.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 ml-6 text-xs text-muted-foreground">
                    <span>{release.chart}@{release.version}</span>
                    <span>Rev {release.revision}</span>
                    <span className="ml-auto">{formatTime(release.updated)}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            {releases.length} releases{selectedNamespace ? ` in ${selectedNamespace}` : ''}
          </div>
        </>
      )}
    </div>
  )
}
