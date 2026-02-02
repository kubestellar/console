import { useState, useEffect, useCallback } from 'react'
import { getDemoMode } from './useDemoMode'

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

const LOCAL_AGENT_URL = 'http://127.0.0.1:8585'
const POLL_INTERVAL = 15000 // Check every 15 seconds when connected
const DISCONNECTED_POLL_INTERVAL = 120000 // Check every 2 minutes when disconnected (reduce flickering)
const INITIAL_FAILURE_THRESHOLD = 1 // Fail fast on initial connection (1 failure)
const CONNECTED_FAILURE_THRESHOLD = 2 // Require 2 consecutive failures when already connected
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
  // Start in disconnected state - only switch to connected after confirmed success
  // This prevents UI flickering during initial connection attempts
  private state: AgentState = {
    status: 'disconnected',
    health: DEMO_DATA,
    error: getDemoMode() ? 'Demo mode - agent connection skipped' : null,
    connectionEvents: [],
    dataErrorCount: 0,
    lastDataError: null,
  }
  private hasEverConnected = false // Track if we've ever had a successful connection
  private listeners: Set<Listener> = new Set()
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private failureCount = 0
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

    // In demo mode, skip agent connection entirely to avoid console errors
    if (getDemoMode()) {
      this.setState({
        status: 'disconnected',
        health: DEMO_DATA,
        error: 'Demo mode - agent connection skipped',
      })
      return
    }

    // Don't change status to 'connecting' - stay disconnected until we confirm connection
    // This prevents UI flickering
    this.checkAgent()
    // Start with disconnected poll interval - will speed up once connected
    this.currentPollInterval = DISCONNECTED_POLL_INTERVAL
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
      const response = await fetch(`${LOCAL_AGENT_URL}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        // Short timeout to fail fast
        signal: AbortSignal.timeout(3000),
      })

      if (response.ok) {
        const data = await response.json()
        const wasDisconnected = this.state.status !== 'connected'
        this.failureCount = 0 // Reset failure count on success

        if (wasDisconnected) {
          this.hasEverConnected = true
          this.addEvent('connected', `Connected to local agent v${data.version || 'unknown'}`)
          // Connected - speed up polling
          this.adjustPollInterval(POLL_INTERVAL)
        }
        this.setState({
          health: data,
          status: 'connected',
          error: null,
        })
      } else {
        throw new Error(`Agent returned ${response.status}`)
      }
    } catch {
      this.failureCount++

      // Use different thresholds: fail fast initially, be more tolerant once connected
      const threshold = this.hasEverConnected ? CONNECTED_FAILURE_THRESHOLD : INITIAL_FAILURE_THRESHOLD

      if (this.failureCount >= threshold) {
        const wasConnected = this.state.status === 'connected'
        if (wasConnected) {
          this.addEvent('disconnected', 'Lost connection to local agent')
        }
        // Stay/go to disconnected - don't flicker
        this.setState({
          status: 'disconnected',
          health: DEMO_DATA,
          error: 'Local agent not available',
        })
        // Slow down polling when disconnected to reduce noise
        this.adjustPollInterval(DISCONNECTED_POLL_INTERVAL)
      }
      // If below threshold, silently continue without changing state
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
  // Fires rapid health checks for 10s to quickly find a newly started agent.
  // Stays disconnected until confirmed connected (no UI flickering).
  aggressiveDetect() {
    if (this.aggressiveDetectTimeout) {
      clearTimeout(this.aggressiveDetectTimeout)
      this.aggressiveDetectTimeout = null
    }

    this.failureCount = 0
    // Don't change state to 'connecting' - stay disconnected until confirmed

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
 * Returns true only if the agent is disconnected
 */
export function isAgentUnavailable(): boolean {
  const state = agentManager.getState()
  return state.status === 'disconnected'
}

/**
 * Trigger aggressive agent detection from non-hook code.
 * Call this when the user toggles demo mode OFF to immediately
 * attempt to find the kc-agent without waiting for the next poll cycle.
 *
 * Fires rapid health checks every 1s for 10s to quickly detect a newly started agent.
 * Status stays disconnected until a successful connection is confirmed.
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
