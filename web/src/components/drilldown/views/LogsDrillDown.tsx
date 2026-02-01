import { useState, useEffect } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'

interface Props {
  data: Record<string, unknown>
}

export function LogsDrillDown({ data }: Props) {
  const pod = data.pod as string
  const container = data.container as string | undefined
  const [tailLines, setTailLines] = useState(100)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setTimeout(() => {
      setIsLoading(false)
    }, 500)
  }

  return (
    <div className="space-y-4">
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
