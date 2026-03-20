/**
 * Pod Exec Terminal Session Hook
 *
 * Manages a WebSocket connection to the backend /ws/exec endpoint
 * for interactive terminal sessions inside pods.
 *
 * Protocol:
 * 1. Client opens WebSocket to /ws/exec
 * 2. Client sends auth message with JWT token (first message)
 * 3. Client sends exec_init message with cluster, namespace, pod, container, command
 * 4. Server replies with exec_started
 * 5. Client sends stdin/resize messages, server sends stdout/stderr/exit messages
 *
 * Features:
 * - Exponential backoff reconnection on unexpected disconnects (#3029)
 * - Meaningful error messages when endpoint is unavailable (#3026)
 * - Connection status callbacks for UI indicators (#3027)
 */

import { useRef, useCallback, useEffect, useState } from 'react'
import { STORAGE_KEY_TOKEN } from '../lib/constants'

// ============================================================================
// Constants
// ============================================================================

/** Base delay for reconnection attempts (doubles each retry) */
const RECONNECT_BASE_DELAY_MS = 2_000

/** Maximum delay between reconnection attempts */
const RECONNECT_MAX_DELAY_MS = 16_000

/** Max reconnect attempts before giving up */
const MAX_RECONNECT_ATTEMPTS = 5

/** Default terminal columns when not specified */
const DEFAULT_TERMINAL_COLS = 80

/** Default terminal rows when not specified */
const DEFAULT_TERMINAL_ROWS = 24

/** Small random jitter added to backoff to avoid thundering herd */
const BACKOFF_JITTER_MAX_MS = 500

/** Interval for updating the reconnect countdown display (1 second) */
const COUNTDOWN_INTERVAL_MS = 1_000

/** WebSocket close code for normal closure */
const WS_CLOSE_NORMAL = 1000

// ============================================================================
// Types
// ============================================================================

export interface ExecSessionConfig {
  cluster: string
  namespace: string
  pod: string
  container: string
  command?: string[]
  tty?: boolean
  cols?: number
  rows?: number
}

export type SessionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting'

interface ExecMessage {
  type: string
  data?: string
  sessionId?: string
  cols?: number
  rows?: number
  exitCode?: number
}

export interface UseExecSessionResult {
  status: SessionStatus
  error: string | null
  /** Current reconnect attempt number (0 when not reconnecting) */
  reconnectAttempt: number
  /** Seconds until next reconnect attempt (0 when not reconnecting) */
  reconnectCountdown: number
  connect: (config: ExecSessionConfig) => void
  disconnect: () => void
  sendInput: (data: string) => void
  resize: (cols: number, rows: number) => void
  onData: (callback: (data: string) => void) => void
  onExit: (callback: (code: number) => void) => void
  /** Register a callback for connection status changes */
  onStatusChange: (callback: (status: SessionStatus, error?: string) => void) => void
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Calculate exponential backoff delay with jitter.
 * Delay = min(base * 2^attempt, max) + random jitter
 */
function getBackoffDelay(attempt: number): number {
  const delay = Math.min(
    RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt),
    RECONNECT_MAX_DELAY_MS,
  )
  const jitter = Math.random() * BACKOFF_JITTER_MAX_MS
  return delay + jitter
}

/** Close and null-out a WebSocket, removing all handlers */
function closeWebSocket(ws: WebSocket | null): void {
  if (!ws) return
  ws.onopen = null
  ws.onmessage = null
  ws.onerror = null
  ws.onclose = null
  ws.close()
}

// ============================================================================
// Hook
// ============================================================================

