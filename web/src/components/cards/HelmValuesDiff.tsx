import { useState } from 'react'
import { FileJson, ChevronRight, RefreshCw, Plus, Minus, Edit } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'

interface HelmValuesDiffProps {
  config?: {
    cluster?: string
    release?: string
    namespace?: string
  }
}

interface ValueDiff {
  path: string
  type: 'added' | 'removed' | 'changed'
  oldValue?: string
  newValue?: string
}

export function HelmValuesDiff({ config }: HelmValuesDiffProps) {
  const { clusters, isLoading, refetch } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [selectedRelease, setSelectedRelease] = useState<string>(config?.release || '')

  // Mock releases for the selected cluster
  const releases = selectedCluster ? [
    'prometheus', 'grafana', 'nginx-ingress', 'cert-manager', 'redis', 'postgresql'
  ] : []

  // Mock diff data - comparing current values to default chart values
  const diffs: ValueDiff[] = selectedRelease ? [
    { path: 'replicaCount', type: 'changed', oldValue: '1', newValue: '3' },
    { path: 'resources.limits.memory', type: 'changed', oldValue: '256Mi', newValue: '512Mi' },
    { path: 'resources.limits.cpu', type: 'changed', oldValue: '100m', newValue: '500m' },
    { path: 'ingress.enabled', type: 'changed', oldValue: 'false', newValue: 'true' },
    { path: 'ingress.hosts[0].host', type: 'added', newValue: 'app.example.com' },
    { path: 'ingress.tls[0].secretName', type: 'added', newValue: 'app-tls' },
    { path: 'serviceAccount.create', type: 'removed', oldValue: 'true' },
    { path: 'persistence.enabled', type: 'changed', oldValue: 'false', newValue: 'true' },
    { path: 'persistence.size', type: 'added', newValue: '10Gi' },
  ] : []

  const getDiffIcon = (type: ValueDiff['type']) => {
    switch (type) {
      case 'added': return Plus
      case 'removed': return Minus
      case 'changed': return Edit
    }
  }

  const getDiffColor = (type: ValueDiff['type']) => {
    switch (type) {
      case 'added': return 'green'
      case 'removed': return 'red'
      case 'changed': return 'yellow'
    }
  }

  const addedCount = diffs.filter(d => d.type === 'added').length
  const removedCount = diffs.filter(d => d.type === 'removed').length
  const changedCount = diffs.filter(d => d.type === 'changed').length

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={130} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={32} className="mb-4" />
        <div className="space-y-2">
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={40} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileJson className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-muted-foreground">Helm Values Diff</span>
          {diffs.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
              {diffs.length}
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
          Select a cluster and release to compare values
        </div>
      ) : (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            <ClusterBadge cluster={selectedCluster} />
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-white">{selectedRelease}</span>
          </div>

          {/* Summary */}
          <div className="flex gap-2 mb-4 text-xs">
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-400">
              <Plus className="w-3 h-3" />
              <span>{addedCount} added</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/10 text-red-400">
              <Minus className="w-3 h-3" />
              <span>{removedCount} removed</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-400">
              <Edit className="w-3 h-3" />
              <span>{changedCount} changed</span>
            </div>
          </div>

          {/* Diff list */}
          <div className="flex-1 space-y-1 overflow-y-auto font-mono text-xs">
            {diffs.map((diff, idx) => {
              const DiffIcon = getDiffIcon(diff.type)
              const color = getDiffColor(diff.type)

              return (
                <div
                  key={idx}
                  className={`p-2 rounded bg-${color}-500/10 border-l-2 border-${color}-500`}
                >
                  <div className="flex items-center gap-2">
                    <DiffIcon className={`w-3 h-3 text-${color}-400 flex-shrink-0`} />
                    <span className="text-white truncate">{diff.path}</span>
                  </div>
                  <div className="ml-5 mt-1">
                    {diff.oldValue && (
                      <div className="text-red-400 truncate">- {diff.oldValue}</div>
                    )}
                    {diff.newValue && (
                      <div className="text-green-400 truncate">+ {diff.newValue}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            Comparing deployed values vs chart defaults
          </div>
        </>
      )}
    </div>
  )
}
