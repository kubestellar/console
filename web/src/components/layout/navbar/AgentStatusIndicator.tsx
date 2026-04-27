import { useState, useRef, useEffect } from 'react'
import { Server, Box, Wifi, WifiOff, Loader2 } from 'lucide-react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useMissions } from '../../../hooks/useMissions'
import { useBackendHealth } from '../../../hooks/useBackendHealth'
import {
  useDemoMode,
  isDemoModeForced,
  getDemoMode,
} from '../../../hooks/useDemoMode'
import { SetupInstructionsDialog } from '../../setup/SetupInstructionsDialog'
import {
  AgentApprovalDialog,
  hasApprovedAgents,
} from '../../agent/AgentApprovalDialog'
import { cn } from '../../../lib/cn'
import { useTranslation } from 'react-i18next'
import {
  TOAST_DISMISS_MS,
  LOCAL_AGENT_HTTP_URL,
  BACKEND_HEALTH_CHECK_TIMEOUT_MS,
} from '../../../lib/constants/network'
import { agentFetch } from '@/hooks/mcp/shared'
import type { AgentInfo } from '../../../types/agent'

const CONNECTING_DEBOUNCE_MS = 300

export function AgentStatusIndicator() {
  const { t } = useTranslation(['common'])
  const {
    status: agentStatus,
    health: agentHealth,
    connectionEvents,
    isConnected,
    isDegraded,
    dataErrorCount,
    lastDataError,
  } = useLocalAgent()
  const { selectedAgent, agents } = useMissions()
  const {
    status: backendStatus,
    isConnected: isBackendConnected,
    isInClusterMode,
  } = useBackendHealth()
  const { isDemoMode: isDemoModeHook, toggleDemoMode } = useDemoMode()
  // Synchronous fallback prevents flash of WifiOff icon during React transitions
  const isDemoMode = isDemoModeHook || getDemoMode()
  const [showAgentStatus, setShowAgentStatus] = useState(false)
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const [showApprovalDialog, setShowApprovalDialog] = useState(false)
  const [discoveredAgents, setDiscoveredAgents] = useState<AgentInfo[]>([])
  const [isDiscoveringAgents, setIsDiscoveringAgents] = useState(false)
  const agentRef = useRef<HTMLDivElement>(null)

  // Fetch agents from kc-agent health endpoint (works even in demo mode
  // when the WebSocket is not connected)
  const fetchAgentsFromHealth = async () => {
    setIsDiscoveringAgents(true)
    try {
      const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(BACKEND_HEALTH_CHECK_TIMEOUT_MS),
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.availableProviders) {
        // Map agent name to provider type for icon rendering
        const nameToProvider: Record<string, string> = {
          'claude-code': 'anthropic-local',
          codex: 'openai-cli',
          'copilot-cli': 'github',
          'gemini-cli': 'google-cli',
          'antigravity': 'google-ag',
          'bob': 'bob',
          'vscode': 'microsoft' }
        setDiscoveredAgents(data.availableProviders.map((p: { name: string; displayName: string; capabilities: number }) => ({
          name: p.name,
          displayName: p.displayName,
          description: '',
          provider: nameToProvider[p.name] || p.name,
          available: true,
          capabilities: p.capabilities })))
      }
    } catch {
      // kc-agent not reachable
    } finally {
      setIsDiscoveringAgents(false)
    }
  }
  const dropdownRef = useRef<HTMLDivElement>(null)

  // ── Stabilize pill status ──────────────────────────────────────────────
  // Two separate problems solved here:
  //
  // 1. Navigation flicker: React route transitions cause the agent hook to
  //    briefly report 'connecting' for 1-2 frames → visible yellow flash.
  //    Fix: debounce 'connecting' status for 300ms before showing it.
  //
  // 2. Demo toggle flash: toggling demo off causes disconnected→connecting→
  //    connected sequence → visible red/yellow flash before green.
  //    Fix: sticky demo styling that persists until agent actually connects.

  // --- Status debounce (fixes navigation flicker) ---
  const connectingTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [stableStatus, setStableStatus] = useState(agentStatus)

  useEffect(() => {
    if (agentStatus === 'connecting') {
      // Don't immediately show "connecting" — wait 300ms to confirm it's real
      connectingTimerRef.current = setTimeout(() => {
        setStableStatus('connecting')
      }, CONNECTING_DEBOUNCE_MS)
    } else {
      // Any non-connecting status applies immediately
      if (connectingTimerRef.current) clearTimeout(connectingTimerRef.current)
      setStableStatus(agentStatus)
    }
    return () => {
      if (connectingTimerRef.current) clearTimeout(connectingTimerRef.current)
    }
  }, [agentStatus])

  const stableConnected =
    stableStatus === 'connected' || stableStatus === 'degraded'
  const stableDegraded = stableStatus === 'degraded'

  // --- Sticky demo styling (fixes demo toggle flash) ---
  // When demo mode is on, showDemoStyle=true. When demo mode is toggled off,
  // showDemoStyle stays true (sticky) until the agent connects or 3s elapses.
  const [showDemoStyle, setShowDemoStyle] = useState(isDemoMode)
  const demoExitTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Set sticky flag when entering demo mode
  useEffect(() => {
    if (isDemoMode) setShowDemoStyle(true)
  }, [isDemoMode])

  // Clear sticky flag once agent connects after leaving demo mode
  useEffect(() => {
    if (!isDemoMode && showDemoStyle && stableConnected) {
      setShowDemoStyle(false)
    }
  }, [isDemoMode, showDemoStyle, stableConnected])

  // Safety timeout: clear sticky flag after 3s even if agent never connects
  useEffect(() => {
    if (!isDemoMode && showDemoStyle) {
      demoExitTimerRef.current = setTimeout(
        () => setShowDemoStyle(false),
        TOAST_DISMISS_MS,
      )
      return () => {
        if (demoExitTimerRef.current) clearTimeout(demoExitTimerRef.current)
      }
    }
  }, [isDemoMode, showDemoStyle])

  // Close dropdown when clicking outside or moving mouse 20px+ away from
  // the combined trigger-button + dropdown area.
  useEffect(() => {
    if (!showAgentStatus) return

    const CLOSE_DISTANCE = 20

    const handleClickOutside = (event: MouseEvent) => {
      if (
        agentRef.current &&
        !agentRef.current.contains(event.target as Node)
      ) {
        setShowAgentStatus(false)
      }
    }

    const handleMouseMove = (event: MouseEvent) => {
      const trigger = agentRef.current?.getBoundingClientRect()
      const dropdown = dropdownRef.current?.getBoundingClientRect()
      if (!trigger) return

      // Combined bounding box of trigger button + dropdown panel
      const top =
        Math.min(trigger.top, dropdown?.top ?? trigger.top) - CLOSE_DISTANCE
      const bottom =
        Math.max(trigger.bottom, dropdown?.bottom ?? trigger.bottom) +
        CLOSE_DISTANCE
      const left =
        Math.min(trigger.left, dropdown?.left ?? trigger.left) - CLOSE_DISTANCE
      const right =
        Math.max(trigger.right, dropdown?.right ?? trigger.right) +
        CLOSE_DISTANCE

      if (
        event.clientX < left ||
        event.clientX > right ||
        event.clientY < top ||
        event.clientY > bottom
      ) {
        setShowAgentStatus(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('mousemove', handleMouseMove)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('mousemove', handleMouseMove)
    }
  }, [showAgentStatus])

  // ── Compute pill appearance ────────────────────────────────────────────
  // Uses stabilized status values to prevent color flashes during navigation.
  // showDemoStyle is sticky: stays true after demo toggle until agent connects.
  const showAsDemoMode = isDemoMode || showDemoStyle
  const isClusterBacked = isInClusterMode && !showAsDemoMode

  // Backend health affects the indicator when agent is connected (but not in demo mode)
  const backendIssue =
    !showAsDemoMode && !isBackendConnected && backendStatus !== 'connecting'
  const isLiveMode = selectedAgent === 'none'
  const showInClusterConnectionLog =
    isInClusterMode && !isConnected && !isDemoMode
  const visibleConnectionEvents = showInClusterConnectionLog
    ? [
        {
          timestamp: new Date(),
          type: 'connected' as const,
          message: t('agent.usingInClusterService'),
        },
      ]
    : connectionEvents

  const pillStyle = showAsDemoMode
    ? {
        bg: 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20',
        dot: 'bg-purple-400',
        label: t('agent.demoMode'),
        Icon: Box,
        title: t('agent.demoModeTitle'),
      }
    : stableDegraded
      ? {
          bg: 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20',
          dot: 'bg-yellow-400 animate-pulse',
          label: t('agent.degraded'),
          Icon: Wifi,
          title: t('agent.degradedTitle', { count: dataErrorCount }),
        }
      : stableConnected && backendIssue
        ? {
            bg: 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20',
            dot: 'bg-yellow-400 animate-pulse',
            label: t('agent.aiLabel'),
            Icon: Wifi,
            title: t('agent.backendUnavailable'),
          }
        : stableConnected && isLiveMode
          ? {
              bg: 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20',
              dot: 'bg-cyan-400',
              label: t('agent.liveLabel'),
              Icon: Wifi,
              title: t('agent.liveMode'),
            }
          : stableConnected
            ? {
                bg: 'bg-green-500/10 text-green-400 hover:bg-green-500/20',
                dot: 'bg-green-400',
                label: t('agent.aiLabel'),
                Icon: Wifi,
                title: t('agent.localAgentConnected'),
              }
            : stableStatus === 'connecting'
              ? {
                  bg: 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20',
                  dot: 'bg-yellow-400 animate-pulse',
                  label: t('agent.aiLabel'),
                  Icon: Wifi,
                  title: t('agent.connecting'),
                }
              : isInClusterMode
                ? {
                    bg: 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20',
                    dot: 'bg-blue-400',
                    label: t('agent.cluster'),
                    Icon: Server,
                    title: t('agent.inClusterModeTitle'),
                  }
                : {
                    bg: 'bg-red-500/10 text-red-400 hover:bg-red-500/20',
                    dot: 'bg-red-400',
                    label: t('agent.offline'),
                    Icon: WifiOff,
                    title: t('agent.localAgentDisconnected'),
                  }

  // Loading state: show spinner while initial agent status is resolving (#6772)
  if (stableStatus === 'connecting' && !showAsDemoMode && !isInClusterMode) {
    return (
      <div className="relative" ref={agentRef}>
        <div
          className={cn(
            'flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg whitespace-nowrap',
            'bg-yellow-500/10 text-yellow-400',
          )}
        >
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-medium hidden sm:inline whitespace-nowrap">
            {t('agent.connecting')}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="relative" ref={agentRef}>
      <button
        onClick={() => setShowAgentStatus(!showAgentStatus)}
        className={cn(
          'flex items-center justify-center gap-2 px-3 py-1.5 h-9 rounded-lg whitespace-nowrap',
          pillStyle.bg,
        )}
        title={pillStyle.title}
      >
        <pillStyle.Icon className="w-4 h-4" />
        <span className="text-sm font-medium hidden sm:inline whitespace-nowrap">
          {pillStyle.label}
        </span>
        <span
          className={cn('w-2 h-2 rounded-full shrink-0', pillStyle.dot)}
        />
      </button>

      {/* Agent status dropdown */}
      {showAgentStatus && (
        <div
          ref={dropdownRef}
          className="absolute top-full right-0 mt-2 w-96 bg-card border border-border rounded-lg shadow-xl z-dropdown"
        >
          {/* Demo Mode Toggle */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-foreground">
                  {t('agent.demoMode')}
                </span>
              </div>
              <button
                disabled={isDiscoveringAgents}
                onClick={() => {
                  if (isDemoModeForced && isDemoMode) {
                    setShowSetupDialog(true)
                    setShowAgentStatus(false)
                  } else if (isDemoMode && !hasApprovedAgents()) {
                    // Switching from demo → agent: require opt-in first
                    // Fetch agents from kc-agent before showing dialog
                    // (WebSocket is not connected in demo mode)
                    fetchAgentsFromHealth()
                    setShowApprovalDialog(true)
                    setShowAgentStatus(false)
                  } else {
                    toggleDemoMode()
                  }
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
              {isDemoMode
                ? t('agent.demoModeShowingSample')
                : t('agent.enableToViewDemo')}
            </p>
          </div>

          {/* Agent Status */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-3 h-3 rounded-full',
                  isDemoMode
                    ? 'bg-gray-400'
                    : isClusterBacked
                      ? 'bg-blue-400'
                      : isDegraded
                        ? 'bg-yellow-400'
                        : isConnected
                          ? 'bg-green-400'
                          : stableStatus === 'connecting'
                            ? 'bg-yellow-400'
                            : 'bg-red-400',
                )}
              />
              <span
                className={cn(
                  'text-sm font-medium',
                  isDemoMode ? 'text-muted-foreground' : 'text-foreground',
                )}
              >
                {isDemoMode
                  ? t('agent.localAgentBypassed')
                  : isClusterBacked
                    ? t('agent.clusterMode')
                    : isDegraded
                      ? t('agent.localAgentDegraded')
                      : isConnected
                        ? t('agent.localAgentConnectedLabel')
                        : stableStatus === 'connecting'
                          ? t('agent.localAgentConnecting')
                          : t('agent.localAgentDisconnectedLabel')}
              </span>
              {isConnected &&
                agentHealth?.version &&
                agentHealth.version !== 'demo' && (
                  <span className="text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                    v{agentHealth.version}
                  </span>
                )}
            </div>
            {/* Show selected agent name and model when connected */}
            {isConnected &&
              selectedAgent &&
              selectedAgent !== 'none' &&
              (() => {
                const activeAgent = agents.find((a) => a.name === selectedAgent)
                return activeAgent ? (
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-foreground font-medium">
                      {activeAgent.displayName}
                    </span>
                    {activeAgent.model ? (
                      <span className="text-2xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                        {activeAgent.model}
                      </span>
                    ) : activeAgent.provider === 'github-cli' ? (
                      <span className="text-2xs text-muted-foreground italic">
                        Default model
                      </span>
                    ) : null}
                  </div>
                ) : null
              })()}
            <p className="text-xs text-muted-foreground mt-1">
              {isDemoMode
                ? isDemoModeForced
                  ? // Hosted demo (e.g. console.kubestellar.io): agent can never connect
                    // from this origin, so point the user at the self-host path.
                    t('agent.hostedDemoBypassed')
                  : t('agent.agentBypassedInDemo')
                : isClusterBacked
                  ? t('agent.usingInClusterService')
                  : isDegraded
                    ? t('agent.connectedButErrors', { count: dataErrorCount })
                    : isConnected
                      ? t('agent.connectedToLocalAgent')
                      : t('agent.unableToConnect')}
            </p>
            {/* When running on the hosted demo, surface a self-host link so
                users who want real cluster data know where to go next. */}
            {isDemoMode && isDemoModeForced && (
              <p className="text-xs text-muted-foreground mt-1">
                <a
                  href="https://github.com/kubestellar/console#quick-start"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300 underline underline-offset-2"
                >
                  {t('agent.selfHostToConnect')}
                </a>
              </p>
            )}
            {!isDemoMode && isDegraded && lastDataError && (
              <p className="text-xs text-yellow-400 mt-1">
                {t('agent.lastError', { error: lastDataError })}
              </p>
            )}
          </div>

          {/* Backend API Status - only show when not in demo mode */}
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

          <div className="p-2 max-h-48 overflow-y-auto">
            <div className="text-xs text-muted-foreground px-2 py-1 font-medium">
              {t('agent.connectionLog')}
            </div>
            {visibleConnectionEvents.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-4">
                {t('agent.noEventsYet')}
              </div>
            ) : (
              <div className="space-y-1">
                {visibleConnectionEvents.slice(0, 20).map((event, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-secondary/30"
                  >
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full mt-1 shrink-0',
                        event.type === 'connected'
                          ? 'bg-green-400'
                          : event.type === 'disconnected'
                            ? 'bg-red-400'
                            : event.type === 'error'
                              ? 'bg-red-400'
                              : 'bg-yellow-400',
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground">{event.message}</p>
                      <p className="text-2xs text-muted-foreground">
                        {event.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Install instructions are only relevant for local-agent mode */}
          {!isClusterBacked && (
            <div className="p-3 border-t border-border bg-secondary/20">
              <h4 className="text-xs font-medium text-foreground mb-2 flex items-center gap-2">
                <Server className="w-3 h-3 text-purple-400" />
                {t('agent.installLocalAgent')}
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                {t('agent.localAgentDesc')}
              </p>
              <div className="bg-black/50 rounded p-2 font-mono text-[11px] text-green-400 mb-2 space-y-1">
                <div className="text-muted-foreground">
                  {t('agent.installViaHomebrewMacOS')}
                </div>
                <code className="block">{t('agent.tapKubestellar')}</code>
                <code className="block">{t('agent.installKcAgent')}</code>
              </div>
              <div className="bg-black/50 rounded p-2 font-mono text-[11px] text-green-400 mb-2 space-y-1">
                <div className="text-muted-foreground">
                  {t('agent.installLinuxBuildFromSource')}
                </div>
                <code className="block">
                  git clone https://github.com/kubestellar/console.git
                </code>
                <code className="block">
                  cd console &amp;&amp; go build -o bin/kc-agent ./cmd/kc-agent
                </code>
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
      )}
      <SetupInstructionsDialog
        isOpen={showSetupDialog}
        onClose={() => setShowSetupDialog(false)}
      />
      <AgentApprovalDialog
        isOpen={showApprovalDialog}
        agents={agents.length > 0 ? agents : discoveredAgents}
        onApprove={() => {
          setShowApprovalDialog(false)
          toggleDemoMode()
        }}
        onCancel={() => setShowApprovalDialog(false)}
      />
    </div>
  )
}
