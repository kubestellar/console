import { useState, useEffect } from 'react'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { agentFetch } from './mcp/shared'

export type BackendStatus = 'connected' | 'disconnected' | 'connecting'

const POLL_INTERVAL = 15000 // Check every 15 seconds
const FAILURE_THRESHOLD = 4 // Require 4 consecutive failures before showing "Connection lost"
// Short timeout for health checks — a healthy backend responds in <100ms.
// Using the default 10s timeout causes false failures when the browser's
// HTTP/1.1 connection pool (6 per origin) is saturated by SSE streams.
const HEALTH_CHECK_TIMEOUT_MS = 3000

interface BackendState {
  status: BackendStatus
  lastCheck: Date | null
  versionChanged: boolean
  inCluster: boolean
}

class BackendHealthManager {
  private state: BackendState = {
    status: 'connecting',
    lastCheck: null,
    versionChanged: false,
    inCluster: false,
  }
  private listeners: Set<(state: BackendState) => void> = new Set()
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private failureCount = 0
  private isStarted = false
  private isChecking = false
  private initialVersion: string | null = null

  start() {
    if (this.isStarted) return
    this.isStarted = true
    this.checkBackend()
    this.pollInterval = setInterval(() => this.checkBackend(), POLL_INTERVAL)
  }

  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    this.isStarted = false
  }

  subscribe(listener: (state: BackendState) => void): () => void {
    this.listeners.add(listener)
    if (this.listeners.size === 1) {
      this.start()
    }
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) {
        this.stop()
      }
    }
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.state))
  }

  private setState(updates: Partial<BackendState>) {
    const prevStatus = this.state.status
    const prevVersionChanged = this.state.versionChanged
    const prevInCluster = this.state.inCluster
    this.state = { ...this.state, ...updates }
    if (prevStatus !== this.state.status || prevVersionChanged !== this.state.versionChanged || prevInCluster !== this.state.inCluster) {
      this.notify()
    }
  }

  async checkBackend() {
    if (this.isChecking) return
    this.isChecking = true

    try {
      // Use /health (not /api/health) - the root health endpoint doesn't require auth
      const response = await fetch('/health', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
      })

      if (response.ok) {
        this.failureCount = 0

        // Parse response to check version and status
        try {
          // Use .catch() on .json() to prevent Firefox from firing unhandledrejection
          // before the outer try/catch processes the rejection (microtask timing issue).
          const data = await response.json().catch(() => null)
          if (!data) throw new Error('Invalid JSON')
          const version = data.version as string | undefined

          // Track initial version for stale-frontend detection
          if (version && this.initialVersion === null) {
            this.initialVersion = version
          }

          // Detect version change (backend was updated)
          const versionChanged = !!(
            version &&
            this.initialVersion &&
            version !== this.initialVersion
          )

          this.setState({
            status: 'connected',
            lastCheck: new Date(),
            versionChanged,
            inCluster: data.in_cluster === true,
          })
        } catch {
          // JSON parse failed — still mark as connected
          this.setState({
            status: 'connected',
            lastCheck: new Date(),
          })
        }
      } else {
        throw new Error(`Backend returned ${response.status}`)
      }
    } catch {
      // Before counting a failure, try the kc-agent health endpoint on a
      // different origin (port 8585). The main /health fetch can time out
      // when the browser's HTTP/1.1 connection pool (6 per origin) is
      // saturated by long-running kubectl proxy requests on port 8080.
      // The agent endpoint uses a separate connection pool.
      const agentAlive = await this.checkAgentHealth()
      if (agentAlive) {
        // Agent is reachable → backend is likely fine, just connection-starved.
        // Don't increment failure count.
        this.setState({ status: 'connected', lastCheck: new Date() })
      } else {
        this.failureCount++
        if (this.failureCount >= FAILURE_THRESHOLD) {
          this.setState({
            status: 'disconnected',
            lastCheck: new Date(),
          })
        }
      }
    } finally {
      this.isChecking = false
    }
  }

  /** Probe kc-agent on a separate origin to disambiguate real backend
   *  downtime from browser connection-pool exhaustion on the main origin. */
  private async checkAgentHealth(): Promise<boolean> {
    try {
      const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
      })
      return res.ok
    } catch {
      return false
    }
  }

  getState() {
    return this.state
  }
}

const backendHealthManager = new BackendHealthManager()

export function useBackendHealth() {
  const [state, setState] = useState<BackendState>(backendHealthManager.getState())

  useEffect(() => {
    const unsubscribe = backendHealthManager.subscribe(setState)
    return unsubscribe
  }, [])

  return {
    status: state.status,
    isConnected: state.status === 'connected',
    lastCheck: state.lastCheck,
    versionChanged: state.versionChanged,
    inCluster: state.inCluster,
    isInClusterMode: state.status === 'connected' && state.inCluster,
  }
}

export function isBackendConnected(): boolean {
  return backendHealthManager.getState().status === 'connected'
}

/** Returns true only when backend is connected AND running in-cluster (not localhost) */
export function isInClusterMode(): boolean {
  const state = backendHealthManager.getState()
  return state.status === 'connected' && state.inCluster
}
