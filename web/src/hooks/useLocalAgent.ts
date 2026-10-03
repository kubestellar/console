import { useState, useEffect } from 'react'
import { TRANSITION_DELAY_MS } from '../lib/constants/network'
import { agentManager } from './useLocalAgent.manager'
import type { AgentState } from './useLocalAgent.types'

export type {
  ProviderSummary,
  AgentHealth,
  AgentConnectionStatus,
  ConnectionEvent,
} from './useLocalAgent.types'

// ============================================================================
// Non-hook API for reporting data errors from module-level code
// ============================================================================

/**
 * Report a data endpoint error from non-hook code (e.g., useMCP.ts)
 * This is used when the health endpoint passes but data endpoints fail
 */
export function reportAgentDataError(endpoint: string, error: string) {
  agentManager.reportDataError(endpoint, error)
}

/**
 * Report successful data fetch from non-hook code
 * This can help recover from degraded state
 */
export function reportAgentDataSuccess() {
  agentManager.reportDataSuccess()
}

/**
 * Report active operations to the agent manager for adaptive heartbeat (#14192).
 * Call this when starting AI missions, kubectl exec sessions, or other interactive operations
 * to increase heartbeat frequency for faster disconnect detection.
 * 
 * @param level - 'active' for regular operations, 'burst' for high-frequency operations
 */
export function reportAgentActivity(level: 'active' | 'burst' = 'active') {
  agentManager.reportActivity(level)
}

/**
 * Check if the agent is currently connected (from non-hook code)
 * Returns true if connected or degraded, false if disconnected, connecting,
 * or blocked by agent authentication.
 */
export function isAgentConnected(): boolean {
  const state = agentManager.getState()
  return state.status === 'connected' || state.status === 'degraded'
}

/**
 * Check if the agent is known to be unavailable (from non-hook code)
 * Returns true only if we've confirmed the agent is disconnected
 * During 'connecting' state, we return false to allow hooks to try the agent
 * (they have their own timeouts for handling failures)
 */
export function isAgentUnavailable(): boolean {
  const state = agentManager.getState()
  // Only skip agent if we've confirmed it's disconnected
  // During 'connecting' or 'connected' or 'degraded', allow agent attempts
  return state.status === 'disconnected'
}

/**
 * Check if the agent has been connected at least once during this session.
 * When true, the agent going offline should NOT trigger demo mode because
 * cached data is still available and should remain visible (#10470).
 */
export function wasAgentEverConnected(): boolean {
  return agentManager.getWasEverConnected()
}

/**
 * Get the number of clusters reported by the agent's health endpoint.
 * Returns 0 if the agent is disconnected or has no health data.
 * Used to trust agent connectivity over individual cluster health failures (#12410, #12419).
 */
export function getAgentClusterCount(): number {
  const state = agentManager.getState()
  return state.health?.clusters ?? 0
}

/**
 * Trigger aggressive agent detection from non-hook code.
 * Call this when the user toggles demo mode OFF to immediately
 * attempt to find the kc-agent without waiting for the next poll cycle.
 *
 * Resets agent status to 'connecting' (isAgentUnavailable() returns false),
 * fires an immediate health check, and polls every 1s for 10s.
 */
export async function triggerAggressiveDetection(): Promise<boolean> {
  agentManager.aggressiveDetect()
  // Wait briefly for the immediate health check to resolve
  await new Promise(resolve => setTimeout(resolve, TRANSITION_DELAY_MS))
  return agentManager.getState().status === 'connected'
}

// ============================================================================
// React Hook - subscribes to the singleton
// ============================================================================

export function useLocalAgent() {
  const [state, setState] = useState<AgentState>(agentManager.getState())

  useEffect(() => {
    // Subscribe to state changes
    const unsubscribe = agentManager.subscribe(setState)
    return unsubscribe
  }, [])

  const refresh = () => {
    agentManager.checkAgent()
  }

  // Install instructions
  const installInstructions = {
    title: 'Install Local Agent',
    description:
      'To connect to your local kubeconfig and Claude Code, install the kc-agent on your machine.',
    steps: [
      {
        title: 'Install via Homebrew (macOS / WSL)',
        command: 'brew tap kubestellar/tap && brew install --head kc-agent && kc-agent' },
      {
        title: 'Build from source (Linux / WSL — recommended)',
        command: 'git clone https://github.com/kubestellar/console.git && cd console && go build -o bin/kc-agent ./cmd/kc-agent && ./bin/kc-agent' },
      {
        title: 'Install via Linuxbrew (Linux / WSL — alternative)',
        command: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" && eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)" && brew tap kubestellar/tap && brew install --head kc-agent && kc-agent' },
    ],
    benefits: [
      'Access all your kubeconfig clusters',
      'Real-time token usage tracking',
      'Secure local-only connection (127.0.0.1)',
    ] }

  const reportDataError = (endpoint: string, error: string) => {
    agentManager.reportDataError(endpoint, error)
  }

  const reportDataSuccess = () => {
    agentManager.reportDataSuccess()
  }

  return {
    status: state.status,
    health: state.health,
    error: state.error,
    connectionEvents: state.connectionEvents,
    dataErrorCount: state.dataErrorCount,
    lastDataError: state.lastDataError,
    isConnected: state.status === 'connected' || state.status === 'degraded',
    isDegraded: state.status === 'degraded',
    isAuthError: state.status === 'auth_error',
    isDemoMode: state.status === 'disconnected',
    installInstructions,
    refresh,
    reportDataError,
    reportDataSuccess }
}
