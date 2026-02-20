import { useState, useEffect, useCallback } from 'react'
import { isDemoModeForced } from './useDemoMode'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { emitAgentConnected, emitAgentDisconnected, emitConversionStep } from '../lib/analytics'

export interface AgentHealth {
  status: string
  version: string
  clusters: number
  hasClaude: boolean
  claude?: {
    installed: boolean
    path?: string
    version?: string
    tokenUsage: {
      session: { input: number; output: number }
      today: { input: number; output: number }
      thisMonth: { input: number; output: number }
    }
  }
}

export type AgentConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'degraded'

export interface ConnectionEvent {
  timestamp: Date
  type: 'connected' | 'disconnected' | 'error' | 'connecting'
  message: string
}

const POLL_INTERVAL = 10000 // Check every 10 seconds when connected
const DISCONNECTED_POLL_INTERVAL = 60000 // Check every 60 seconds when disconnected
const FAILURE_THRESHOLD = 2 // Require 2 consecutive failures before disconnecting
const SUCCESS_THRESHOLD = 2 // Require 2 consecutive successes before reconnecting (prevents flicker)
const AGGRESSIVE_POLL_INTERVAL = 1000 // 1 second during aggressive detection burst
const AGGRESSIVE_DETECT_DURATION = 10000 // 10 seconds of aggressive polling

// Demo data for when agent is not connected
const DEMO_DATA: AgentHealth = {
  status: 'demo',
  version: 'demo',
  clusters: 3,
  hasClaude: false,
  claude: {
    installed: false,
    tokenUsage: {
      session: { input: 0, output: 0 },
      today: { input: 0, output: 0 },
      thisMonth: { input: 0, output: 0 },
    },
  },
}

// ============================================================================
// Singleton Agent Manager - ensures only ONE polling loop exists globally
// ============================================================================

interface AgentState {
  status: AgentConnectionStatus
  health: AgentHealth | null
  error: string | null
  connectionEvents: ConnectionEvent[]
  dataErrorCount: number
  lastDataError: string | null
}

type Listener = (state: AgentState) => void

class AgentManager {
  private state: AgentState = isDemoModeForced ? {
    status: 'disconnected',
    health: DEMO_DATA,
    error: 'Demo mode - agent connection skipped',
    connectionEvents: [],
    dataErrorCount: 0,
    lastDataError: null,
  } : {
    status: 'connecting',
    health: null,
    error: null,
    connectionEvents: [],
    dataErrorCount: 0,
    lastDataError: null,
  }
  private listeners: Set<Listener> = new Set()
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private failureCount = 0
  private successCount = 0 // Track consecutive successes for hysteresis
  private dataErrorTimestamps: number[] = [] // Track recent data errors
  private isChecking = false
  private isStarted = false
  private maxEvents = 50
  private dataErrorWindow = 60000 // 1 minute window for data errors
  private dataErrorThreshold = 3 // Errors within window to trigger degraded
  private aggressiveDetectTimeout: ReturnType<typeof setTimeout> | null = null

  private currentPollInterval = POLL_INTERVAL

