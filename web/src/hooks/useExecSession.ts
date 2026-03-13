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
 */

import { useRef, useCallback, useEffect, useState } from 'react'
import { STORAGE_KEY_TOKEN } from '../lib/constants'

// ============================================================================
// Constants
// ============================================================================

/** Reconnect delay after unexpected disconnect */
const RECONNECT_DELAY_MS = 2_000

/** Max reconnect attempts before giving up */
const MAX_RECONNECT_ATTEMPTS = 3

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

export type SessionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

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
  connect: (config: ExecSessionConfig) => void
  disconnect: () => void
  sendInput: (data: string) => void
  resize: (cols: number, rows: number) => void
  onData: (callback: (data: string) => void) => void
  onExit: (callback: (code: number) => void) => void
}

// ============================================================================
// Hook
// ============================================================================

export function useExecSession(): UseExecSessionResult {
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<SessionStatus>('disconnected')
  const [error, setError] = useState<string | null>(null)
  const dataCallbackRef = useRef<((data: string) => void) | null>(null)
  const exitCallbackRef = useRef<((code: number) => void) | null>(null)
  const reconnectAttemptsRef = useRef(0)

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  const connect = useCallback((config: ExecSessionConfig) => {
    cleanup()
    setStatus('connecting')
    setError(null)
    reconnectAttemptsRef.current = 0

    // Build WebSocket URL — token is sent as first message, NOT in the URL
    // (keeps JWT out of server logs, browser history, and proxy logs)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/exec`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      // Step 1: Send auth message with JWT token
      const token = localStorage.getItem(STORAGE_KEY_TOKEN)
      if (!token) {
        setError('Not authenticated')
        setStatus('error')
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
        cols: config.cols || 80,
        rows: config.rows || 24,
      }
      ws.send(JSON.stringify(initMsg))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ExecMessage
        switch (msg.type) {
          case 'exec_started':
            setStatus('connected')
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
            setStatus('disconnected')
            break
          case 'error':
            setError(msg.data || 'Unknown error')
            setStatus('error')
            break
        }
      } catch {
        // Ignore parse errors
      }
    }

    ws.onerror = () => {
      setError('WebSocket connection failed')
      setStatus('error')
    }

    ws.onclose = () => {
      if (status === 'connected' && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++
        setTimeout(() => connect(config), RECONNECT_DELAY_MS)
      } else {
        setStatus('disconnected')
      }
    }
  }, [cleanup, status])

  const disconnect = useCallback(() => {
    reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS // Prevent reconnect
    cleanup()
    setStatus('disconnected')
  }, [cleanup])

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  return {
    status,
    error,
    connect,
    disconnect,
    sendInput,
    resize,
    onData,
    onExit,
  }
}
