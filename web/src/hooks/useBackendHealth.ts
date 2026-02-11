import { useState, useEffect } from 'react'

export type BackendStatus = 'connected' | 'disconnected' | 'connecting'

const POLL_INTERVAL = 15000 // Check every 15 seconds
const FAILURE_THRESHOLD = 2 // Require 2 consecutive failures

interface BackendState {
  status: BackendStatus
  lastCheck: Date | null
  versionChanged: boolean
}

class BackendHealthManager {
  private state: BackendState = {
    status: 'connecting',
    lastCheck: null,
    versionChanged: false,
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
    this.state = { ...this.state, ...updates }
    if (prevStatus !== this.state.status || prevVersionChanged !== this.state.versionChanged) {
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
      })

      if (response.ok) {
        this.failureCount = 0

        // Parse response to check version and status
        try {
          const data = await response.json()
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
      this.failureCount++
      if (this.failureCount >= FAILURE_THRESHOLD) {
        this.setState({
          status: 'disconnected',
          lastCheck: new Date(),
        })
      }
    } finally {
      this.isChecking = false
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
  }
}

export function isBackendConnected(): boolean {
  return backendHealthManager.getState().status === 'connected'
}