  start() {
    if (this.isStarted) return
    this.isStarted = true

    // On Netlify deployments, skip agent connection entirely (no local agent available)
    if (isDemoModeForced) {
      this.setState({
        status: 'disconnected',
        health: DEMO_DATA,
        error: 'Demo mode - agent connection skipped',
      })
      return
    }

    this.addEvent('connecting', 'Attempting to connect to local agent...')
    this.checkAgent()
    this.currentPollInterval = POLL_INTERVAL
    this.pollInterval = setInterval(() => this.checkAgent(), this.currentPollInterval)
  }

  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    if (this.aggressiveDetectTimeout) {
      clearTimeout(this.aggressiveDetectTimeout)
      this.aggressiveDetectTimeout = null
    }
    this.isStarted = false
    this.isChecking = false // Reset so next start can check immediately
  }

  private adjustPollInterval(interval: number) {
    if (this.currentPollInterval === interval) return
    this.currentPollInterval = interval
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = setInterval(() => this.checkAgent(), interval)
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    // Start polling when first subscriber joins
    if (this.listeners.size === 1) {
      this.start()
    }
    // Immediately notify new subscriber of current state
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
      // Stop polling when last subscriber leaves
      if (this.listeners.size === 0) {
        this.stop()
      }
    }
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.state))
  }

  private setState(updates: Partial<AgentState>, forceNotify = false) {
    const prevState = this.state
    this.state = { ...this.state, ...updates }

    // Only notify if state actually changed (prevents UI flashing on background polls)
    const hasChanged = forceNotify ||
      prevState.status !== this.state.status ||
      prevState.error !== this.state.error ||
      prevState.dataErrorCount !== this.state.dataErrorCount ||
      // For health, only check meaningful changes
      prevState.health?.clusters !== this.state.health?.clusters ||
      prevState.health?.hasClaude !== this.state.health?.hasClaude ||
      prevState.health?.status !== this.state.health?.status

    if (hasChanged) {
      this.notify()
    }
  }

  private addEvent(type: ConnectionEvent['type'], message: string) {
    const event: ConnectionEvent = {
      timestamp: new Date(),
      type,
      message,
    }
    // Keep only the most recent events
    this.state.connectionEvents = [
      event,
      ...this.state.connectionEvents.slice(0, this.maxEvents - 1),
    ]
  }

  async checkAgent() {
    // Skip if already checking (prevent overlapping requests)
    if (this.isChecking) {
      return
    }
    this.isChecking = true

    try {
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })

      if (response.ok) {
        const data = await response.json()
        const wasDisconnected = this.state.status === 'disconnected'
        const wasConnecting = this.state.status === 'connecting'
        const wasConnected = this.state.status === 'connected' || this.state.status === 'degraded'
        this.failureCount = 0 // Reset failure count on success
        this.successCount++ // Track consecutive successes

        // Hysteresis: require multiple successes to reconnect from disconnected (prevents flicker)
        if (wasDisconnected && this.successCount >= SUCCESS_THRESHOLD) {
          this.addEvent('connected', `Connected to local agent v${data.version || 'unknown'}`)
          // Reconnected - speed up polling
          this.adjustPollInterval(POLL_INTERVAL)
          this.setState({
            health: data,
            status: 'connected',
            error: null,
          })
          emitAgentConnected(data.version || 'unknown', data.clusters || 0)
        } else if (wasConnecting) {
          // Initial connection - connect immediately on first success
          this.addEvent('connected', `Connected to local agent v${data.version || 'unknown'}`)
          this.adjustPollInterval(POLL_INTERVAL)
          this.setState({
            health: data,
            status: 'connected',
            error: null,
          })
          emitAgentConnected(data.version || 'unknown', data.clusters || 0)
          emitConversionStep(3, 'agent', { agent_version: data.version || 'unknown' })
          if ((data.clusters || 0) > 0) {
            emitConversionStep(4, 'clusters', { cluster_count: String(data.clusters) })
          }
        } else if (wasConnected) {
          // Already connected - just update health data
          this.setState({
            health: data,
            status: 'connected',
            error: null,
          })
        }
        // If wasDisconnected but not enough successes yet, don't change status
      } else {
        throw new Error(`Agent returned ${response.status}`)
      }
    } catch {
      this.failureCount++
      this.successCount = 0 // Reset success count on failure
      // Only mark as disconnected after multiple consecutive failures
      if (this.failureCount >= FAILURE_THRESHOLD) {
        const wasConnected = this.state.status === 'connected'
        const wasConnecting = this.state.status === 'connecting'
        if (wasConnected) {
          this.addEvent('disconnected', 'Lost connection to local agent')
          emitAgentDisconnected()
        } else if (wasConnecting) {
          this.addEvent('error', 'Failed to connect - local agent not available')
        }
        this.setState({
          status: 'disconnected',
          health: DEMO_DATA,
          error: 'Local agent not available',
        })
        // Slow down polling when disconnected to avoid spamming console errors
        this.adjustPollInterval(DISCONNECTED_POLL_INTERVAL)
      }
    } finally {
      this.isChecking = false
    }
  }

  getState() {
    return this.state
  }

  // Report a data endpoint error (e.g., /clusters returned 503)
  reportDataError(endpoint: string, error: string) {
    const now = Date.now()
    this.dataErrorTimestamps.push(now)

    // Clean up old timestamps outside the window
    this.dataErrorTimestamps = this.dataErrorTimestamps.filter(
      ts => now - ts < this.dataErrorWindow
    )

    const recentErrors = this.dataErrorTimestamps.length

    // Only transition to degraded if we're currently connected
    if (this.state.status === 'connected' && recentErrors >= this.dataErrorThreshold) {
      this.addEvent('error', `Data endpoint errors: ${endpoint} - ${error}`)
      this.setState({
        status: 'degraded',
        dataErrorCount: recentErrors,
        lastDataError: `${endpoint}: ${error}`,
      })
    } else if (this.state.status === 'degraded') {
      // Update error count while degraded
      this.setState({
        dataErrorCount: recentErrors,
        lastDataError: `${endpoint}: ${error}`,
      })
    }
  }

  // Report successful data fetch - can recover from degraded
  reportDataSuccess() {
    if (this.state.status === 'degraded') {
      // Clear old errors and check if we can recover
      const now = Date.now()
      this.dataErrorTimestamps = this.dataErrorTimestamps.filter(
        ts => now - ts < this.dataErrorWindow
      )

      if (this.dataErrorTimestamps.length < this.dataErrorThreshold) {
        this.addEvent('connected', 'Data endpoints recovered')
        this.setState({
          status: 'connected',
          dataErrorCount: 0,
          lastDataError: null,
        })
      }
    }
  }

  // Aggressively attempt to detect the agent.
  // Resets state to 'connecting' so isAgentUnavailable() returns false,
  // fires an immediate health check, and enters rapid 1s polling for 10s.
  aggressiveDetect() {
    if (this.aggressiveDetectTimeout) {
      clearTimeout(this.aggressiveDetectTimeout)
      this.aggressiveDetectTimeout = null
    }

    this.failureCount = 0
    this.successCount = 0

    this.addEvent('connecting', 'Aggressive detection: searching for local agent...')
    this.setState({
      status: 'connecting',
      error: null,
    })

    this.adjustPollInterval(AGGRESSIVE_POLL_INTERVAL)
    this.checkAgent()

    this.aggressiveDetectTimeout = setTimeout(() => {
      this.aggressiveDetectTimeout = null
      if (this.state.status !== 'connected' && this.state.status !== 'degraded') {
        this.adjustPollInterval(DISCONNECTED_POLL_INTERVAL)
      } else {
        this.adjustPollInterval(POLL_INTERVAL)
      }
    }, AGGRESSIVE_DETECT_DURATION)
  }
}

