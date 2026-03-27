import { useState, useCallback, useRef, useEffect } from 'react'
import type { ProviderConnectionState } from '../types/agent'
import { INITIAL_PROVIDER_CONNECTION_STATE, PROVIDER_PREREQUISITES } from '../types/agent'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'

/** Timeout for provider readiness check (10 seconds) */
const PROVIDER_CONNECT_TIMEOUT_MS = 10_000

/** Polling interval during handshake phase */
const HANDSHAKE_POLL_MS = 1_000

/** Maximum retry attempts before giving up */
const MAX_RETRIES = 3

/**
 * Check if a provider is ready to accept connections by querying
 * the agent health endpoint and verifying the provider appears
 * in availableProviders.
 */
async function checkProviderReady(providerName: string): Promise<{ ready: boolean; error?: string }> {
  try {
    const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/health`, {
      signal: AbortSignal.timeout(3_000),
    })
    if (!response.ok) {
      return { ready: false, error: `Agent returned HTTP ${response.status}` }
    }
    const data = await response.json()
    const providers: Array<{ name: string }> = data.availableProviders || []
    const found = providers.some(p => p.name === providerName)
    if (!found) {
      return { ready: false, error: `Provider "${providerName}" not found in available providers` }
    }
    return { ready: true }
  } catch {
    return { ready: false, error: 'Unable to reach local agent' }
  }
}

/**
 * Hook that manages the connection lifecycle for a specific provider.
 * Tracks states: idle -> starting -> handshake -> connected | failed
 *
 * Used by AgentSelector to show clear progress and error states when
 * selecting a provider, especially VS Code which requires a desktop
 * extension/bridge.
 */
export function useProviderConnection() {
  const [connectionState, setConnectionState] = useState<ProviderConnectionState>(
    INITIAL_PROVIDER_CONNECTION_STATE
  )
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef(false)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const clearTimers = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  /**
   * Start a connection attempt for a provider.
   * Transitions through: starting -> handshake -> connected | failed
   */
  const startConnection = useCallback(async (providerName: string, onSuccess: () => void) => {
    abortRef.current = false
    clearTimers()

    const prerequisite = PROVIDER_PREREQUISITES[providerName]

    // Phase 1: starting
    setConnectionState({
      phase: 'starting',
      provider: providerName,
      startedAt: Date.now(),
      error: null,
      retryCount: 0,
      prerequisite: prerequisite?.description ?? null,
    })

    // Phase 2: handshake -- poll for provider readiness
    setConnectionState(prev => ({ ...prev, phase: 'handshake' }))

    // Set a global timeout for the entire handshake
    const startTime = Date.now()

    const poll = async () => {
      if (abortRef.current) return

      const elapsed = Date.now() - startTime
      if (elapsed >= PROVIDER_CONNECT_TIMEOUT_MS) {
        // Timed out
        const reason = prerequisite
          ? `Connection timed out. ${prerequisite.description}`
          : `Connection timed out after ${PROVIDER_CONNECT_TIMEOUT_MS / 1000}s. The provider may not be running or the local agent cannot reach it.`

        setConnectionState(prev => ({
          ...prev,
          phase: 'failed',
          error: reason,
        }))
        return
      }

      const { ready, error } = await checkProviderReady(providerName)
      if (abortRef.current) return

      if (ready) {
        setConnectionState(prev => ({
          ...prev,
          phase: 'connected',
          error: null,
        }))
        onSuccess()
        return
      }

      // Not ready yet, continue polling
      setConnectionState(prev => ({
        ...prev,
        error: error ?? null,
      }))
      pollTimerRef.current = setTimeout(poll, HANDSHAKE_POLL_MS)
    }

    await poll()
  }, [clearTimers])

  /**
   * Retry a failed connection with the same provider.
   */
  const retry = useCallback((onSuccess: () => void) => {
    if (!connectionState.provider) return
    if (connectionState.retryCount >= MAX_RETRIES) {
      setConnectionState(prev => ({
        ...prev,
        phase: 'failed',
        error: `Maximum retries (${MAX_RETRIES}) exceeded. Check that the provider is running and the local agent can reach it.`,
      }))
      return
    }
    setConnectionState(prev => ({
      ...prev,
      retryCount: prev.retryCount + 1,
    }))
    startConnection(connectionState.provider, onSuccess)
  }, [connectionState.provider, connectionState.retryCount, startConnection])

  /**
   * Reset connection state back to idle.
   */
  const reset = useCallback(() => {
    abortRef.current = true
    clearTimers()
    setConnectionState(INITIAL_PROVIDER_CONNECTION_STATE)
  }, [clearTimers])

  /**
   * Dismiss a failure without resetting provider selection.
   * Moves to idle but preserves the provider reference.
   */
  const dismiss = useCallback(() => {
    clearTimers()
    setConnectionState(prev => ({
      ...prev,
      phase: 'idle',
      error: null,
    }))
  }, [clearTimers])

  return {
    connectionState,
    startConnection,
    retry,
    reset,
    dismiss,
  }
}