export function useExecSession(): UseExecSessionResult {
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<SessionStatus>('disconnected')
  const [error, setError] = useState<string | null>(null)
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const [reconnectCountdown, setReconnectCountdown] = useState(0)
  const dataCallbackRef = useRef<((data: string) => void) | null>(null)
  const exitCallbackRef = useRef<((code: number) => void) | null>(null)
  const statusCallbackRef = useRef<((status: SessionStatus, error?: string) => void) | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  /** Track whether the session was ever successfully connected (for reconnect logic) */
  const wasConnectedRef = useRef(false)
  /** Track whether disconnect was intentional (user-initiated) */
  const intentionalDisconnectRef = useRef(false)
  /** Ref to the connect function so scheduleReconnect can call it without circular deps */
  const connectInternalRef = useRef<(config: ExecSessionConfig, isReconnect: boolean) => void>(() => {})

  const clearReconnectTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    setReconnectCountdown(0)
  }, [])

  const updateStatus = useCallback((newStatus: SessionStatus, newError?: string) => {
    setStatus(newStatus)
    if (newError !== undefined) {
      setError(newError)
    }
    if (statusCallbackRef.current) {
      statusCallbackRef.current(newStatus, newError ?? undefined)
    }
  }, [])

  const cleanup = useCallback(() => {
    clearReconnectTimers()
    closeWebSocket(wsRef.current)
    wsRef.current = null
  }, [clearReconnectTimers])

  const scheduleReconnect = useCallback((config: ExecSessionConfig) => {
    const attempt = reconnectAttemptsRef.current
    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      updateStatus(
        'error',
        `Connection lost after ${MAX_RECONNECT_ATTEMPTS} reconnection attempts. Please try connecting manually.`,
      )
      setReconnectAttempt(0)
      return
    }

    const delay = getBackoffDelay(attempt)
    const delaySec = Math.ceil(delay / 1000)

    setReconnectAttempt(attempt + 1)
    setReconnectCountdown(delaySec)
    updateStatus('reconnecting')

    // Countdown timer updates every second for UI feedback
    let remaining = delaySec
    countdownTimerRef.current = setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current)
          countdownTimerRef.current = null
        }
        setReconnectCountdown(0)
      } else {
        setReconnectCountdown(remaining)
      }
    }, COUNTDOWN_INTERVAL_MS)

    reconnectTimerRef.current = setTimeout(() => {
      reconnectAttemptsRef.current = attempt + 1
      connectInternalRef.current(config, true)
    }, delay)
  }, [updateStatus])

  const connectInternal = useCallback((config: ExecSessionConfig, isReconnect = false) => {
    // Clean up existing WebSocket connection
    closeWebSocket(wsRef.current)
    wsRef.current = null

    if (!isReconnect) {
      clearReconnectTimers()
      reconnectAttemptsRef.current = 0
      setReconnectAttempt(0)
      wasConnectedRef.current = false
      intentionalDisconnectRef.current = false
    }

    updateStatus('connecting')
    setError(null)

    // Build WebSocket URL -- token is sent as first message, NOT in the URL
    // (keeps JWT out of server logs, browser history, and proxy logs)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/exec`

    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create WebSocket connection'
      updateStatus(
        'error',
        `Could not connect to cluster exec endpoint. ${message}. Please verify the backend is running and /ws/exec is reachable.`,
      )
      return
    }
    wsRef.current = ws

    ws.onopen = () => {
      // Step 1: Send auth message with JWT token
      const token = localStorage.getItem(STORAGE_KEY_TOKEN)
      if (!token) {
        updateStatus('error', 'Not authenticated. Please log in again.')
        ws.close()
        return
      }
      ws.send(JSON.stringify({ type: 'auth', token }))

      // Step 2: Send the exec_init message
      const initMsg: ExecMessage & { cluster: string; namespace: string; pod: string; container: string; command: string[]; tty: boolean } = {
        type: 'exec_init',
        cluster: config.cluster,
        namespace: config.namespace,
        pod: config.pod,
        container: config.container,
        command: config.command || ['/bin/sh'],
        tty: config.tty !== false,
        cols: config.cols || DEFAULT_TERMINAL_COLS,
        rows: config.rows || DEFAULT_TERMINAL_ROWS,
      }
      ws.send(JSON.stringify(initMsg))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ExecMessage
        switch (msg.type) {
          case 'exec_started':
            wasConnectedRef.current = true
            reconnectAttemptsRef.current = 0
            setReconnectAttempt(0)
            updateStatus('connected')
            break
          case 'stdout':
          case 'stderr':
            if (msg.data && dataCallbackRef.current) {
              dataCallbackRef.current(msg.data)
            }
            break
          case 'exit':
            if (exitCallbackRef.current) {
              exitCallbackRef.current(msg.exitCode || 0)
            }
            wasConnectedRef.current = false
            intentionalDisconnectRef.current = true
            updateStatus('disconnected')
            break
          case 'error':
            updateStatus('error', msg.data || 'Unknown server error')
            break
        }
      } catch {
        // Ignore JSON parse errors for non-JSON messages
      }
    }

    ws.onerror = () => {
      // Only set error if we haven't already handled it via onclose
      if (!wasConnectedRef.current) {
        updateStatus(
          'error',
          'Could not connect to cluster exec endpoint. Please verify the backend is running and /ws/exec is reachable.',
        )
      }
    }

    ws.onclose = (event) => {
      wsRef.current = null

      // Don't reconnect if the disconnect was intentional
      if (intentionalDisconnectRef.current) {
        return
      }

      // If we were connected and the close was unexpected, attempt reconnection
      if (wasConnectedRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        // Notify the data callback so the terminal can display the reconnect message
        if (dataCallbackRef.current) {
          const nextAttempt = reconnectAttemptsRef.current + 1
          const delaySec = Math.ceil(getBackoffDelay(reconnectAttemptsRef.current) / 1000)
          dataCallbackRef.current(
            `\r\n\x1b[33m[Connection lost. Reconnecting in ${delaySec}s... (attempt ${nextAttempt}/${MAX_RECONNECT_ATTEMPTS})]\x1b[0m\r\n`,
          )
        }
        scheduleReconnect(config)
        return
      }

      // If we never connected, this is an endpoint availability issue
      if (!wasConnectedRef.current) {
        const reason = event.code !== WS_CLOSE_NORMAL
          ? ` (code: ${event.code})`
          : ''
        updateStatus(
          'error',
          `Could not connect to cluster exec endpoint${reason}. Please verify the backend is running and /ws/exec is reachable.`,
        )
        return
      }

      // Max reconnects exhausted
      updateStatus(
        'error',
        `Connection lost after ${MAX_RECONNECT_ATTEMPTS} reconnection attempts. Please try connecting manually.`,
      )
      setReconnectAttempt(0)
    }
  }, [updateStatus, scheduleReconnect, clearReconnectTimers])

  // Keep the ref in sync so scheduleReconnect always calls the latest version
  useEffect(() => {
    connectInternalRef.current = connectInternal
  }, [connectInternal])

  const connect = useCallback((config: ExecSessionConfig) => {
    intentionalDisconnectRef.current = false
    connectInternal(config, false)
  }, [connectInternal])

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true
    reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS // Prevent reconnect
    clearReconnectTimers()
    setReconnectAttempt(0)
    cleanup()
    updateStatus('disconnected')
  }, [cleanup, clearReconnectTimers, updateStatus])

  const sendInput = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stdin', data }))
    }
  }, [])

  const resize = useCallback((cols: number, rows: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }))
    }
  }, [])

  const onData = useCallback((callback: (data: string) => void) => {
    dataCallbackRef.current = callback
  }, [])

  const onExit = useCallback((callback: (code: number) => void) => {
    exitCallbackRef.current = callback
  }, [])

  const onStatusChange = useCallback((callback: (status: SessionStatus, error?: string) => void) => {
    statusCallbackRef.current = callback
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      intentionalDisconnectRef.current = true
      cleanup()
    }
  }, [cleanup])

  return {
    status,
    error,
    reconnectAttempt,
    reconnectCountdown,
    connect,
    disconnect,
    sendInput,
    resize,
    onData,
    onExit,
    onStatusChange,
  }
}
