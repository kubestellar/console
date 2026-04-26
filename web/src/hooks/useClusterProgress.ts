import { useEffect, useState, useRef } from 'react'
import { LOCAL_AGENT_WS_URL, MAX_WS_RECONNECT_ATTEMPTS, getWsBackoffDelay } from '../lib/constants/network'

/** Auto-dismiss delay after a successful operation */
export const CLUSTER_PROGRESS_AUTO_DISMISS_MS = 8_000

export type ClusterProgressStatus =
  | 'validating'
  | 'creating'
  | 'deleting'
  | 'done'
  | 'failed'

export interface ClusterProgress {
  tool: string
  name: string
  status: ClusterProgressStatus
  message: string
  /** 0-100 percentage of completion */
  progress: number
}

/**
 * Hook that listens for local_cluster_progress WebSocket broadcasts from kc-agent.
 * Uses a dedicated WebSocket connection (same pattern as useUpdateProgress).
 */
export function useClusterProgress() {
  const [progress, setProgress] = useState<ClusterProgress | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  /** Track reconnect timer in a ref so cleanup can clear timers scheduled by onclose (#7785) */
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Track current reconnect attempt number */
  const reconnectAttemptsRef = useRef(0)

  useEffect(() => {
    let unmounted = false

    function connect(attemptNumber = 0) {
      if (unmounted) return

      try {
        const ws = new WebSocket(LOCAL_AGENT_WS_URL)
        wsRef.current = ws
        reconnectAttemptsRef.current = attemptNumber

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'local_cluster_progress' && msg.payload) {
              setProgress(msg.payload as ClusterProgress)
            }
          } catch {
            // Ignore parse errors
          }
        }

        ws.onopen = () => {
          // Reset reconnect attempts on successful connection
          reconnectAttemptsRef.current = 0
        }

        ws.onclose = () => {
          wsRef.current = null
          if (unmounted) return

          // Check if we've exceeded max reconnect attempts
          if (reconnectAttemptsRef.current >= MAX_WS_RECONNECT_ATTEMPTS) {
            console.warn('[ClusterProgress] Max reconnect attempts exceeded, giving up')
            return
          }

          const delay = getWsBackoffDelay(reconnectAttemptsRef.current)
          console.debug(`[ClusterProgress] Connection lost, reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttemptsRef.current + 1}/${MAX_WS_RECONNECT_ATTEMPTS})`)

          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null
            if (!unmounted) {
              connect(reconnectAttemptsRef.current + 1)
            }
          }, delay)
        }

        ws.onerror = () => {
          ws.close()
        }
      } catch {
        // Agent not available, retry later with exponential backoff
        if (unmounted) return

        if (reconnectAttemptsRef.current >= MAX_WS_RECONNECT_ATTEMPTS) {
          console.warn('[ClusterProgress] Max reconnect attempts exceeded, giving up')
          return
        }

        const delay = getWsBackoffDelay(reconnectAttemptsRef.current)
        console.debug(`[ClusterProgress] Agent unavailable, retrying in ${Math.round(delay)}ms (attempt ${reconnectAttemptsRef.current + 1}/${MAX_WS_RECONNECT_ATTEMPTS})`)

        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null
          if (!unmounted) {
            connect(reconnectAttemptsRef.current + 1)
          }
        }, delay)
      }
    }

    connect()

    return () => {
      unmounted = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [])

  const dismiss = () => setProgress(null)

  return { progress, dismiss }
}
