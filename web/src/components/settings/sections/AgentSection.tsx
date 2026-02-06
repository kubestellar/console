import { useState, useEffect, useRef } from 'react'
import { Plug, RefreshCw, Check, X, Copy, Cpu } from 'lucide-react'
import type { AgentHealth } from '../../../hooks/useLocalAgent'

interface AgentSectionProps {
  isConnected: boolean
  health: AgentHealth | null
  refresh: () => void
}

const INSTALL_COMMAND = 'brew install kubestellar/tap/kc-agent && kc-agent'

export function AgentSection({ isConnected, health, refresh }: AgentSectionProps) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<number>()

  const copyInstallCommand = async () => {
    await navigator.clipboard.writeText(INSTALL_COMMAND)
    setCopied(true)
    timeoutRef.current = setTimeout(() => setCopied(false), 2000)
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <div id="agent-settings" className="glass rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isConnected ? 'bg-green-500/20' : 'bg-orange-500/20'}`}>
            <Plug className={`w-5 h-5 ${isConnected ? 'text-green-400' : 'text-orange-400'}`} />
          </div>
          <div>
            <h2 className="text-lg font-medium text-foreground">Local Agent</h2>
            <p className="text-sm text-muted-foreground">Connect to your local kubeconfig and Claude Code</p>
          </div>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Connection Status */}
      <div className={`p-4 rounded-lg mb-4 ${isConnected ? 'bg-green-500/10 border border-green-500/20' : 'bg-orange-500/10 border border-orange-500/20'}`}>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <Check className="w-5 h-5 text-green-400" />
              <span className="font-medium text-green-400">Connected</span>
              <span className="text-muted-foreground">- Agent v{health?.version}</span>
            </>
          ) : (
            <>
              <X className="w-5 h-5 text-orange-400" />
              <span className="font-medium text-orange-400">Not Connected</span>
              <span className="text-muted-foreground">- Using demo data</span>
            </>
          )}
        </div>
        {isConnected && health && (
          <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
            <span>{health.clusters} clusters</span>
            {health.hasClaude && <span>Claude Code available</span>}
          </div>
        )}
      </div>

      {/* Install Instructions (when not connected) */}
      {!isConnected && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Install the local agent to access your kubeconfig clusters and Claude Code:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-4 py-3 rounded-lg bg-secondary font-mono text-sm select-all overflow-x-auto">
              {INSTALL_COMMAND}
            </code>
            <button
              onClick={copyInstallCommand}
              className="shrink-0 flex items-center gap-2 px-4 py-3 rounded-lg bg-purple-500 text-white hover:bg-purple-600"
            >
              <Copy className="w-4 h-4" />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>✓ Access all your clusters</span>
            <span>✓ Real-time token tracking</span>
            <span>✓ Runs locally (secure)</span>
          </div>
        </div>
      )}

      {/* Claude Code Details (when connected and Claude available) */}
      {isConnected && health?.hasClaude && health.claude && (
        <div className="mt-4 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="w-5 h-5 text-purple-400" />
            <span className="font-medium text-purple-400">Claude Code</span>
            <span className="text-muted-foreground text-sm">v{health.claude.version}</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground mb-1">This Session</p>
              <p className="text-sm font-mono text-foreground">
                {((health.claude.tokenUsage.session.input + health.claude.tokenUsage.session.output) / 1000).toFixed(1)}k
              </p>
              <p className="text-xs text-muted-foreground">tokens</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground mb-1">Today</p>
              <p className="text-sm font-mono text-foreground">
                {((health.claude.tokenUsage.today.input + health.claude.tokenUsage.today.output) / 1000).toFixed(1)}k
              </p>
              <p className="text-xs text-muted-foreground">tokens</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground mb-1">This Month</p>
              <p className="text-sm font-mono text-foreground">
                {((health.claude.tokenUsage.thisMonth.input + health.claude.tokenUsage.thisMonth.output) / 1000000).toFixed(2)}M
              </p>
              <p className="text-xs text-muted-foreground">tokens</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
