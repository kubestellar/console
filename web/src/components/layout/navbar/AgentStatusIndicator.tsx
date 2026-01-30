import { useState, useRef, useEffect } from 'react'
import { Server, Box, Wifi, WifiOff } from 'lucide-react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDemoMode, isDemoModeForced } from '../../../hooks/useDemoMode'
import { SetupInstructionsDialog } from '../../setup/SetupInstructionsDialog'
import { cn } from '../../../lib/cn'

export function AgentStatusIndicator() {
  const { status: agentStatus, health: agentHealth, connectionEvents, isConnected, isDegraded, dataErrorCount, lastDataError } = useLocalAgent()
  const { isDemoMode, toggleDemoMode } = useDemoMode()
  const [showAgentStatus, setShowAgentStatus] = useState(false)
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const agentRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (agentRef.current && !agentRef.current.contains(event.target as Node)) {
        setShowAgentStatus(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={agentRef}>
      <button
        onClick={() => setShowAgentStatus(!showAgentStatus)}
        className={cn(
          'flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors',
          isDemoMode
            ? 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'
            : isDegraded
            ? 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
            : isConnected
            ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
            : agentStatus === 'connecting'
            ? 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
            : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
        )}
        title={isDemoMode ? 'Demo Mode - showing sample data' : isDegraded ? `Local Agent degraded (${dataErrorCount} errors)` : isConnected ? 'Local Agent connected' : agentStatus === 'connecting' ? 'Connecting to agent...' : 'Local Agent disconnected'}
      >
        {isDemoMode ? (
          <Box className="w-4 h-4" />
        ) : isConnected ? (
          <Wifi className="w-4 h-4" />
        ) : (
          <WifiOff className="w-4 h-4" />
        )}
        <span className="text-xs font-medium hidden sm:inline">
          {isDemoMode ? 'Demo' : isDegraded ? 'Degraded' : isConnected ? 'AI' : agentStatus === 'connecting' ? 'AI' : 'Offline'}
        </span>
        <span className={cn(
          'w-2 h-2 rounded-full',
          isDemoMode ? 'bg-purple-400' : isDegraded ? 'bg-yellow-400 animate-pulse' : isConnected ? 'bg-green-400' : agentStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'
        )} />
      </button>

      {/* Agent status dropdown */}
      {showAgentStatus && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-card border border-border rounded-lg shadow-xl z-50">
          {/* Demo Mode Toggle */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-foreground">Demo Mode</span>
              </div>
              <button
                onClick={() => {
                  if (isDemoModeForced && isDemoMode) {
                    setShowSetupDialog(true)
                    setShowAgentStatus(false)
                  } else {
                    toggleDemoMode()
                  }
                }}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors',
                  isDemoMode ? 'bg-purple-500' : 'bg-secondary'
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm',
                    isDemoMode ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {isDemoMode
                ? 'Showing sample data with all cloud providers'
                : 'Enable to view demo data without agent connection'
              }
            </p>
          </div>

          {/* Agent Status */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2">
              <div className={cn(
                'w-3 h-3 rounded-full',
                isDemoMode ? 'bg-gray-400' : isDegraded ? 'bg-yellow-400' : isConnected ? 'bg-green-400' : agentStatus === 'connecting' ? 'bg-yellow-400' : 'bg-red-400'
              )} />
              <span className={cn('text-sm font-medium', isDemoMode ? 'text-muted-foreground' : 'text-foreground')}>
                Local Agent: {isDemoMode ? 'Bypassed' : isDegraded ? 'Degraded' : isConnected ? 'Connected' : agentStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
              </span>
              {!isDemoMode && isConnected && agentHealth?.version && agentHealth.version !== 'demo' && (
                <span className="text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                  v{agentHealth.version}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isDemoMode
                ? 'Agent connection bypassed in demo mode'
                : isDegraded
                ? `Connected but experiencing data errors (${dataErrorCount} in last minute)`
                : isConnected
                ? `Connected to local agent at 127.0.0.1:8585`
                : 'Unable to connect to local agent'
              }
            </p>
            {!isDemoMode && isDegraded && lastDataError && (
              <p className="text-xs text-yellow-400 mt-1">
                Last error: {lastDataError}
              </p>
            )}
          </div>

          <div className="p-2 max-h-48 overflow-y-auto">
            <div className="text-xs text-muted-foreground px-2 py-1 font-medium">Connection Log</div>
            {connectionEvents.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-4">No events yet</div>
            ) : (
              <div className="space-y-1">
                {connectionEvents.slice(0, 20).map((event, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-secondary/30"
                  >
                    <div className={cn(
                      'w-2 h-2 rounded-full mt-1 flex-shrink-0',
                      event.type === 'connected' ? 'bg-green-400' :
                      event.type === 'disconnected' ? 'bg-red-400' :
                      event.type === 'error' ? 'bg-red-400' :
                      'bg-yellow-400'
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground">{event.message}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {event.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Install instructions - always visible at bottom */}
          <div className="p-3 border-t border-border bg-secondary/20">
            <h4 className="text-xs font-medium text-foreground mb-2 flex items-center gap-2">
              <Server className="w-3 h-3 text-purple-400" />
              Install Local Agent
            </h4>
            <p className="text-xs text-muted-foreground mb-2">
              The Local Agent enables real-time cluster data and kubectl operations.
            </p>
            <div className="bg-black/50 rounded p-2 font-mono text-[11px] text-green-400 mb-2 space-y-1">
              <div className="text-muted-foreground"># Install via Homebrew</div>
              <code className="block">brew tap kubestellar/tap</code>
              <code className="block">brew install kc-agent</code>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Visit{' '}
              <a
                href="https://github.com/kubestellar/homebrew-tap"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 underline"
              >
                github.com/kubestellar/homebrew-tap
              </a>
              {' '}for more information.
            </p>
          </div>
        </div>
      )}
      <SetupInstructionsDialog isOpen={showSetupDialog} onClose={() => setShowSetupDialog(false)} />
    </div>
  )
}
