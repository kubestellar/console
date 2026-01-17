import { useState } from 'react'
import { GitCompare, Plus, Minus, Edit, RefreshCw, Layers } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'

interface OverlayComparisonProps {
  config?: {
    cluster?: string
  }
}

interface OverlayDiff {
  resource: string
  type: 'patch' | 'added' | 'removed'
  overlay: string
  details: string
}

export function OverlayComparison({ config }: OverlayComparisonProps) {
  const { clusters, isLoading, refetch } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [selectedBase, setSelectedBase] = useState<string>('')
  const [selectedOverlay, setSelectedOverlay] = useState<string>('')

  // Mock overlays
  const overlays = selectedCluster ? ['base', 'dev', 'staging', 'production'] : []

  // Mock diff data
  const diffs: OverlayDiff[] = selectedBase && selectedOverlay ? [
    { resource: 'Deployment/app', type: 'patch', overlay: selectedOverlay, details: 'replicas: 1 → 3' },
    { resource: 'Deployment/app', type: 'patch', overlay: selectedOverlay, details: 'resources.limits.memory: 256Mi → 512Mi' },
    { resource: 'ConfigMap/app-config', type: 'patch', overlay: selectedOverlay, details: 'LOG_LEVEL: debug → info' },
    { resource: 'Service/app', type: 'patch', overlay: selectedOverlay, details: 'type: ClusterIP → LoadBalancer' },
    { resource: 'HorizontalPodAutoscaler/app', type: 'added', overlay: selectedOverlay, details: 'minReplicas: 3, maxReplicas: 10' },
    { resource: 'PodDisruptionBudget/app', type: 'added', overlay: selectedOverlay, details: 'minAvailable: 2' },
    { resource: 'ConfigMap/debug-config', type: 'removed', overlay: selectedOverlay, details: 'Removed debug configuration' },
  ] : []

  const getDiffIcon = (type: OverlayDiff['type']) => {
    switch (type) {
      case 'added': return Plus
      case 'removed': return Minus
      case 'patch': return Edit
    }
  }

  const getDiffColor = (type: OverlayDiff['type']) => {
    switch (type) {
      case 'added': return 'green'
      case 'removed': return 'red'
      case 'patch': return 'yellow'
    }
  }

  const patchCount = diffs.filter(d => d.type === 'patch').length
  const addedCount = diffs.filter(d => d.type === 'added').length
  const removedCount = diffs.filter(d => d.type === 'removed').length

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={150} height={20} />
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
          <GitCompare className="w-4 h-4 text-fuchsia-400" />
          <span className="text-sm font-medium text-muted-foreground">Overlay Comparison</span>
          {diffs.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-400">
              {diffs.length} changes
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

      {/* Cluster selector */}
      <select
        value={selectedCluster}
        onChange={(e) => {
          setSelectedCluster(e.target.value)
          setSelectedBase('')
          setSelectedOverlay('')
        }}
        className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-white mb-4"
      >
        <option value="">Select cluster...</option>
        {clusters.map(c => (
          <option key={c.name} value={c.name}>{c.name}</option>
        ))}
      </select>

      {!selectedCluster ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a cluster to compare overlays
        </div>
      ) : (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            <ClusterBadge cluster={selectedCluster} />
          </div>

          {/* Overlay selectors */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Base</label>
              <select
                value={selectedBase}
                onChange={(e) => setSelectedBase(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-white"
              >
                <option value="">Select base...</option>
                {overlays.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Overlay</label>
              <select
                value={selectedOverlay}
                onChange={(e) => setSelectedOverlay(e.target.value)}
                disabled={!selectedBase}
                className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-white disabled:opacity-50"
              >
                <option value="">Select overlay...</option>
                {overlays.filter(o => o !== selectedBase).map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>

          {!selectedBase || !selectedOverlay ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Select base and overlay to compare
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="flex gap-2 mb-4 text-xs">
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-400">
                  <Edit className="w-3 h-3" />
                  <span>{patchCount} patches</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-400">
                  <Plus className="w-3 h-3" />
                  <span>{addedCount} added</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/10 text-red-400">
                  <Minus className="w-3 h-3" />
                  <span>{removedCount} removed</span>
                </div>
              </div>

              {/* Diff list */}
              <div className="flex-1 space-y-2 overflow-y-auto">
                {diffs.map((diff, idx) => {
                  const DiffIcon = getDiffIcon(diff.type)
                  const color = getDiffColor(diff.type)

                  return (
                    <div
                      key={idx}
                      className={`p-2 rounded-lg bg-${color}-500/10 border-l-2 border-${color}-500`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <DiffIcon className={`w-4 h-4 text-${color}-400 flex-shrink-0`} />
                        <span className="text-sm text-white truncate">{diff.resource}</span>
                      </div>
                      <div className="ml-6 text-xs text-muted-foreground truncate">
                        {diff.details}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              <div className="mt-4 pt-3 border-t border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
                <Layers className="w-3 h-3" />
                <span>Comparing {selectedBase} → {selectedOverlay}</span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
