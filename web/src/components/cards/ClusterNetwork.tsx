import { useState, useMemo } from 'react'
import { Server, Globe, Shield, ExternalLink } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton } from '../ui/Skeleton'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'

interface ClusterNetworkProps {
  config?: {
    cluster?: string
  }
}

export function ClusterNetwork({ config }: ClusterNetworkProps) {
  const { t } = useTranslation()
  const { deduplicatedClusters: allClusters, isLoading } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')

  // Report state to CardWrapper for refresh animation
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    hasAnyData: allClusters.length > 0,
  })

  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()

  // Apply global filters
  const clusters = useMemo(() => {
    let result = allClusters

    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query)
      )
    }

    return result
  }, [allClusters, globalSelectedClusters, isAllClustersSelected, customFilter])

  const cluster = useMemo(() => {
    return clusters.find(c => c.name === selectedCluster)
  }, [clusters, selectedCluster])

  // Parse server URL for display
  const serverInfo = useMemo(() => {
    if (!cluster?.server) return null
    try {
      const url = new URL(cluster.server)
      return {
        host: url.hostname,
        port: url.port || '443',
        protocol: url.protocol.replace(':', ''),
      }
    } catch {
      return { host: cluster.server, port: '443', protocol: 'https' }
    }
  }, [cluster])

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={130} height={20} />
          <Skeleton variant="rounded" width={120} height={32} />
        </div>
        <Skeleton variant="rounded" height={80} className="mb-3" />
        <Skeleton variant="rounded" height={60} />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">No network data</p>
        <p className="text-xs mt-1">Connect to clusters to see network status</p>
      </div>
    )
  }

  if (!selectedCluster) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-end mb-4">
          <select
            value={selectedCluster}
            onChange={(e) => setSelectedCluster(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground"
          >
            <option value="">Select cluster...</option>
            {clusters.map(c => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Select a cluster to view network info
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden">
      {/* Controls */}
      <div className="flex items-center justify-between mb-4 gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm font-medium text-foreground truncate">{selectedCluster}</span>
          <div className={`w-2 h-2 rounded-full ${cluster?.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
        <div className="flex items-center gap-2">
          {!config?.cluster && (
            <select
              value={selectedCluster}
              onChange={(e) => setSelectedCluster(e.target.value)}
              className="px-2 py-1 rounded bg-secondary border border-border text-xs text-foreground"
            >
              {clusters.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Server Info */}
      {serverInfo && (
        <div className="p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/20 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-medium text-cyan-300">API Server</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-xs text-muted-foreground shrink-0">Host</span>
              <span className="text-sm text-foreground font-mono truncate">{serverInfo.host}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t('common.port')}</span>
              <span className="text-sm text-foreground font-mono">{serverInfo.port}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t('common.protocol')}</span>
              <span className="text-sm text-foreground font-mono uppercase">{serverInfo.protocol}</span>
            </div>
          </div>
        </div>
      )}

      {/* Connection Status */}
      <div className="space-y-3">
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${cluster?.healthy ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-sm text-muted-foreground">Connection Status</span>
            </div>
            <span className={`text-sm font-medium ${cluster?.healthy ? 'text-green-400' : 'text-red-400'}`}>
              {cluster?.healthy ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-muted-foreground">TLS</span>
            </div>
            <span className="text-sm font-medium text-green-400">{t('common.enabled')}</span>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-muted-foreground">{t('common.nodes')}</span>
            </div>
            <span className="text-sm font-medium text-foreground">{cluster?.nodeCount || 0}</span>
          </div>
        </div>
      </div>

      {/* Full URL */}
      {cluster?.server && (
        <div className="mt-4 pt-3 border-t border-border/50 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            <ExternalLink className="w-3 h-3 shrink-0" />
            <span className="truncate font-mono min-w-0">{cluster.server}</span>
          </div>
        </div>
      )}
    </div>
  )
}
