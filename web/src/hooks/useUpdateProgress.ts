import { useEffect, useState, useRef } from 'react'
import type { UpdateProgress } from '../types/updates'
import { LOCAL_AGENT_WS_URL, FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'

const WS_RECONNECT_MS = 5000  // Reconnect interval after WebSocket disconnect
const BACKEND_POLL_MS = 2000  // Poll interval when waiting for backend to come up
const BACKEND_POLL_MAX = 90   // Max attempts (~3 min) before giving up

/**
 * Hook that listens for update_progress WebSocket broadcasts from kc-agent.
 * Uses a separate WebSocket connection to avoid interfering with the shared one.
 */
export function useUpdateProgress() {
  const [progress, setProgress] = useState<UpdateProgress | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const progressRef = useRef<UpdateProgress | null>(null)

  // Keep ref in sync so the connect closure always sees the latest value
  progressRef.current = progress

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>

    // After kc-agent reconnects during a restart, the Go backend may still
    // be building/starting. Poll /health before showing "done" so the
    // "Refresh" link only appears when the backend is actually ready.
    async function waitForBackend() {
      setProgress({ status: 'restarting', message: 'Waiting for backend to come up...', progress: 90 })
      for (let i = 0; i < BACKEND_POLL_MAX; i++) {
        try {
          const resp = await fetch('/health', { cache: 'no-store', signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
          if (resp.ok) {
            const data = await resp.json()
            // The loading server returns {"status":"starting"} while the backend
            // initializes. Only show "done" when the real server returns "ok" —
            // otherwise the user refreshes into a loading page or blank screen.
            if (data.status === 'ok') {
              setProgress({ status: 'done', message: 'Update complete — restart successful', progress: 100 })
              return
            }
          }
        } catch {
          // Backend not ready yet
        }
        await new Promise(r => setTimeout(r, BACKEND_POLL_MS))
      }
      // Timed out — show done anyway (backend might be on a different port)
      setProgress({ status: 'done', message: 'Update complete — restart successful', progress: 100 })
    }

    function connect() {
      try {
        const ws = new WebSocket(LOCAL_AGENT_WS_URL)
        wsRef.current = ws

        ws.onopen = () => {
          // If we reconnected while showing "restarting", kc-agent is back —
          // but backend may still be building. Wait for it.
          const cur = progressRef.current
          if (cur && cur.status === 'restarting') {
            waitForBackend()
          }
        }

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'update_progress' && msg.payload) {
              setProgress(msg.payload as UpdateProgress)
            }
          } catch {
            // Ignore parse errors
          }
        }

        ws.onclose = () => {
          wsRef.current = null
          // Reconnect after 5 seconds (faster during restarts)
          reconnectTimer = setTimeout(connect, WS_RECONNECT_MS)
        }

        ws.onerror = () => {
          ws.close()
        }
      } catch {
        // Agent not available, retry later
        reconnectTimer = setTimeout(connect, WS_RECONNECT_MS)
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

  const dismiss = () => setProgress(null)

  return { progress, dismiss }
}
