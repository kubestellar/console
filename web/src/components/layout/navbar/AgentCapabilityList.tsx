import { cn } from '../../../lib/cn'
import type { AgentHealth } from '../../../hooks/useLocalAgent'
import type { AgentInfo } from '../../../types/agent'

interface AgentCapabilityListProps {
  statusDotClassName: string
  statusLabel: string
  statusDescription: string
  isDemoMode: boolean
  isDemoModeForced: boolean
  isConnected: boolean
  isAuthError: boolean
  isDegraded: boolean
  selectedAgent: string | null
  activeAgent: AgentInfo | undefined
  agentHealth: AgentHealth | null
  showApprovalButton: boolean
  onOpenApprovalDialog: () => void
  approvalButtonLabel: string
  selfHostLabel: string
  lastErrorMessage: string | null
}

export function AgentCapabilityList({
  statusDotClassName,
  statusLabel,
  statusDescription,
  isDemoMode,
  isDemoModeForced,
  isConnected,
  isAuthError,
  isDegraded,
  selectedAgent,
  activeAgent,
  agentHealth,
  showApprovalButton,
  onOpenApprovalDialog,
  approvalButtonLabel,
  selfHostLabel,
  lastErrorMessage,
}: AgentCapabilityListProps) {
  return (
    <div className="p-3 border-b border-border">
      <div className="flex items-center gap-2">
        <div className={cn('w-3 h-3 rounded-full', statusDotClassName)} />
        <span className={cn('text-sm font-medium', isDemoMode ? 'text-muted-foreground' : 'text-foreground')}>
          {statusLabel}
        </span>
        {(isConnected || isAuthError) && agentHealth?.version && agentHealth.version !== 'demo' && (
          <span className="text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
            v{agentHealth.version}
          </span>
        )}
      </div>

      {isConnected && selectedAgent && selectedAgent !== 'none' && activeAgent && (
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs text-foreground font-medium">{activeAgent.displayName}</span>
          {activeAgent.model ? (
            <span className="text-2xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              {activeAgent.model}
            </span>
          ) : activeAgent.provider === 'github-cli' ? (
            <span className="text-2xs text-muted-foreground italic">Default model</span>
          ) : null}
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-1">{statusDescription}</p>

      {showApprovalButton && (
        <button
          role="menuitem"
          data-testid="agent-approval-cta"
          onClick={onOpenApprovalDialog}
          className="mt-2 rounded border border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5 text-xs font-medium text-yellow-300 hover:bg-yellow-500/20"
        >
          {approvalButtonLabel}
        </button>
      )}

      {isDemoMode && isDemoModeForced && (
        <p className="text-xs text-muted-foreground mt-1">
          <a
            href="https://github.com/kubestellar/console#quick-start"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:text-purple-300 underline underline-offset-2"
          >
            {selfHostLabel}
          </a>
        </p>
      )}

      {!isDemoMode && isDegraded && lastErrorMessage && (
        <p className="text-xs text-yellow-400 mt-1">{lastErrorMessage}</p>
      )}
    </div>
  )
}
