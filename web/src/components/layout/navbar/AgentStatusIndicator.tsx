import { useState, useRef, useEffect } from 'react'
import { Server, Box, Wifi, WifiOff } from 'lucide-react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useBackendHealth } from '../../../hooks/useBackendHealth'
import { useDemoMode, isDemoModeForced, getDemoMode } from '../../../hooks/useDemoMode'
import { SetupInstructionsDialog } from '../../setup/SetupInstructionsDialog'
import { cn } from '../../../lib/cn'
import { useTranslation } from 'react-i18next'

export function AgentStatusIndicator() {
  const { t } = useTranslation(['common'])
  const { status: agentStatus, health: agentHealth, connectionEvents, isConnected, isDegraded, dataErrorCount, lastDataError } = useLocalAgent()
  const { status: backendStatus, isConnected: isBackendConnected, isInClusterMode } = useBackendHealth()
  const { isDemoMode: isDemoModeHook, toggleDemoMode } = useDemoMode()
  // Synchronous fallback prevents flash of WifiOff icon during React transitions
  const isDemoMode = isDemoModeHook || getDemoMode()
  const [showAgentStatus, setShowAgentStatus] = useState(false)
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const agentRef = useRef<HTMLDivElement>(null)
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
  const connectingTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const [stableStatus, setStableStatus] = useState(agentStatus)

  useEffect(() => {
    if (agentStatus === 'connecting') {
      // Don't immediately show "connecting" — wait 300ms to confirm it's real
      connectingTimerRef.current = setTimeout(() => {
        setStableStatus('connecting')
      }, 300)
    } else {
      // Any non-connecting status applies immediately
      if (connectingTimerRef.current) clearTimeout(connectingTimerRef.current)
      setStableStatus(agentStatus)
    }
    return () => { if (connectingTimerRef.current) clearTimeout(connectingTimerRef.current) }
  }, [agentStatus])

  const stableConnected = stableStatus === 'connected' || stableStatus === 'degraded'
  const stableDegraded = stableStatus === 'degraded'

  // --- Sticky demo styling (fixes demo toggle flash) ---
  // When demo mode is on, showDemoStyle=true. When demo mode is toggled off,
  // showDemoStyle stays true (sticky) until the agent connects or 3s elapses.
  const [showDemoStyle, setShowDemoStyle] = useState(isDemoMode)
  const demoExitTimerRef = useRef<ReturnType<typeof setTimeout>>()

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
      demoExitTimerRef.current = setTimeout(() => setShowDemoStyle(false), 3000)
      return () => { if (demoExitTimerRef.current) clearTimeout(demoExitTimerRef.current) }
    }
  }, [isDemoMode, showDemoStyle])

  // Close dropdown when clicking outside or moving mouse 20px+ away from
  // the combined trigger-button + dropdown area.
  useEffect(() => {
    if (!showAgentStatus) return

    const CLOSE_DISTANCE = 20

    const handleClickOutside = (event: MouseEvent) => {
      if (agentRef.current && !agentRef.current.contains(event.target as Node)) {
        setShowAgentStatus(false)
      }
    }

    const handleMouseMove = (event: MouseEvent) => {
      const trigger = agentRef.current?.getBoundingClientRect()
      const dropdown = dropdownRef.current?.getBoundingClientRect()
      if (!trigger) return

      // Combined bounding box of trigger button + dropdown panel
      const top = Math.min(trigger.top, dropdown?.top ?? trigger.top) - CLOSE_DISTANCE
      const bottom = Math.max(trigger.bottom, dropdown?.bottom ?? trigger.bottom) + CLOSE_DISTANCE
      const left = Math.min(trigger.left, dropdown?.left ?? trigger.left) - CLOSE_DISTANCE
      const right = Math.max(trigger.right, dropdown?.right ?? trigger.right) + CLOSE_DISTANCE

      if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) {
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

  // Backend health affects the indicator when agent is connected (but not in demo mode)
  const backendIssue = !showAsDemoMode && !isBackendConnected && backendStatus !== 'connecting'

  const pillStyle = showAsDemoMode
    ? { bg: 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20', dot: 'bg-purple-400', label: t('agent.demoMode'), Icon: Box, title: t('agent.demoModeTitle') }
    : stableDegraded
    ? { bg: 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20', dot: 'bg-yellow-400 animate-pulse', label: t('agent.degraded'), Icon: Wifi, title: t('agent.degradedTitle', { count: dataErrorCount }) }
    : stableConnected && backendIssue
    ? { bg: 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20', dot: 'bg-yellow-400 animate-pulse', label: t('agent.aiLabel'), Icon: Wifi, title: t('agent.backendUnavailable') }
    : stableConnected
    ? { bg: 'bg-green-500/10 text-green-400 hover:bg-green-500/20', dot: 'bg-green-400', label: t('agent.aiLabel'), Icon: Wifi, title: t('agent.localAgentConnected') }
    : stableStatus === 'connecting'
    ? { bg: 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20', dot: 'bg-yellow-400 animate-pulse', label: t('agent.aiLabel'), Icon: Wifi, title: t('agent.connecting') }
    : isInClusterMode
    ? { bg: 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20', dot: 'bg-blue-400', label: t('agent.cluster'), Icon: Server, title: t('agent.inClusterModeTitle') }
    : { bg: 'bg-red-500/10 text-red-400 hover:bg-red-500/20', dot: 'bg-red-400', label: t('agent.offline'), Icon: WifiOff, title: t('agent.localAgentDisconnected') }

  return (
    <div className="relative" ref={agentRef}>
      <button
        onClick={() => setShowAgentStatus(!showAgentStatus)}
        className={cn('flex items-center justify-center gap-2 w-[5.5rem] py-1.5 rounded-lg', pillStyle.bg)}
        title={pillStyle.title}
      >
        <pillStyle.Icon className="w-4 h-4" />
        <span className="text-xs font-medium hidden sm:inline whitespace-nowrap">
          {pillStyle.label}
        </span>
        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', pillStyle.dot)} />
      </button>

      {/* Agent status dropdown */}
      {showAgentStatus && (
        <div ref={dropdownRef} className="absolute top-full right-0 mt-2 w-72 bg-card border border-border rounded-lg shadow-xl z-50">
          {/* Demo Mode Toggle */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-foreground">{t('agent.demoMode')}</span>
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
                ? t('agent.demoModeShowingSample')
                : t('agent.enableToViewDemo')
              }
            </p>
          </div>

          {/* Agent Status */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2">
              <div className={cn(
                'w-3 h-3 rounded-full',
                isDemoMode ? 'bg-gray-400' : isDegraded ? 'bg-yellow-400' : isConnected ? 'bg-green-400' : agentStatus === 'connecting' ? 'bg-yellow-400' : isInClusterMode ? 'bg-blue-400' : 'bg-red-400'
              )} />
              <span className={cn('text-sm font-medium', isDemoMode ? 'text-muted-foreground' : 'text-foreground')}>
                {isDemoMode ? t('agent.localAgentBypassed') : isDegraded ? t('agent.localAgentDegraded') : isConnected ? t('agent.localAgentConnectedLabel') : agentStatus === 'connecting' ? t('agent.localAgentConnecting') : isInClusterMode ? t('agent.clusterMode') : t('agent.localAgentDisconnectedLabel')}
              </span>
              {isConnected && agentHealth?.version && agentHealth.version !== 'demo' && (
                <span className="text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                  v{agentHealth.version}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isDemoMode
                ? t('agent.agentBypassedInDemo')
                : isDegraded
                ? t('agent.connectedButErrors', { count: dataErrorCount })
                : isConnected
                ? t('agent.connectedToLocalAgent')
                : isInClusterMode
                ? t('agent.usingInClusterService')
                : t('agent.unableToConnect')
              }
            </p>
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
                <div className={cn(
                  'w-3 h-3 rounded-full',
                  isBackendConnected ? 'bg-green-400' : backendStatus === 'connecting' ? 'bg-yellow-400' : 'bg-red-400'
                )} />
                <span className="text-sm font-medium text-foreground">
                  {isBackendConnected ? t('agent.backendApiConnected') : backendStatus === 'connecting' ? t('agent.backendApiConnecting') : t('agent.backendApiDisconnected')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {isBackendConnected
                  ? t('agent.connectedToBackend')
                  : backendStatus === 'connecting'
                  ? t('agent.checkingBackend')
                  : t('agent.unableToConnectBackend')
                }
              </p>
            </div>
          )}

          <div className="p-2 max-h-48 overflow-y-auto">
            <div className="text-xs text-muted-foreground px-2 py-1 font-medium">{t('agent.connectionLog')}</div>
            {connectionEvents.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-4">{t('agent.noEventsYet')}</div>
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
              {t('agent.installLocalAgent')}
            </h4>
            <p className="text-xs text-muted-foreground mb-2">
              {t('agent.localAgentDesc')}
            </p>
            <div className="bg-black/50 rounded p-2 font-mono text-[11px] text-green-400 mb-2 space-y-1">
              <div className="text-muted-foreground">{t('agent.installViaHomebrew')}</div>
              <code className="block">{t('agent.tapKubestellar')}</code>
              <code className="block">{t('agent.installKcAgent')}</code>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t('agent.visitGithub')}{' '}
              <a
                href="https://github.com/kubestellar/homebrew-tap"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 underline"
              >
                github.com/kubestellar/homebrew-tap
              </a>
              {' '}{t('agent.forMoreInfo')}
            </p>
          </div>
        </div>
      )}
      <SetupInstructionsDialog isOpen={showSetupDialog} onClose={() => setShowSetupDialog(false)} />
    </div>
  )
}
