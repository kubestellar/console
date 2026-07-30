import type { RefObject } from 'react'
import { Server, Box, Loader2 } from 'lucide-react'
import { SetupInstructionsDialog } from '../../setup/SetupInstructionsDialog'
import { AgentApprovalDialog, hasApprovedAgents } from '../../agent/AgentApprovalDialog'
import { cn } from '../../../lib/cn'
import { AgentStatusBadge } from './AgentStatusBadge'
import { AgentCapabilityList } from './AgentCapabilityList'
import { ConnectionHealthBar } from './ConnectionHealthBar'
import { useAgentStatusIndicatorState } from './useAgentStatusIndicatorState'

const CONNECTION_LOG_LIMIT = 20

interface AgentStatusIndicatorProps {
  /** Force label text to be visible (used in overflow menu) */
  showLabel?: boolean
}

export function AgentStatusIndicator({ showLabel = false }: AgentStatusIndicatorProps) {
  const {
    t,
    showAgentStatus,
    setShowAgentStatus,
    showSetupDialog,
    setShowSetupDialog,
    showApprovalDialog,
    setShowApprovalDialog,
    discoveredAgents,
    isDiscoveringAgents,
    dropdownRef,
    containerRef,
    handleKeyDown,
    openAgentApprovalDialog,
    toggleDemoMode,
    isDemoMode,
    isClusterBacked,
    isConnected,
    isDegraded,
    isAuthError,
    agentHealth,
    selectedAgent,
    agents,
    backendStatus,
    isBackendConnected,
    visibleConnectionEvents,
    pillStyle,
    statusDotClassName,
    statusLabel,
    statusDescription,
    lastErrorMessage,
    isLoadingState,
    activeAgent,
    agentRef,
    isDemoModeForced,
  } = useAgentStatusIndicatorState()

  return (
    <>
      <div className="relative" ref={agentRef}>
        <AgentStatusBadge
          isLoading={isLoadingState}
          connectingLabel={t('agent.connecting')}
          pillStyle={pillStyle}
          showLabel={showLabel}
          onClick={() => setShowAgentStatus(!showAgentStatus)}
        />

        {showAgentStatus && (
          <div
            ref={dropdownRef}
            className="absolute top-full right-0 mt-2 w-96 bg-card border border-border rounded-lg shadow-xl z-toast"
          >
            <div
              ref={containerRef as RefObject<HTMLDivElement | null>}
              onKeyDown={handleKeyDown}
              role="menu"
              data-testid="navbar-agent-status-dropdown"
            >
            <div className="p-3 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-foreground">{t('agent.demoMode')}</span>
                </div>
                <button
                  role="menuitem"
                  data-testid="demo-mode-toggle"
                  disabled={isDiscoveringAgents}
                  onClick={() => {
                    if (isDemoModeForced && isDemoMode) {
                      setShowSetupDialog(true)
                      setShowAgentStatus(false)
                      return
                    }
                    toggleDemoMode()
                  }}
                  className={cn(
                    'relative w-11 h-6 rounded-full transition-colors',
                    isDemoMode ? 'bg-purple-500' : 'bg-secondary',
                    isDiscoveringAgents && 'opacity-50 cursor-wait',
                  )}
                >
                  {isDiscoveringAgents ? (
                    <Loader2 className="absolute top-1 left-3.5 w-4 h-4 animate-spin text-purple-200" />
                  ) : (
                    <span
                      className={cn(
                        'absolute top-1 left-1 w-4 h-4 bg-foreground rounded-full transition-transform shadow-xs',
                        isDemoMode ? 'translate-x-5' : 'translate-x-0',
                      )}
                    />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {isDemoMode ? t('agent.demoModeShowingSample') : t('agent.enableToViewDemo')}
              </p>
            </div>

            <AgentCapabilityList
              statusDotClassName={statusDotClassName}
              statusLabel={statusLabel}
              statusDescription={statusDescription}
              isDemoMode={isDemoMode}
              isDemoModeForced={isDemoModeForced}
              isConnected={isConnected}
              isAuthError={isAuthError}
              isDegraded={isDegraded}
              selectedAgent={selectedAgent}
              activeAgent={activeAgent}
              agentHealth={agentHealth}
              showApprovalButton={!isDemoMode && isAuthError && !hasApprovedAgents()}
              onOpenApprovalDialog={openAgentApprovalDialog}
              approvalButtonLabel={t('agent.approval.title')}
              selfHostLabel={t('agent.selfHostToConnect')}
              lastErrorMessage={lastErrorMessage}
            />

            {!isDemoMode && (
              <div className="p-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-3 h-3 rounded-full',
                      isBackendConnected
                        ? 'bg-green-400'
                        : backendStatus === 'connecting'
                          ? 'bg-yellow-400'
                          : 'bg-red-400',
                    )}
                  />
                  <span className="text-sm font-medium text-foreground">
                    {isBackendConnected
                      ? t('agent.backendApiConnected')
                      : backendStatus === 'connecting'
                        ? t('agent.backendApiConnecting')
                        : t('agent.backendApiDisconnected')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isBackendConnected
                    ? t('agent.connectedToBackend')
                    : backendStatus === 'connecting'
                      ? t('agent.checkingBackend')
                      : t('agent.unableToConnectBackend')}
                </p>
              </div>
            )}

            <ConnectionHealthBar
              title={t('agent.connectionLog')}
              noEventsLabel={t('agent.noEventsYet')}
              events={visibleConnectionEvents}
              limit={CONNECTION_LOG_LIMIT}
            />

            {!isClusterBacked && (
              <div className="p-3 border-t border-border bg-secondary/20">
                <h4 className="text-xs font-medium text-foreground mb-2 flex items-center gap-2">
                  <Server className="w-3 h-3 text-purple-400" />
                  {t('agent.installLocalAgent')}
                </h4>
                <p className="text-xs text-muted-foreground mb-2">{t('agent.localAgentDesc')}</p>
                <div className="bg-black/50 rounded p-2 font-mono text-xs text-green-400 mb-2 space-y-1">
                  <div className="text-muted-foreground">{t('agent.installViaHomebrewMacOS')}</div>
                  <code className="block">{t('agent.tapKubestellar')}</code>
                  <code className="block">{t('agent.installKcAgent')}</code>
                </div>
                <div className="bg-black/50 rounded p-2 font-mono text-xs text-green-400 mb-2 space-y-1">
                  <div className="text-muted-foreground">{t('agent.installLinuxBuildFromSource')}</div>
                  <code className="block">git clone https://github.com/kubestellar/console.git</code>
                  <code className="block">cd console &amp;&amp; go build -o bin/kc-agent ./cmd/kc-agent</code>
                  <code className="block">./bin/kc-agent</code>
                </div>
                <p className="text-2xs text-muted-foreground">
                  {t('agent.visitGithub')}{' '}
                  <a
                    href="https://github.com/kubestellar/homebrew-tap"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 underline"
                  >
                    github.com/kubestellar/homebrew-tap
                  </a>{' '}
                  {t('agent.forMoreInfo')}
                </p>
              </div>
            )}
            </div>
          </div>
        )}
      </div>

      <SetupInstructionsDialog isOpen={showSetupDialog} onClose={() => setShowSetupDialog(false)} />
      <AgentApprovalDialog
        isOpen={showApprovalDialog}
        agents={agents.length > 0 ? agents : discoveredAgents}
        onApprove={() => {
          setShowApprovalDialog(false)
          toggleDemoMode()
        }}
        onCancel={() => setShowApprovalDialog(false)}
      />
    </>
  )
}
