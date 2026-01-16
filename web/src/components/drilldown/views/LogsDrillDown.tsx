import { useState } from 'react'

interface Props {
  data: Record<string, unknown>
}

export function LogsDrillDown({ data }: Props) {
  const pod = data.pod as string
  const container = data.container as string | undefined
  const [tailLines, setTailLines] = useState(100)

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
Connect to klaude-ops MCP server to fetch real logs.`

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select
            value={tailLines}
            onChange={(e) => setTailLines(Number(e.target.value))}
            className="px-3 py-2 rounded-lg bg-card/50 border border-border text-foreground text-sm"
          >
            <option value={50}>Last 50 lines</option>
            <option value={100}>Last 100 lines</option>
            <option value={500}>Last 500 lines</option>
            <option value={1000}>Last 1000 lines</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" className="rounded" />
            Follow logs
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card">
            Download
          </button>
          <button className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm">
            Refresh
          </button>
        </div>
      </div>

      {/* Log Output */}
      <div className="rounded-lg bg-black/50 border border-border p-4 font-mono text-sm overflow-x-auto">
        <pre className="text-green-400 whitespace-pre-wrap">{mockLogs}</pre>
      </div>
    </div>
  )
}
