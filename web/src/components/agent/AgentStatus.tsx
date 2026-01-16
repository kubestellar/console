'use client'

import { useLocalAgent } from '@/hooks/useLocalAgent'

export function AgentStatus() {
  const { status, health, error, isDemoMode } = useLocalAgent()

  if (status === 'connecting') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
        Connecting to local agent...
      </div>
    )
  }

  if (isDemoMode) {
    return (
      <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-yellow-600 dark:text-yellow-400">
          <div className="h-2 w-2 rounded-full bg-yellow-500" />
          Demo Mode - Local Agent Not Connected
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {error || 'Install the local agent to access your clusters and Claude Code.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
      <div className="h-2 w-2 rounded-full bg-green-500" />
      Connected to local agent v{health?.version}
      {health?.clusters && ` - ${health.clusters} clusters`}
      {health?.hasClaude && ' - Claude available'}
    </div>
  )
}

export function AgentInstallBanner() {
  const { isDemoMode } = useLocalAgent()

  if (!isDemoMode) return null

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const installCommand = 'brew install kubestellar/tap/kkc-agent && kkc-agent'

  return (
    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-6">
      <h3 className="text-lg font-semibold">Connect to Your Local Environment</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Install the local agent to access your kubeconfig clusters and Claude Code.
      </p>

      <div className="mt-4">
        <div className="text-sm font-medium mb-2">Copy and paste this command:</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded bg-muted px-4 py-3 text-sm font-mono select-all">
            {installCommand}
          </code>
          <button
            onClick={() => copyToClipboard(installCommand)}
            className="rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Copy
          </button>
        </div>
      </div>

      <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
        <span>✓ Access all your clusters</span>
        <span>✓ Real-time token tracking</span>
        <span>✓ Runs locally (secure)</span>
      </div>
    </div>
  )
}
