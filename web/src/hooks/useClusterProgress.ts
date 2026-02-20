import { useEffect, useState, useRef, useCallback } from 'react'
import { LOCAL_AGENT_WS_URL } from '../lib/constants/network'

/** WebSocket reconnect delay after connection drops */
const WS_RECONNECT_DELAY_MS = 10_000

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

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>

    function connect() {
      try {
        const ws = new WebSocket(LOCAL_AGENT_WS_URL)
        wsRef.current = ws

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

        ws.onclose = () => {
          wsRef.current = null
          reconnectTimer = setTimeout(connect, WS_RECONNECT_DELAY_MS)
        }

        ws.onerror = () => {
          ws.close()
        }
      } catch {
        // Agent not available, retry later
        reconnectTimer = setTimeout(connect, WS_RECONNECT_DELAY_MS)
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimer)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [])

  const dismiss = useCallback(() => setProgress(null), [])

  return { progress, dismiss }
}
