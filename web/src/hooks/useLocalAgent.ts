import { useState, useEffect, useCallback } from 'react'

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

export type AgentConnectionStatus = 'connected' | 'disconnected' | 'connecting'

const LOCAL_AGENT_URL = 'http://127.0.0.1:8585'
const POLL_INTERVAL = 10000 // Check every 10 seconds
const FAILURE_THRESHOLD = 3 // Require 3 consecutive failures before disconnecting

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
}

type Listener = (state: AgentState) => void

class AgentManager {
  private state: AgentState = {
    status: 'connecting',
    health: null,
    error: null,
  }
  private listeners: Set<Listener> = new Set()
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private failureCount = 0
  private isChecking = false
  private isStarted = false

  start() {
    if (this.isStarted) return
    this.isStarted = true
    console.log('[AgentManager] Starting singleton polling')
    this.checkAgent()
    this.pollInterval = setInterval(() => this.checkAgent(), POLL_INTERVAL)
  }

  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    this.isStarted = false
    this.isChecking = false // Reset so next start can check immediately
    console.log('[AgentManager] Stopped polling')
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

  private setState(updates: Partial<AgentState>) {
    this.state = { ...this.state, ...updates }
    this.notify()
  }

  async checkAgent() {
    // Skip if already checking (prevent overlapping requests)
    if (this.isChecking) {
      console.log('[AgentManager] Skipping check - already in progress')
      return
    }
    this.isChecking = true

    try {
      const response = await fetch(`${LOCAL_AGENT_URL}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })

      if (response.ok) {
        const data = await response.json()
        this.failureCount = 0 // Reset failure count on success
        this.setState({
          health: data,
          status: 'connected',
          error: null,
        })
        console.log('[AgentManager] Connected successfully')
      } else {
        throw new Error(`Agent returned ${response.status}`)
      }
    } catch (err) {
      this.failureCount++
      console.log(
        `[AgentManager] Check failed (attempt ${this.failureCount}/${FAILURE_THRESHOLD})`,
        err
      )
      // Only mark as disconnected after multiple consecutive failures
      if (this.failureCount >= FAILURE_THRESHOLD) {
        if (this.state.status !== 'disconnected') {
          console.log(
            `[AgentManager] Transitioning to disconnected after ${this.failureCount} failures`
          )
        }
        this.setState({
          status: 'disconnected',
          health: DEMO_DATA,
          error: 'Local agent not available',
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

// Global singleton instance
const agentManager = new AgentManager()

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
      'To connect to your local kubeconfig and Claude Code, install the kkc-agent on your machine.',
    steps: [
      {
        title: 'Install via Homebrew (macOS)',
        command: 'brew install kubestellar/tap/kkc-agent',
      },
      {
        title: 'Or download binary',
        command: 'curl -sSL https://kubestellar.io/kkc-agent/install.sh | bash',
      },
      {
        title: 'Start the agent',
        command: 'kkc-agent',
      },
    ],
    benefits: [
      'Access all your kubeconfig clusters',
      'Real-time token usage tracking',
      'Secure local-only connection (127.0.0.1)',
    ],
  }

  return {
    status: state.status,
    health: state.health,
    error: state.error,
    isConnected: state.status === 'connected',
    isDemoMode: state.status === 'disconnected',
    installInstructions,
    refresh,
  }
}
