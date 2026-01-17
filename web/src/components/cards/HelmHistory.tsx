import { useState } from 'react'
import { History, CheckCircle, XCircle, RotateCcw, ArrowUp, RefreshCw, Clock } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'

interface HelmHistoryProps {
  config?: {
    cluster?: string
    release?: string
    namespace?: string
  }
}

interface HistoryEntry {
  revision: number
  updated: string
  status: 'deployed' | 'superseded' | 'failed' | 'pending-upgrade' | 'pending-rollback'
  chart: string
  appVersion: string
  description: string
}

export function HelmHistory({ config }: HelmHistoryProps) {
  const { clusters, isLoading, refetch } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [selectedRelease, setSelectedRelease] = useState<string>(config?.release || '')

  // Mock releases
  const releases = selectedCluster ? [
    'prometheus', 'grafana', 'nginx-ingress', 'cert-manager'
  ] : []

  // Mock history data
  const history: HistoryEntry[] = selectedRelease ? [
    { revision: 5, updated: '2024-01-11T14:30:00Z', status: 'deployed', chart: 'prometheus-25.8.0', appVersion: '2.47.0', description: 'Upgrade complete' },
    { revision: 4, updated: '2024-01-08T10:15:00Z', status: 'superseded', chart: 'prometheus-25.7.0', appVersion: '2.46.0', description: 'Upgrade complete' },
    { revision: 3, updated: '2024-01-05T16:00:00Z', status: 'superseded', chart: 'prometheus-25.6.0', appVersion: '2.46.0', description: 'Upgrade complete' },
    { revision: 2, updated: '2024-01-02T09:30:00Z', status: 'superseded', chart: 'prometheus-25.5.0', appVersion: '2.45.0', description: 'Rollback to 1' },
    { revision: 1, updated: '2023-12-20T11:00:00Z', status: 'superseded', chart: 'prometheus-25.4.0', appVersion: '2.45.0', description: 'Install complete' },
  ] : []

  const getStatusIcon = (status: HistoryEntry['status']) => {
    switch (status) {
      case 'deployed': return CheckCircle
      case 'failed': return XCircle
      case 'pending-rollback': return RotateCcw
      case 'pending-upgrade': return ArrowUp
      default: return Clock
    }
  }

  const getStatusColor = (status: HistoryEntry['status']) => {
    switch (status) {
      case 'deployed': return 'green'
      case 'failed': return 'red'
      case 'superseded': return 'gray'
      default: return 'blue'
    }
  }

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={120} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={32} className="mb-4" />
        <div className="space-y-2">
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-medium text-muted-foreground">Helm History</span>
          {history.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">
              {history.length} revisions
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
            setSelectedRelease('')
          }}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-white"
        >
          <option value="">Select cluster...</option>
          {clusters.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          value={selectedRelease}
          onChange={(e) => setSelectedRelease(e.target.value)}
          disabled={!selectedCluster}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-white disabled:opacity-50"
        >
          <option value="">Select release...</option>
          {releases.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {!selectedCluster || !selectedRelease ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a cluster and release to view history
        </div>
      ) : (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            <ClusterBadge cluster={selectedCluster} />
            <span className="text-muted-foreground">/</span>
            <span className="text-sm text-white">{selectedRelease}</span>
          </div>

          {/* History timeline */}
          <div className="flex-1 overflow-y-auto">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[7px] top-4 bottom-4 w-0.5 bg-border" />

              {/* History entries */}
              <div className="space-y-3">
                {history.map((entry, idx) => {
                  const StatusIcon = getStatusIcon(entry.status)
                  const color = getStatusColor(entry.status)
                  const isCurrent = entry.status === 'deployed'

                  return (
                    <div key={idx} className="relative pl-6">
                      {/* Timeline dot */}
                      <div className={`absolute left-0 top-2 w-4 h-4 rounded-full flex items-center justify-center ${
                        isCurrent ? 'bg-green-500' : 'bg-secondary border border-border'
                      }`}>
                        <StatusIcon className={`w-2.5 h-2.5 ${isCurrent ? 'text-white' : `text-${color}-400`}`} />
                      </div>

                      <div className={`p-2 rounded-lg ${isCurrent ? 'bg-green-500/10 border border-green-500/20' : 'bg-secondary/30'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">Rev {entry.revision}</span>
                            {isCurrent && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                                current
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{formatDate(entry.updated)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <span>{entry.chart}</span>
                          <span className="mx-2">•</span>
                          <span>{entry.description}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            Showing last {history.length} revisions
          </div>
        </>
      )}
    </div>
  )
}
