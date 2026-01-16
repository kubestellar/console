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
const POLL_INTERVAL = 5000 // Check every 5 seconds
const CONNECTION_TIMEOUT = 10000 // 10 second timeout (allow for slow connections)

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

  const checkAgent = useCallback(async () => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT)

      const response = await fetch(`${LOCAL_AGENT_URL}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        setHealth(data)
        setStatus('connected')
        setError(null)
      } else {
        throw new Error(`Agent returned ${response.status}`)
      }
    } catch (err) {
      setStatus('disconnected')
      setHealth(DEMO_DATA)
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Connection timeout - agent not responding')
      } else {
        setError('Local agent not available')
      }
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
