import { useEffect, useState, useRef } from 'react'
import { LOCAL_AGENT_WS_URL, MAX_WS_RECONNECT_ATTEMPTS, getWsBackoffDelay } from '../lib/constants/network'
import { appendWsAuthToken } from '../lib/utils/wsAuth'
import { createWsStaleDetection, type WsStaleDetectionController } from '../lib/ws/useWsStaleDetection'

/** Auto-dismiss delay after a successful operation */
export const CLUSTER_PROGRESS_AUTO_DISMISS_MS = 8_000
const STALE_CLUSTER_PROGRESS_TIMEOUT_MS = 45_000

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

const ACTIVE_CLUSTER_PROGRESS_STATUSES = new Set<ClusterProgressStatus>(['validating', 'creating', 'deleting'])

/**
 * Hook that listens for local_cluster_progress WebSocket broadcasts from kc-agent.
 * Uses a dedicated WebSocket connection (same pattern as useUpdateProgress).
 */
export function useClusterProgress() {
  const [progress, setProgress] = useState<ClusterProgress | null>(null)
  const [isStale, setIsStale] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const progressRef = useRef<ClusterProgress | null>(null)
  /** Track reconnect timer in a ref so cleanup can clear timers scheduled by onclose (#7785) */
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Track current reconnect attempt number */
  const reconnectAttemptsRef = useRef(0)
  const staleDetectionRef = useRef<WsStaleDetectionController | null>(null)

  progressRef.current = progress

  if (!staleDetectionRef.current) {
    staleDetectionRef.current = createWsStaleDetection({
      timeoutMs: STALE_CLUSTER_PROGRESS_TIMEOUT_MS,
      isConnected: () => Boolean(wsRef.current),
      shouldCheck: () => {
        const currentProgress = progressRef.current
        return Boolean(currentProgress && ACTIVE_CLUSTER_PROGRESS_STATUSES.has(currentProgress.status))
      },
      onStale: () => {
        const currentProgress = progressRef.current
        if (!currentProgress) return

        setIsStale(true)
        setProgress({
          ...currentProgress,
          status: 'failed',
        })
      },
    })
  }

  const staleDetection = staleDetectionRef.current!

  useEffect(() => {
    let unmounted = false

    async function connect(attemptNumber = 0) {
      if (unmounted) return

      try {
        const ws = new WebSocket(await appendWsAuthToken(LOCAL_AGENT_WS_URL))
        wsRef.current = ws
        reconnectAttemptsRef.current = attemptNumber

        ws.onmessage = (event) => {
          staleDetection.markMessageReceived()

          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'local_cluster_progress' && msg.payload) {
              const nextProgress = msg.payload as ClusterProgress
              setIsStale(false)
              setProgress(nextProgress)

              if (ACTIVE_CLUSTER_PROGRESS_STATUSES.has(nextProgress.status)) {
                staleDetection.start()
              } else {
                staleDetection.stop()
              }
            }
          } catch {
            // Ignore parse errors
          }
        }

        ws.onopen = () => {
          reconnectAttemptsRef.current = 0
          setIsStale(false)
          staleDetection.markMessageReceived()

          const currentProgress = progressRef.current
          if (currentProgress && ACTIVE_CLUSTER_PROGRESS_STATUSES.has(currentProgress.status)) {
            staleDetection.start()
          }
        }

        ws.onclose = () => {
          wsRef.current = null
          if (unmounted) return

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
      staleDetection.stop()
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [staleDetection])

  const dismiss = () => {
    staleDetection.stop()
    setIsStale(false)
    setProgress(null)
  }

  return { progress, dismiss, isStale }
}
