import { useState, useEffect, useRef } from 'react'
import { Loader2, AlertCircle, Server, Layers, Box } from 'lucide-react'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { useTranslation } from 'react-i18next'

interface Props {
  data: Record<string, unknown>
}

export function LogsDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const pod = data.pod as string
  const container = data.container as string | undefined
  const { drillToCluster, drillToNamespace, drillToPod } = useDrillDownActions()
  const clusterShort = cluster?.split('/').pop() || cluster
  const [tailLines, setTailLines] = useState(100)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current !== null) clearTimeout(refreshTimeoutRef.current)
    }
  }, [])

  // In a real implementation, this would fetch logs from the API
  // For now, show a placeholder with the log fetch parameters
  const mockLogs = `Fetching logs for pod: ${pod}
Container: ${container || 'all'}
Tail lines: ${tailLines}

[2024-01-16 10:00:00] Starting application...
[2024-01-16 10:00:01] Initializing components...
[2024-01-16 10:00:02] Server listening on port 8080
[2024-01-16 10:00:03] Connected to database
[2024-01-16 10:00:04] Health check passed
[2024-01-16 10:00:05] Ready to accept connections

Note: Live log streaming coming soon.
Connect to kubestellar-ops MCP server to fetch real logs.`

  // Simulate loading state when API is integrated
  useEffect(() => {
    // When real API is added, replace this with actual fetch logic
    setIsLoading(false)
    setError(null)
  }, [pod, container, tailLines])

  const handleRefresh = () => {
    // Placeholder for future API refresh
    setIsLoading(true)
    setError(null)
    if (refreshTimeoutRef.current !== null) clearTimeout(refreshTimeoutRef.current)
    refreshTimeoutRef.current = setTimeout(() => {
      setIsLoading(false)
    }, 500)
  }

  return (
    <div className="space-y-4">
      {/* Contextual Navigation */}
      {cluster && (
        <div className="flex items-center gap-6 text-sm">
          {pod && (
            <button
              onClick={() => drillToPod(cluster, namespace, pod)}
              className="flex items-center gap-2 hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
            >
              <Box className="w-4 h-4 text-cyan-400" />
              <span className="text-muted-foreground">{t('drilldown.fields.pod')}</span>
              <span className="font-mono text-cyan-400 group-hover:text-cyan-300 transition-colors">{pod}</span>
            </button>
          )}
          {namespace && (
            <button
              onClick={() => drillToNamespace(cluster, namespace)}
              className="flex items-center gap-2 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
            >
              <Layers className="w-4 h-4 text-purple-400" />
              <span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span>
              <span className="font-mono text-purple-400 group-hover:text-purple-300 transition-colors">{namespace}</span>
            </button>
          )}
          <button
            onClick={() => drillToCluster(cluster)}
            className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
          >
            <Server className="w-4 h-4 text-blue-400" />
            <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
            <ClusterBadge cluster={clusterShort} size="sm" />
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select
            value={tailLines}
            onChange={(e) => setTailLines(Number(e.target.value))}
            disabled={isLoading}
            className="px-3 py-2 rounded-lg bg-card/50 border border-border text-foreground text-sm disabled:opacity-50"
          >
            <option value={50}>Last 50 lines</option>
            <option value={100}>Last 100 lines</option>
            <option value={500}>Last 500 lines</option>
            <option value={1000}>Last 1000 lines</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" className="rounded" disabled={isLoading} />
            Follow logs
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card disabled:opacity-50" disabled={isLoading}>
            Download
          </button>
          <button 
            onClick={handleRefresh}
            disabled={isLoading}
            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Refresh
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <div>
            <div className="font-medium">Failed to load logs</div>
            <div className="text-sm text-muted-foreground">{error}</div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          <span className="ml-2 text-muted-foreground">Loading logs...</span>
        </div>
      )}

      {/* Log Output */}
      {!isLoading && !error && (
        <div className="rounded-lg bg-black/50 border border-border p-4 font-mono text-sm overflow-x-auto">
          <pre className="text-green-400 whitespace-pre-wrap">{mockLogs}</pre>
        </div>
      )}
    </div>
  )
}
