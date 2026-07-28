import { useState, useRef, useEffect } from 'react'
import { Server, Box, Wifi, WifiOff } from 'lucide-react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useMissions } from '../../../hooks/useMissions'
import { useBackendHealth } from '../../../hooks/useBackendHealth'
import { useKeyboardNav } from '../../../hooks/useKeyboardNav'
import { useDemoMode, isDemoModeForced, getDemoMode } from '../../../hooks/useDemoMode'
import { useTranslation } from 'react-i18next'
import { useDashboardHealth } from '../../../hooks/useDashboardHealth'
import {
  TOAST_DISMISS_MS,
  LOCAL_AGENT_HTTP_URL,
  BACKEND_HEALTH_CHECK_TIMEOUT_MS,
  isLocalAgentSuppressed,
} from '../../../lib/constants/network'
import { agentFetch } from '@/hooks/mcp/shared'
import type { AgentInfo } from '../../../types/agent'
import type { AgentStatusPillStyle } from './AgentStatusBadge'

const CONNECTING_DEBOUNCE_MS = 300

export function useAgentStatusIndicatorState() {
  const { t } = useTranslation(['common'])
  const {
    status: agentStatus,
    health: agentHealth,
    connectionEvents,
    isConnected,
    isDegraded,
    isAuthError,
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
  const dashboardHealth = useDashboardHealth()
  const isDemoMode = isDemoModeHook || getDemoMode()

  const [showAgentStatus, setShowAgentStatus] = useState(false)
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const [showApprovalDialog, setShowApprovalDialog] = useState(false)
  const [discoveredAgents, setDiscoveredAgents] = useState<AgentInfo[]>([])
  const [isDiscoveringAgents, setIsDiscoveringAgents] = useState(false)
  const agentRef = useRef<HTMLDivElement>(null)
  const { containerRef, handleKeyDown } = useKeyboardNav({
    selector: '[role="menuitem"]:not([disabled])',
    orientation: 'vertical',
    onEscape: () => setShowAgentStatus(false),
  })

  const fetchAgentsFromHealth = async () => {
    if (isLocalAgentSuppressed()) return

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
        const nameToProvider: Record<string, string> = {
          'claude-code': 'anthropic-local',
          codex: 'openai-cli',
          'copilot-cli': 'github',
          'gemini-cli': 'google-cli',
          antigravity: 'google-ag',
          bob: 'bob',
          vscode: 'microsoft',
        }
        setDiscoveredAgents((data.availableProviders || []).map((p: { name: string; displayName: string; capabilities: number }) => ({
          name: p.name,
          displayName: p.displayName,
          description: '',
          provider: nameToProvider[p.name] || p.name,
          available: true,
          capabilities: p.capabilities,
        })))
      }
    } catch {
      // kc-agent not reachable
    } finally {
      setIsDiscoveringAgents(false)
    }
  }

  const openAgentApprovalDialog = () => {
    void fetchAgentsFromHealth()
    setShowApprovalDialog(true)
    setShowAgentStatus(false)
  }

  const dropdownRef = useRef<HTMLDivElement>(null)

  const connectingTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [stableStatus, setStableStatus] = useState(agentStatus)

  useEffect(() => {
    if (agentStatus === 'connecting') {
      connectingTimerRef.current = setTimeout(() => {
        setStableStatus('connecting')
      }, CONNECTING_DEBOUNCE_MS)
    } else {
      if (connectingTimerRef.current) clearTimeout(connectingTimerRef.current)
      setStableStatus(agentStatus)
    }
    return () => {
      if (connectingTimerRef.current) clearTimeout(connectingTimerRef.current)
    }
  }, [agentStatus])

  const stableConnected = stableStatus === 'connected' || stableStatus === 'degraded'
  const stableAuthError = stableStatus === 'auth_error'

  const [showDemoStyle, setShowDemoStyle] = useState(isDemoMode)
  const demoExitTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (isDemoMode) setShowDemoStyle(true)
  }, [isDemoMode])

  useEffect(() => {
    if (!isDemoMode && showDemoStyle && (stableConnected || stableAuthError)) {
      setShowDemoStyle(false)
    }
  }, [isDemoMode, showDemoStyle, stableAuthError, stableConnected])

  useEffect(() => {
    if (!isDemoMode && showDemoStyle) {
      demoExitTimerRef.current = setTimeout(() => setShowDemoStyle(false), TOAST_DISMISS_MS)
      return () => {
        if (demoExitTimerRef.current) clearTimeout(demoExitTimerRef.current)
      }
    }
  }, [isDemoMode, showDemoStyle])

  useEffect(() => {
    if (!showAgentStatus) return

    const CLOSE_DISTANCE = 20

    const closeDropdown = () => {
      setShowAgentStatus(false)
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (agentRef.current && !agentRef.current.contains(event.target as Node)) {
        closeDropdown()
      }
    }

    const handleMouseMove = (event: MouseEvent) => {
      const trigger = agentRef.current?.getBoundingClientRect()
      const dropdown = dropdownRef.current?.getBoundingClientRect()
      if (!trigger) return

      const top = Math.min(trigger.top, dropdown?.top ?? trigger.top) - CLOSE_DISTANCE
      const bottom = Math.max(trigger.bottom, dropdown?.bottom ?? trigger.bottom) + CLOSE_DISTANCE
      const left = Math.min(trigger.left, dropdown?.left ?? trigger.left) - CLOSE_DISTANCE
      const right = Math.max(trigger.right, dropdown?.right ?? trigger.right) + CLOSE_DISTANCE

      if (
        event.clientX < left ||
        event.clientX > right ||
        event.clientY < top ||
        event.clientY > bottom
      ) {
        closeDropdown()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDropdown()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showAgentStatus])

  const showAsDemoMode = isDemoMode || showDemoStyle
  const hasBackendOnlyLiveConnection = isLocalAgentSuppressed() && isBackendConnected && backendStatus === 'connected'
  const isClusterBacked = (isInClusterMode || hasBackendOnlyLiveConnection) && !showAsDemoMode
  const systemHealthTooltip = [dashboardHealth.message, ...dashboardHealth.details].join('\n')

  const backendIssue = !showAsDemoMode && !isBackendConnected && backendStatus !== 'connecting'
  const isLiveMode = selectedAgent === 'none'
  const showInClusterConnectionLog = isInClusterMode && !isConnected && !isDemoMode
  const visibleConnectionEvents = showInClusterConnectionLog
    ? [
      {
        timestamp: new Date(),
        type: 'connected' as const,
        message: t('agent.usingInClusterService'),
      },
    ]
    : (connectionEvents || [])

  const degradedTooltip = backendIssue
    ? t('agent.backendUnavailable')
    : t('agent.degradedTitle', { count: dataErrorCount })
  const connectedTooltip = isLiveMode
    ? t('agent.liveMode')
    : t('agent.localAgentConnected')

  const pillStyle: AgentStatusPillStyle = showAsDemoMode
    ? {
      bg: 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20',
      dot: 'bg-purple-400',
      label: t('agent.demoMode'),
      Icon: Box,
      title: t('agent.demoModeTitle'),
    }
    : stableStatus === 'degraded' || (stableConnected && backendIssue)
      ? {
        bg: 'bg-red-500/10 text-red-400 hover:bg-red-500/20',
        dot: 'bg-red-400 animate-pulse',
        label: dashboardHealth.message,
        Icon: Wifi,
        title: degradedTooltip,
      }
      : dashboardHealth.status === 'warning'
        ? {
          bg: 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20',
          dot: 'bg-yellow-400 animate-pulse',
          label: dashboardHealth.message,
          Icon: Wifi,
          title: systemHealthTooltip,
        }
        : stableConnected || hasBackendOnlyLiveConnection
          ? {
            bg: isLiveMode
              ? 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20'
              : 'bg-green-500/10 text-green-400 hover:bg-green-500/20',
            dot: isLiveMode ? 'bg-cyan-400' : 'bg-green-400',
            label: t('networkUtils.online'),
            Icon: Wifi,
            title: connectedTooltip,
          }
          : stableStatus === 'connecting'
            ? {
              bg: 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20',
              dot: 'bg-yellow-400 animate-pulse',
              label: t('agent.connecting'),
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
                label: t('networkUtils.offline'),
                Icon: WifiOff,
                title: t('agent.localAgentDisconnected'),
              }

  const statusDotClassName = isDemoMode
    ? 'bg-gray-400'
    : isClusterBacked
      ? 'bg-blue-400'
      : isDegraded || isAuthError
        ? 'bg-yellow-400'
        : isConnected
          ? 'bg-green-400'
          : stableStatus === 'connecting'
            ? 'bg-yellow-400'
            : 'bg-red-400'

  const statusLabel = isDemoMode
    ? t('agent.localAgentBypassed')
    : isClusterBacked
      ? t('agent.clusterMode')
      : isDegraded
        ? t('agent.localAgentDegraded')
        : isAuthError
          ? t('agent.localAgentAuthErrorLabel')
          : isConnected
            ? t('agent.localAgentConnectedLabel')
            : stableStatus === 'connecting'
              ? t('agent.localAgentConnecting')
              : t('agent.localAgentDisconnectedLabel')

  const statusDescription = isDemoMode
    ? isDemoModeForced
      ? t('agent.hostedDemoBypassed')
      : t('agent.agentBypassedInDemo')
    : isClusterBacked
      ? t('agent.usingInClusterService')
      : isDegraded
        ? t('agent.connectedButErrors', { count: dataErrorCount })
        : isAuthError
          ? t('agent.authErrorDescription')
          : isConnected
            ? t('agent.connectedToLocalAgent')
            : t('agent.unableToConnect')

  const lastErrorMessage = !isDemoMode && isDegraded && lastDataError
    ? t('agent.lastError', { error: lastDataError })
    : null

  const isLoadingState =
    stableStatus === 'connecting' &&
    !showAsDemoMode &&
    !isInClusterMode &&
    dashboardHealth.status === 'healthy'

  const activeAgent = (agents || []).find((a) => a.name === selectedAgent)

  return {
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
    stableStatus,
    agentHealth,
    selectedAgent,
    agents,
    dataErrorCount,
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
    showAsDemoMode,
    isInClusterMode,
    isDemoModeForced,
  }
}
