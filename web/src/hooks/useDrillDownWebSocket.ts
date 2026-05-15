import { useRef, useEffect, useCallback } from 'react'
import { LOCAL_AGENT_WS_URL } from '../lib/constants'
import { appendWsAuthToken } from '../lib/utils/wsAuth'

const DEFAULT_TIMEOUT_MS = 10000

interface KubectlMessage {
  id?: string
  type?: string
  payload?: {
    output?: string
    content?: string
    error?: string
    message?: string
    exitCode?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Hook for managing WebSocket connections to the local agent in drilldown views.
 * Provides tracked sockets, safe message parsing, and kubectl/helm helpers with automatic cleanup.
 *
 * Features:
 * - Tracks all active WebSocket connections
 * - Auto-closes connections on component unmount
 * - Safe JSON parsing with try-catch
 * - Configurable timeout per request
 */
export function useDrillDownWebSocket(cluster: string) {
  const activeWsRef = useRef(new Set<WebSocket>())

  /**
   * Create a tracked WebSocket — automatically removed from the set when closed.
   */
  const openTrackedWs = useCallback(async (): Promise<WebSocket> => {
    const ws = new WebSocket(await appendWsAuthToken(LOCAL_AGENT_WS_URL))
    activeWsRef.current.add(ws)
    const origClose = ws.close.bind(ws)
    ws.close = (...args: Parameters<WebSocket['close']>) => {
      activeWsRef.current.delete(ws)
      origClose(...args)
    }
    return ws
  }, [])

  /**
   * Safely parse WebSocket message data with error handling.
   */
  const parseWsMessage = useCallback((event: MessageEvent): KubectlMessage | null => {
    try {
      return JSON.parse(event.data) as KubectlMessage
    } catch (err) {
      console.error('[useDrillDownWebSocket] Failed to parse WebSocket message:', err)
      return null
    }
  }, [])

  /**
   * Generic command runner via WebSocket.
   * @param commandType - command type ('kubectl' or 'helm')
   * @param args - command arguments
   * @param timeoutMs - timeout in milliseconds
   * @returns command output or empty string on error/timeout
   */
  const runCommand = useCallback(async (
    commandType: 'kubectl' | 'helm',
    args: string[],
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<string> => {
    let ws: WebSocket
    try {
      ws = await openTrackedWs()
    } catch (err) {
      console.error('[useDrillDownWebSocket] Failed to open WebSocket:', err)
      return ''
    }

    return new Promise((resolve) => {
      const requestId = `${commandType}-${Date.now()}-${Math.random().toString(36).slice(2)}`
      let output = ''

      const timeout = setTimeout(() => {
        ws.close()
        resolve(output || '')
      }, timeoutMs)

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: commandType,
          payload: { context: cluster, args }
        }))
      }

      ws.onmessage = (event: MessageEvent) => {
        const msg = parseWsMessage(event)
        if (!msg) {
          clearTimeout(timeout)
          ws.close()
          resolve(output || '')
          return
        }

        if (msg.id === requestId && msg.payload?.output) {
          output = msg.payload.output
        }
        clearTimeout(timeout)
        ws.close()
        resolve(output)
      }

      ws.onerror = () => {
        clearTimeout(timeout)
        ws.close()
        resolve(output || '')
      }
    })
  }, [cluster, openTrackedWs, parseWsMessage])

  /**
   * Run a kubectl command via the local agent WebSocket.
   *
   * @param args - kubectl arguments (e.g., ['get', 'pods', '-n', 'default'])
   * @param timeoutMs - timeout in milliseconds (default: 10000)
   * @returns command output or empty string on error/timeout
   */
  const runKubectl = useCallback(async (
    args: string[],
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<string> => {
    return runCommand('kubectl', args, timeoutMs)
  }, [runCommand])

  /**
   * Run a helm command via the local agent WebSocket.
   *
   * @param args - helm arguments (e.g., ['status', 'myrelease', '-n', 'default', '-o', 'json'])
   * @param timeoutMs - timeout in milliseconds (default: 15000 for helm)
   * @returns command output or empty string on error/timeout
   */
  const runHelm = useCallback(async (
    args: string[],
    timeoutMs: number = 15000
  ): Promise<string> => {
    return runCommand('helm', args, timeoutMs)
  }, [runCommand])

  // Close all tracked WebSocket connections on unmount
  useEffect(() => {
    const wsSet = activeWsRef.current
    return () => {
      for (const ws of Array.from(wsSet)) {
        try { ws.close() } catch { /* already closed */ }
      }
      wsSet.clear()
    }
  }, [])

  return {
    runKubectl,
    runHelm,
    // Low-level utilities for custom WebSocket operations (e.g., AI analysis)
    openTrackedWs,
    parseWsMessage,
  }
}
