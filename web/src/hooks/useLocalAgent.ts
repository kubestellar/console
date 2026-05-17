import { useState, useEffect } from 'react'
import { isDemoModeForced } from './useDemoMode'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { TRANSITION_DELAY_MS } from '../lib/constants/network'
import { emitAgentConnected, emitAgentDisconnected, emitAgentProvidersDetected, emitConversionStep } from '../lib/analytics'
import { safeGetItem, safeSetItem } from '../lib/utils/localStorage'
import { STORAGE_KEY_FIRST_AGENT_CONNECT } from '../lib/constants/storage'
import { triggerAllRefetches } from '../lib/modeTransition'
import { agentFetch } from './mcp/shared'

export interface ProviderSummary {
  name: string
  displayName: string
  capabilities: number // bitmask: 1=chat, 2=toolExec
}

export interface AgentHealth {
  status: string
  version: string
  commitSHA?: string
  buildTime?: string
  goVersion?: string
  os?: string
  arch?: string
  clusters: number
  hasClaude: boolean
  install_method?: string
  availableProviders?: ProviderSummary[]
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

export type AgentConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'connecting'
  | 'degraded'
  | 'auth_error'

export interface ConnectionEvent {
  timestamp: Date
  type: 'connected' | 'disconnected' | 'error' | 'connecting'
  message: string
}

// Adaptive heartbeat intervals — scale based on cluster activity
const POLL_INTERVAL_IDLE = 5_000 // Check every 5 seconds when idle
const POLL_INTERVAL_ACTIVE = 2_000 // Check every 2 seconds during active sessions (AI missions, kubectl ops)
const POLL_INTERVAL_BURST = 1_000 // Check every 1 second during high-activity bursts
const DISCONNECTED_POLL_INTERVAL = 60_000 // Check every 60 seconds when disconnected
const FAILURE_THRESHOLD = 2 // Require 2 consecutive failures before disconnecting (prevents flicker)
// Short timeout for agent health checks — a healthy agent responds in <100ms.
// Using the default 10s timeout causes false failures when the browser's
// HTTP/1.1 connection pool (6 per origin) is saturated by concurrent requests.
const AGENT_HEALTH_TIMEOUT_MS = 1_500 // Reduced for faster disconnect detection (#14192)
const HTTP_UNAUTHORIZED_STATUS = 401
const HTTP_FORBIDDEN_STATUS = 403
const AUTH_ERROR_STATUS_CODES = new Set([
  HTTP_UNAUTHORIZED_STATUS,
  HTTP_FORBIDDEN_STATUS,
])
const SUCCESS_THRESHOLD = 2 // Require 2 consecutive successes before reconnecting (prevents flicker)
const AGGRESSIVE_POLL_INTERVAL = 1_000 // 1 second during aggressive detection burst
const AGGRESSIVE_DETECT_DURATION = 10_000 // 10 seconds of aggressive polling
const BROWSER_WAKE_DEBOUNCE_MS = 1_000
const ACTIVITY_COOLDOWN_MS = 30_000 // Return to idle polling after 30 seconds of inactivity
const BURST_COOLDOWN_MS = 10_000 // Return to active polling after 10 seconds of burst inactivity

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
      thisMonth: { input: 0, output: 0 } } } }

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
  activityLevel: 'idle' | 'active' | 'burst' // Adaptive heartbeat activity level (#14192)
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
    activityLevel: 'idle' } : {
    status: 'connecting',
    health: null,
    error: null,
    connectionEvents: [],
    dataErrorCount: 0,
    lastDataError: null,
    activityLevel: 'idle' }
  private listeners: Set<Listener> = new Set()
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private failureCount = 0
  private successCount = 0 // Track consecutive successes for hysteresis
  /** Whether the agent has been connected at least once this session.
   *  Used to decide if going offline should preserve cached data (#10470). */
  private wasEverConnected = Boolean(safeGetItem(STORAGE_KEY_FIRST_AGENT_CONNECT))
  private dataErrorTimestamps: number[] = [] // Track recent data errors
  private isChecking = false
  private isStarted = false
  private maxEvents = 50
  private dataErrorWindow = 60000 // 1 minute window for data errors
  private dataErrorThreshold = 3 // Errors within window to trigger degraded
  private aggressiveDetectTimeout: ReturnType<typeof setTimeout> | null = null
  private lastBrowserWakeCheckAt = 0
  private lastActivityAt = 0 // Timestamp of last activity for adaptive polling (#14192)
  private activityCooldownTimeout: ReturnType<typeof setTimeout> | null = null
  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      this.handleBrowserWake('visibilitychange')
    }
  }
  private readonly handleWindowFocus = () => {
    this.handleBrowserWake('focus')
  }
  private readonly handleWindowOnline = () => {
    this.handleBrowserWake('online')
  }

  private currentPollInterval = POLL_INTERVAL_IDLE

  start() {
    if (this.isStarted) return
    this.isStarted = true

    // On Netlify deployments, skip agent connection entirely (no local agent available)
    if (isDemoModeForced) {
      this.setState({
        status: 'disconnected',
        health: DEMO_DATA,
        error: 'Demo mode - agent connection skipped' })
      return
    }

    this.addBrowserWakeListeners()
    this.addEvent('connecting', 'Attempting to connect to local agent...')
    this.checkAgent()
    this.currentPollInterval = POLL_INTERVAL_IDLE
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
    if (this.activityCooldownTimeout) {
      clearTimeout(this.activityCooldownTimeout)
      this.activityCooldownTimeout = null
    }
    this.removeBrowserWakeListeners()
    this.lastBrowserWakeCheckAt = 0
    this.lastActivityAt = 0
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

  private addBrowserWakeListeners() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    window.addEventListener('focus', this.handleWindowFocus)
    window.addEventListener('online', this.handleWindowOnline)
  }

  private removeBrowserWakeListeners() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    window.removeEventListener('focus', this.handleWindowFocus)
    window.removeEventListener('online', this.handleWindowOnline)
  }

  private handleBrowserWake(source: 'visibilitychange' | 'focus' | 'online') {
    if (!this.isStarted || isDemoModeForced) return

    const now = Date.now()
    if (now - this.lastBrowserWakeCheckAt < BROWSER_WAKE_DEBOUNCE_MS) {
      return
    }
    this.lastBrowserWakeCheckAt = now

    if (this.state.status === 'connected' || this.state.status === 'degraded') {
      this.addEvent('connecting', `Refreshing local agent after browser ${source}`)
      this.checkAgent()
      triggerAllRefetches()
      return
    }

    this.aggressiveDetect()
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
      message }
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
      // Use plain fetch() instead of agentFetch() for the health check.
      // The /health endpoint does not require authentication (see server.go
      // comment: "Health endpoint doesn't require token auth"). Using plain
      // fetch avoids two problems that cause false "Offline" status (#10459):
      //
      // 1. agentFetch adds X-Requested-With header, which triggers a CORS
      //    preflight (OPTIONS) request. If the browser's origin is not in the
      //    kc-agent's allowed origins list (e.g. accessing via IP instead of
      //    localhost), the preflight fails and the health check always fails —
      //    even though the WebSocket (used by AI Missions) is unaffected by
      //    CORS restrictions.
      //
      // 2. agentFetch awaits getAgentToken(), which fetches /api/agent/token
      //    from the backend. If the user is not yet authenticated or the
      //    backend is slow, this delays the health check. The AbortSignal
      //    timeout starts when created (at call site), not when fetch starts,
      //    so the token delay can consume the timeout budget.
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(AGENT_HEALTH_TIMEOUT_MS) })

      if (!response.ok) {
        throw new Error(`Agent returned ${response.status}`)
      }

      const data = await response.json()
      const authResponse = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/providers/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })

      if (AUTH_ERROR_STATUS_CODES.has(authResponse.status)) {
        const isUnauthorized = authResponse.status === HTTP_UNAUTHORIZED_STATUS
        const authErrorMessage = isUnauthorized
          ? 'Local agent reachable, but authentication failed'
          : 'Local agent reachable, but access is forbidden'
        const wasAuthError = this.state.status === 'auth_error'

        this.failureCount = 0
        this.successCount = 0
        this.adjustPollIntervalForActivity()
        if (!wasAuthError) {
          this.addEvent('error', `${authErrorMessage} (HTTP ${authResponse.status})`)
        }
        this.setState({
          health: data,
          status: 'auth_error',
          error: `${authErrorMessage} (HTTP ${authResponse.status})`,
        })
        return
      }

      if (!authResponse.ok) {
        throw new Error(`Agent auth probe returned ${authResponse.status}`)
      }

      const wasDisconnected = this.state.status === 'disconnected'
      const wasConnecting = this.state.status === 'connecting' || this.state.status === 'auth_error'
      const wasConnected =
        this.state.status === 'connected' || this.state.status === 'degraded'
      const shouldTriggerReconnectRefetch = this.wasEverConnected && (wasDisconnected || wasConnecting)
      this.failureCount = 0 // Reset failure count on success
      this.successCount++ // Track consecutive successes

      // Hysteresis: require multiple successes to reconnect from disconnected (prevents flicker)
      if (wasDisconnected && this.successCount >= SUCCESS_THRESHOLD) {
        this.wasEverConnected = true
        this.addEvent('connected', `Connected to local agent v${data.version || 'unknown'}`)
        // Reconnected - speed up polling
        this.adjustPollIntervalForActivity()
        this.setState({
          health: data,
          status: 'connected',
          error: null })
        // Demo mode transition is handled by Layout based on agentStatus changes
        emitAgentConnected(data.version || 'unknown', data.clusters || 0)
        emitAgentProvidersDetected(data.availableProviders || [])
        if (shouldTriggerReconnectRefetch) {
          triggerAllRefetches()
        }
      } else if (wasConnecting) {
        // Initial connection - connect immediately on first success
        this.wasEverConnected = true
        this.addEvent('connected', `Connected to local agent v${data.version || 'unknown'}`)
        this.adjustPollIntervalForActivity()
        this.setState({
          health: data,
          status: 'connected',
          error: null })
        emitAgentConnected(data.version || 'unknown', data.clusters || 0)
        emitAgentProvidersDetected(data.availableProviders || [])
        // Stamp the first-ever agent connection for time-based nudges
        if (!safeGetItem(STORAGE_KEY_FIRST_AGENT_CONNECT)) {
          safeSetItem(STORAGE_KEY_FIRST_AGENT_CONNECT, String(Date.now()))
        }
        emitConversionStep(3, 'agent', { agent_version: data.version || 'unknown' })
        if ((data.clusters || 0) > 0) {
          emitConversionStep(4, 'clusters', { cluster_count: String(data.clusters) })
        }
        if (shouldTriggerReconnectRefetch) {
          triggerAllRefetches()
        }
      } else if (wasConnected) {
        // Already connected - just update health data
        this.setState({
          health: data,
          status: 'connected',
          error: null })
      }
      // If wasDisconnected but not enough successes yet, don't change status
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
          error: 'Local agent not available' })
        // Demo mode fallback is handled by Layout based on agentStatus changes
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

  /** Whether the agent was connected at least once this session (#10470). */
  getWasEverConnected(): boolean {
    return this.wasEverConnected
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
        lastDataError: `${endpoint}: ${error}` })
    } else if (this.state.status === 'degraded') {
      // Update error count while degraded
      this.setState({
        dataErrorCount: recentErrors,
        lastDataError: `${endpoint}: ${error}` })
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
          lastDataError: null })
      }
    }
  }

  // Adaptive heartbeat: adjust polling interval based on activity level (#14192)
  private adjustPollIntervalForActivity() {
    let targetInterval: number
    switch (this.state.activityLevel) {
      case 'burst':
        targetInterval = POLL_INTERVAL_BURST
        break
      case 'active':
        targetInterval = POLL_INTERVAL_ACTIVE
        break
      case 'idle':
      default:
        targetInterval = POLL_INTERVAL_IDLE
        break
    }
    this.adjustPollInterval(targetInterval)
  }

  // Signal that an active operation is occurring (AI mission, kubectl exec, etc.)
  // This increases heartbeat frequency for faster disconnect detection during active sessions (#14192)
  reportActivity(level: 'active' | 'burst' = 'active') {
    if (this.state.status !== 'connected' && this.state.status !== 'degraded') {
      return // No activity tracking when disconnected
    }

    const now = Date.now()

    // Update activity timestamp and level
    this.lastActivityAt = now
    if (this.state.activityLevel !== level) {
      this.setState({ activityLevel: level })
      this.adjustPollIntervalForActivity()
    }

    // Clear existing cooldown timer
    if (this.activityCooldownTimeout) {
      clearTimeout(this.activityCooldownTimeout)
      this.activityCooldownTimeout = null
    }

    // Schedule cooldown based on activity level
    const cooldownDuration = level === 'burst' ? BURST_COOLDOWN_MS : ACTIVITY_COOLDOWN_MS
    this.activityCooldownTimeout = setTimeout(() => {
      this.activityCooldownTimeout = null
      const timeSinceLastActivity = Date.now() - this.lastActivityAt

      if (level === 'burst' && timeSinceLastActivity >= BURST_COOLDOWN_MS) {
        // Downgrade from burst to active
        this.setState({ activityLevel: 'active' })
        this.adjustPollIntervalForActivity()
        // Schedule another cooldown to potentially go to idle
        this.activityCooldownTimeout = setTimeout(() => {
          this.activityCooldownTimeout = null
          const timeNow = Date.now() - this.lastActivityAt
          if (timeNow >= ACTIVITY_COOLDOWN_MS) {
            this.setState({ activityLevel: 'idle' })
            this.adjustPollIntervalForActivity()
          }
        }, ACTIVITY_COOLDOWN_MS - BURST_COOLDOWN_MS)
      } else if (timeSinceLastActivity >= ACTIVITY_COOLDOWN_MS) {
        // Return to idle after inactivity
        this.setState({ activityLevel: 'idle' })
        this.adjustPollIntervalForActivity()
      }
    }, cooldownDuration)
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
      error: null })

    this.adjustPollInterval(AGGRESSIVE_POLL_INTERVAL)
    this.checkAgent()

    this.aggressiveDetectTimeout = setTimeout(() => {
      this.aggressiveDetectTimeout = null
      if (this.state.status !== 'connected' && this.state.status !== 'degraded') {
        this.adjustPollInterval(DISCONNECTED_POLL_INTERVAL)
      } else {
        this.adjustPollIntervalForActivity()
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
