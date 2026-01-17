import { useState, useMemo } from 'react'
import { Network, Server, Globe, Shield, RefreshCw, ExternalLink } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'

interface ClusterNetworkProps {
  config?: {
    cluster?: string
  }
}

export function ClusterNetwork({ config }: ClusterNetworkProps) {
  const { clusters, isLoading, refetch } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')

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

  if (isLoading) {
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

  if (!selectedCluster) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-medium text-muted-foreground">Cluster Network</span>
          </div>
          <select
            value={selectedCluster}
            onChange={(e) => setSelectedCluster(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-white"
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
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-white">{selectedCluster}</span>
          <div className={`w-2 h-2 rounded-full ${cluster?.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
        <div className="flex items-center gap-2">
          {!config?.cluster && (
            <select
              value={selectedCluster}
              onChange={(e) => setSelectedCluster(e.target.value)}
              className="px-2 py-1 rounded bg-secondary border border-border text-xs text-white"
            >
              {clusters.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => refetch()}
            className="p-1 hover:bg-secondary rounded transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
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
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Host</span>
              <span className="text-sm text-white font-mono">{serverInfo.host}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Port</span>
              <span className="text-sm text-white font-mono">{serverInfo.port}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Protocol</span>
              <span className="text-sm text-white font-mono uppercase">{serverInfo.protocol}</span>
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
            <span className="text-sm font-medium text-green-400">Enabled</span>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-muted-foreground">Nodes</span>
            </div>
            <span className="text-sm font-medium text-white">{cluster?.nodeCount || 0}</span>
          </div>
        </div>
      </div>

      {/* Full URL */}
      {cluster?.server && (
        <div className="mt-4 pt-3 border-t border-border/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ExternalLink className="w-3 h-3" />
            <span className="truncate font-mono">{cluster.server}</span>
          </div>
        </div>
      )}
    </div>
  )
}
