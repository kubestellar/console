import { HTTP_UNAUTHORIZED, HTTP_FORBIDDEN } from '../lib/constants/http'

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

export interface AgentState {
  status: AgentConnectionStatus
  health: AgentHealth | null
  error: string | null
  connectionEvents: ConnectionEvent[]
  dataErrorCount: number
  lastDataError: string | null
  activityLevel: 'idle' | 'active' | 'burst' // Adaptive heartbeat activity level (#14192)
}

export type Listener = (state: AgentState) => void

// Adaptive heartbeat intervals — scale based on cluster activity
export const POLL_INTERVAL_IDLE = 5_000 // Check every 5 seconds when idle
export const POLL_INTERVAL_ACTIVE = 2_000 // Check every 2 seconds during active sessions (AI missions, kubectl ops)
export const POLL_INTERVAL_BURST = 1_000 // Check every 1 second during high-activity bursts
export const DISCONNECTED_POLL_INTERVAL = 60_000 // Check every 60 seconds when disconnected
export const FAILURE_THRESHOLD = 2 // Require 2 consecutive failures before disconnecting (prevents flicker)
// Short timeout for agent health checks — a healthy agent responds in <100ms.
// Using the default 10s timeout causes false failures when the browser's
// HTTP/1.1 connection pool (6 per origin) is saturated by concurrent requests.
export const AGENT_HEALTH_TIMEOUT_MS = 1_500 // Reduced for faster disconnect detection (#14192)
export const AUTH_ERROR_STATUS_CODES = new Set([
  HTTP_UNAUTHORIZED,
  HTTP_FORBIDDEN,
])
export const SUCCESS_THRESHOLD = 2 // Require 2 consecutive successes before reconnecting (prevents flicker)
export const AGGRESSIVE_POLL_INTERVAL = 1_000 // 1 second during aggressive detection burst
export const AGGRESSIVE_DETECT_DURATION = 10_000 // 10 seconds of aggressive polling
export const BROWSER_WAKE_DEBOUNCE_MS = 1_000
export const ACTIVITY_COOLDOWN_MS = 30_000 // Return to idle polling after 30 seconds of inactivity
export const BURST_COOLDOWN_MS = 10_000 // Return to active polling after 10 seconds of burst inactivity

// Demo data for when agent is not connected
export const DEMO_DATA: AgentHealth = {
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
