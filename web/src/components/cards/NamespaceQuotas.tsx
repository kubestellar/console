import { useState } from 'react'
import { Gauge, Cpu, HardDrive, Box, RefreshCw } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'

interface NamespaceQuotasProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

// Mock quota data - in a real implementation, this would come from the API
interface QuotaUsage {
  resource: string
  used: number
  limit: number
  unit: string
}

export function NamespaceQuotas({ config }: NamespaceQuotasProps) {
  const { clusters, isLoading, refetch } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [selectedNamespace, setSelectedNamespace] = useState<string>(config?.namespace || 'default')

  // Mock namespaces - in real implementation, fetch from API
  const namespaces = ['default', 'kube-system', 'monitoring', 'production', 'staging']

  // Mock quota data
  const quotas: QuotaUsage[] = selectedNamespace && selectedCluster ? [
    { resource: 'CPU Requests', used: 4, limit: 10, unit: 'cores' },
    { resource: 'CPU Limits', used: 8, limit: 20, unit: 'cores' },
    { resource: 'Memory Requests', used: 8, limit: 32, unit: 'Gi' },
    { resource: 'Memory Limits', used: 16, limit: 64, unit: 'Gi' },
    { resource: 'Pods', used: 25, limit: 100, unit: '' },
    { resource: 'Services', used: 5, limit: 20, unit: '' },
  ] : []

  const getIcon = (resource: string) => {
    if (resource.includes('CPU')) return Cpu
    if (resource.includes('Memory')) return HardDrive
    if (resource.includes('Pod')) return Box
    return Gauge
  }

  const getColor = (percent: number) => {
    if (percent >= 90) return 'red'
    if (percent >= 70) return 'orange'
    return 'green'
  }

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={140} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <div className="space-y-3">
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
        </div>
      </div>
    )
  }

  const needsSelection = !selectedCluster || !selectedNamespace

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-yellow-400" />
          <span className="text-sm font-medium text-muted-foreground">Namespace Quotas</span>
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
          onChange={(e) => setSelectedCluster(e.target.value)}
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
          <option value="">Select namespace...</option>
          {namespaces.map(ns => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </select>
      </div>

      {needsSelection ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a cluster and namespace
        </div>
      ) : (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            <ClusterBadge cluster={selectedCluster} />
            <span className="text-muted-foreground">/</span>
            <span className="text-sm text-white">{selectedNamespace}</span>
          </div>

          {/* Quota list */}
          <div className="flex-1 space-y-3 overflow-y-auto">
            {quotas.map((quota, idx) => {
              const percent = quota.limit > 0 ? (quota.used / quota.limit) * 100 : 0
              const color = getColor(percent)
              const Icon = getIcon(quota.resource)

              return (
                <div key={idx} className="p-3 rounded-lg bg-secondary/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 text-${color}-400`} />
                      <span className="text-sm text-white">{quota.resource}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {quota.used}{quota.unit} / {quota.limit}{quota.unit}
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-${color}-500 rounded-full transition-all duration-300`}
                      style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-end mt-1">
                    <span className={`text-xs text-${color}-400`}>{percent.toFixed(0)}%</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span>&lt;70%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-orange-500" />
                <span>70-90%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span>&gt;90%</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
