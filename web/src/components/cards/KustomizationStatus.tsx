import { useState, useMemo } from 'react'
import { Layers, CheckCircle, AlertTriangle, XCircle, RefreshCw, Clock, GitBranch } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'

interface KustomizationStatusProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

interface Kustomization {
  name: string
  namespace: string
  path: string
  sourceRef: string
  status: 'Ready' | 'NotReady' | 'Progressing' | 'Suspended'
  lastApplied: string
  revision: string
}

export function KustomizationStatus({ config }: KustomizationStatusProps) {
  const { clusters, isLoading, refetch } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [selectedNamespace, setSelectedNamespace] = useState<string>(config?.namespace || '')

  // Mock kustomization data
  const allKustomizations: Kustomization[] = selectedCluster ? [
    { name: 'infrastructure', namespace: 'flux-system', path: './infrastructure', sourceRef: 'flux-system/flux-repo', status: 'Ready', lastApplied: '2024-01-11T10:30:00Z', revision: 'main@sha1:abc123' },
    { name: 'apps', namespace: 'flux-system', path: './apps', sourceRef: 'flux-system/flux-repo', status: 'Ready', lastApplied: '2024-01-11T10:31:00Z', revision: 'main@sha1:abc123' },
    { name: 'monitoring', namespace: 'flux-system', path: './monitoring', sourceRef: 'flux-system/flux-repo', status: 'Progressing', lastApplied: '2024-01-11T10:32:00Z', revision: 'main@sha1:def456' },
    { name: 'tenants-dev', namespace: 'flux-system', path: './tenants/dev', sourceRef: 'flux-system/tenants-repo', status: 'Ready', lastApplied: '2024-01-10T15:00:00Z', revision: 'main@sha1:789ghi' },
    { name: 'tenants-prod', namespace: 'flux-system', path: './tenants/prod', sourceRef: 'flux-system/tenants-repo', status: 'NotReady', lastApplied: '2024-01-10T15:00:00Z', revision: 'main@sha1:789ghi' },
    { name: 'secrets', namespace: 'flux-system', path: './secrets', sourceRef: 'flux-system/flux-repo', status: 'Suspended', lastApplied: '2024-01-05T09:00:00Z', revision: 'main@sha1:jkl012' },
  ] : []

  // Get unique namespaces
  const namespaces = useMemo(() => {
    const nsSet = new Set(allKustomizations.map(k => k.namespace))
    return Array.from(nsSet).sort()
  }, [allKustomizations])

  // Filter by namespace
  const kustomizations = useMemo(() => {
    if (!selectedNamespace) return allKustomizations
    return allKustomizations.filter(k => k.namespace === selectedNamespace)
  }, [allKustomizations, selectedNamespace])

  const getStatusIcon = (status: Kustomization['status']) => {
    switch (status) {
      case 'Ready': return CheckCircle
      case 'NotReady': return XCircle
      case 'Progressing': return RefreshCw
      case 'Suspended': return Clock
      default: return AlertTriangle
    }
  }

  const getStatusColor = (status: Kustomization['status']) => {
    switch (status) {
      case 'Ready': return 'green'
      case 'NotReady': return 'red'
      case 'Progressing': return 'blue'
      case 'Suspended': return 'gray'
      default: return 'orange'
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  }

  const readyCount = kustomizations.filter(k => k.status === 'Ready').length
  const notReadyCount = kustomizations.filter(k => k.status === 'NotReady').length

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={160} height={20} />
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
          <Layers className="w-4 h-4 text-pink-400" />
          <span className="text-sm font-medium text-muted-foreground">Kustomizations</span>
          {notReadyCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
              {notReadyCount} failing
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
          Select a cluster to view Kustomizations
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
            <div className="flex-1 p-2 rounded-lg bg-pink-500/10 text-center">
              <span className="text-lg font-bold text-pink-400">{kustomizations.length}</span>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-green-500/10 text-center">
              <span className="text-lg font-bold text-green-400">{readyCount}</span>
              <p className="text-xs text-muted-foreground">Ready</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-red-500/10 text-center">
              <span className="text-lg font-bold text-red-400">{notReadyCount}</span>
              <p className="text-xs text-muted-foreground">Failing</p>
            </div>
          </div>

          {/* Kustomizations list */}
          <div className="flex-1 space-y-2 overflow-y-auto">
            {kustomizations.map((ks, idx) => {
              const StatusIcon = getStatusIcon(ks.status)
              const color = getStatusColor(ks.status)

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-lg ${ks.status === 'NotReady' ? 'bg-red-500/10 border border-red-500/20' : 'bg-secondary/30'} hover:bg-secondary/50 transition-colors`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`w-4 h-4 text-${color}-400 ${ks.status === 'Progressing' ? 'animate-spin' : ''}`} />
                      <span className="text-sm text-white font-medium">{ks.name}</span>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded bg-${color}-500/20 text-${color}-400`}>
                      {ks.status}
                    </span>
                  </div>
                  <div className="ml-6 text-xs text-muted-foreground space-y-0.5">
                    <div className="flex items-center gap-1">
                      <GitBranch className="w-3 h-3" />
                      <span className="truncate">{ks.path}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="truncate">{ks.revision.split('@')[1]?.slice(0, 12)}</span>
                      <span>{formatTime(ks.lastApplied)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            Flux Kustomize Controller
          </div>
        </>
      )}
    </div>
  )
}