// Global singleton instance
const agentManager = new AgentManager()

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
 * Check if the agent is currently connected (from non-hook code)
 * Returns true if connected or degraded, false if disconnected or connecting
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
  await new Promise(resolve => setTimeout(resolve, 200))
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

  const refresh = useCallback(() => {
    agentManager.checkAgent()
  }, [])

  // Install instructions
  const installInstructions = {
    title: 'Install Local Agent',
    description:
      'To connect to your local kubeconfig and Claude Code, install the kc-agent on your machine.',
    steps: [
      {
        title: 'Install via Homebrew (macOS)',
        command: 'brew install kubestellar/tap/kc-agent && kc-agent',
      },
      {
        title: 'Or build from source',
        command: 'go install github.com/kubestellar/console/cmd/kc-agent@latest && kc-agent',
      },
    ],
    benefits: [
      'Access all your kubeconfig clusters',
      'Real-time token usage tracking',
      'Secure local-only connection (127.0.0.1)',
    ],
  }

  const reportDataError = useCallback((endpoint: string, error: string) => {
    agentManager.reportDataError(endpoint, error)
  }, [])

  const reportDataSuccess = useCallback(() => {
    agentManager.reportDataSuccess()
  }, [])

  return {
    status: state.status,
    health: state.health,
    error: state.error,
    connectionEvents: state.connectionEvents,
    dataErrorCount: state.dataErrorCount,
    lastDataError: state.lastDataError,
    isConnected: state.status === 'connected' || state.status === 'degraded',
    isDegraded: state.status === 'degraded',
    isDemoMode: state.status === 'disconnected',
    installInstructions,
    refresh,
    reportDataError,
    reportDataSuccess,
  }
}
