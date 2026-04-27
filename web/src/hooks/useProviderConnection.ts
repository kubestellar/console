import { useState, useRef, useEffect } from 'react'
import type { ProviderConnectionState } from '../types/agent'
import { INITIAL_PROVIDER_CONNECTION_STATE, PROVIDER_PREREQUISITES } from '../types/agent'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { agentFetch } from './mcp/shared'

/** Timeout for provider readiness check (10 seconds) */
const PROVIDER_CONNECT_TIMEOUT_MS = 10_000

/** Polling interval during handshake phase */
const HANDSHAKE_POLL_MS = 1_000

/** Maximum retry attempts before giving up */
const MAX_RETRIES = 3

interface ProviderCheckResult {
  ready: boolean
  error?: string
  /** Prerequisites the user needs (from backend handshake) */
  prerequisites?: string[]
  /** Provider version (from backend handshake) */
  version?: string
}

/**
 * Check if a provider is ready to accept connections.
 *
 * First tries the /provider/check endpoint which runs a full handshake
 * (e.g., `antigravity --version`) and returns structured prerequisites.
 * Falls back to the /health endpoint for providers without handshake support.
 */
async function checkProviderReady(providerName: string): Promise<ProviderCheckResult> {
  // Try the dedicated provider check endpoint first (supports handshake)
  try {
    const checkUrl = `${LOCAL_AGENT_HTTP_URL}/provider/check?name=${encodeURIComponent(providerName)}`
    const checkResponse = await agentFetch(checkUrl, {
      signal: AbortSignal.timeout(15_000) })
    if (checkResponse.ok) {
      const data = await checkResponse.json()
      if (data.ready) {
        return { ready: true, version: data.version }
      }
      // Return the structured error from the handshake
      return {
        ready: false,
        error: data.message || `Provider "${providerName}" is not ready`,
        prerequisites: data.prerequisites }
    }
  } catch {
    // /provider/check not available -- fall through to health check
  }

  // Fallback: check the health endpoint for simple provider presence
  try {
    const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/health`, {
      signal: AbortSignal.timeout(3_000) })
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

  const clearTimers = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  /**
   * Start a connection attempt for a provider.
   * Transitions through: starting -> handshake -> connected | failed
   */
  const startConnection = async (providerName: string, onSuccess: () => void) => {
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
      prerequisites: [] })

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
          error: reason }))
        return
      }

      const result = await checkProviderReady(providerName)
      if (abortRef.current) return

      if (result.ready) {
        setConnectionState(prev => ({
          ...prev,
          phase: 'connected',
          error: null,
          prerequisites: [] }))
        onSuccess()
        return
      }

      // Not ready yet -- if the backend returned prerequisites, show them
      // and stop polling (the user needs to take action first).
      if (result.prerequisites && result.prerequisites.length > 0) {
        setConnectionState(prev => ({
          ...prev,
          phase: 'failed',
          error: result.error ?? null,
          prerequisites: result.prerequisites ?? [] }))
        return
      }

      // No prerequisites -- continue polling
      setConnectionState(prev => ({
        ...prev,
        error: result.error ?? null }))
      pollTimerRef.current = setTimeout(poll, HANDSHAKE_POLL_MS)
    }

    await poll()
  }

  /**
   * Retry a failed connection with the same provider.
   */
  const retry = (onSuccess: () => void) => {
    if (!connectionState.provider) return
    if (connectionState.retryCount >= MAX_RETRIES) {
      setConnectionState(prev => ({
        ...prev,
        phase: 'failed',
        error: `Maximum retries (${MAX_RETRIES}) exceeded. Check that the provider is running and the local agent can reach it.` }))
      return
    }
    setConnectionState(prev => ({
      ...prev,
      retryCount: prev.retryCount + 1 }))
    startConnection(connectionState.provider, onSuccess)
  }

  /**
   * Reset connection state back to idle.
   */
  const reset = () => {
    abortRef.current = true
    clearTimers()
    setConnectionState(INITIAL_PROVIDER_CONNECTION_STATE)
  }

  /**
   * Dismiss a failure without resetting provider selection.
   * Moves to idle but preserves the provider reference.
   */
  const dismiss = () => {
    clearTimers()
    setConnectionState(prev => ({
      ...prev,
      phase: 'idle',
      error: null }))
  }

  return {
    connectionState,
    startConnection,
    retry,
    reset,
    dismiss }
}
