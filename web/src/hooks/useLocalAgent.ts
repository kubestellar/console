import { useState, useEffect, useCallback, useRef } from 'react'

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
const POLL_INTERVAL = 10000 // Check every 10 seconds (reduced frequency for stability)
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

export function useLocalAgent() {
  const [status, setStatus] = useState<AgentConnectionStatus>('connecting')
  const [health, setHealth] = useState<AgentHealth | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const failureCountRef = useRef(0)
  const isCheckingRef = useRef(false)

  const checkAgent = useCallback(async () => {
    // Skip if already checking (prevent overlapping requests)
    if (isCheckingRef.current) {
      console.log('[useLocalAgent] Skipping check - already in progress')
      return
    }
    isCheckingRef.current = true

    try {
      const response = await fetch(`${LOCAL_AGENT_URL}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        // No AbortController - let the request complete naturally
      })

      if (response.ok) {
        const data = await response.json()
        setHealth(data)
        setStatus('connected')
        setError(null)
        failureCountRef.current = 0 // Reset failure count on success
        console.log('[useLocalAgent] Connected successfully')
      } else {
        throw new Error(`Agent returned ${response.status}`)
      }
    } catch (err) {
      failureCountRef.current++
      console.log(`[useLocalAgent] Check failed (attempt ${failureCountRef.current}/${FAILURE_THRESHOLD})`, err)
      // Only mark as disconnected after multiple consecutive failures
      if (failureCountRef.current >= FAILURE_THRESHOLD) {
        setStatus((prev) => {
          if (prev !== 'disconnected') {
            console.log(`[useLocalAgent] Transitioning to disconnected after ${failureCountRef.current} failures`)
          }
          return 'disconnected'
        })
        setHealth(DEMO_DATA)
        setError('Local agent not available')
      }
    } finally {
      isCheckingRef.current = false
    }
  }, [])

  // Start polling on mount
  useEffect(() => {
    checkAgent()
    pollIntervalRef.current = setInterval(checkAgent, POLL_INTERVAL)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [checkAgent])

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
    status,
    health,
    error,
    isConnected: status === 'connected',
    isDemoMode: status === 'disconnected',
    installInstructions,
    refresh: checkAgent,
  }
}
