import { useEffect, useState, useRef, useCallback } from 'react'
import type { UpdateProgress, UpdateStepEntry } from '../types/updates'
import { LOCAL_AGENT_WS_URL, FETCH_DEFAULT_TIMEOUT_MS, MAX_WS_RECONNECT_ATTEMPTS, getWsBackoffDelay } from '../lib/constants/network'
import { MS_PER_SECOND } from '../lib/constants/time'
import { isNetlifyDeployment } from '../lib/demoMode'

const BACKEND_POLL_MS = 2000  // Poll interval when waiting for backend to come up
const BACKEND_POLL_MAX = 90   // Max attempts (~3 min) before giving up

// Stale detection: if WebSocket has been disconnected for this long during an
// active update (status is "pulling", "building", or "restarting"), we assume
// the kc-agent died and show a failure message instead of leaving the UI stuck.
const STALE_UPDATE_TIMEOUT_MS = 45_000  // 45 seconds without a WebSocket message

/** Known update step labels for developer channel (7-step update) */
const DEV_UPDATE_STEP_LABELS: Record<number, string> = {
  1: 'Git pull',
  2: 'npm install',
  3: 'Frontend build',
  4: 'Build console binary',
  5: 'Build kc-agent binary',
  6: 'Stopping services',
  7: 'Restart',
}

/** Statuses that indicate an update is actively running */
const ACTIVE_UPDATE_STATUSES = new Set(['pulling', 'building', 'restarting'])

/**
 * Hook that listens for update_progress WebSocket broadcasts from kc-agent.
 * Uses a separate WebSocket connection to avoid interfering with the shared one.
 * Also tracks step history for detailed progress display.
 *
 * Includes stale-state detection: if the WebSocket disconnects during an active
 * update and stays disconnected for STALE_UPDATE_TIMEOUT_MS, the hook
 * automatically transitions to a "failed" state with a helpful error message.
 */
export function useUpdateProgress() {
  const [progress, setProgress] = useState<UpdateProgress | null>(null)
  const [stepHistory, setStepHistory] = useState<UpdateStepEntry[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const progressRef = useRef<UpdateProgress | null>(null)
  /** Track current reconnect attempt number */
  const reconnectAttemptsRef = useRef(0)

  // Track the last time we received a WebSocket message during an active update.
  // Used for stale-state detection.
  const lastMessageTimeRef = useRef<number>(0)
  const staleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Keep ref in sync so the connect closure always sees the latest value
  progressRef.current = progress

  /** Build step entries from a progress event, preserving completed steps */
  const updateStepHistory = useCallback((p: UpdateProgress) => {
    if (!p.step || !p.totalSteps) return

    setStepHistory(prev => {
      const entries: UpdateStepEntry[] = []
      for (let i = 1; i <= p.totalSteps!; i++) {
        const label = DEV_UPDATE_STEP_LABELS[i] ?? `Step ${i}`
        if (i < p.step!) {
          // Completed: use previous timestamp if available, else now
          const existing = prev.find(e => e.step === i)
          entries.push({
            step: i,
            message: existing?.message ?? label,
            status: 'completed',
            timestamp: existing?.timestamp ?? Date.now(),
          })
        } else if (i === p.step!) {
          entries.push({
            step: i,
            message: p.message || label,
            status: 'active',
            timestamp: Date.now(),
          })
        } else {
          entries.push({
            step: i,
            message: label,
            status: 'pending',
            timestamp: 0,
          })
        }
      }
      return entries
    })
  }, [])

  // Start or stop the stale-state detection timer based on current progress.
  // When an update is active, we check periodically whether the WebSocket
  // has gone silent for too long — which means the kc-agent process likely died.
  const startStaleDetection = useCallback(() => {
    // Clear any existing timer
    if (staleTimerRef.current) {
      clearInterval(staleTimerRef.current)
      staleTimerRef.current = null
    }

    const STALE_CHECK_INTERVAL_MS = 5000  // Check every 5 seconds
    staleTimerRef.current = setInterval(() => {
      const cur = progressRef.current
      if (!cur || !ACTIVE_UPDATE_STATUSES.has(cur.status)) {
        // Not in an active update — stop checking
        if (staleTimerRef.current) {
          clearInterval(staleTimerRef.current)
          staleTimerRef.current = null
        }
        return
      }

      const elapsed = Date.now() - lastMessageTimeRef.current
      if (elapsed > STALE_UPDATE_TIMEOUT_MS && !wsRef.current) {
        // WebSocket disconnected during active update for too long — agent likely died
        setProgress({
          status: 'failed',
          message: 'Update agent stopped responding — the kc-agent process may have crashed during the build.',
          progress: cur.progress,
          error: 'No response from kc-agent for ' + Math.round(elapsed / 1000) + 's. '
            + 'Try restarting manually: cd <repo> && bash startup-oauth.sh',
        })

        // Stop the timer
        if (staleTimerRef.current) {
          clearInterval(staleTimerRef.current)
          staleTimerRef.current = null
        }
      }
    }, STALE_CHECK_INTERVAL_MS)
  }, [])

  useEffect(() => {
    let unmounted = false
    let reconnectTimer: ReturnType<typeof setTimeout>

    // After kc-agent reconnects during a restart, the Go backend may still
    // be building/starting. Poll /health before showing "done" so the
    // "Refresh" link only appears when the backend is actually ready.
    async function waitForBackend() {
      const RESTART_BASE_PCT = 88   // Starting progress during health polling
      const RESTART_MAX_PCT = 99    // Max progress before "done" (100%)
      const pctPerAttempt = (RESTART_MAX_PCT - RESTART_BASE_PCT) / BACKEND_POLL_MAX
      for (let i = 0; i < BACKEND_POLL_MAX; i++) {
        const pct = Math.round(RESTART_BASE_PCT + (i * pctPerAttempt))
        const elapsed = Math.round((i * BACKEND_POLL_MS) / MS_PER_SECOND)
        const TEN_SEC = 10
        const THIRTY_SEC = 30
        const SIXTY_SEC = 60

        // Show progressive messages so the user sees activity
        let message: string
        if (i === 0) {
          message = 'Waiting for services to restart...'
        } else if (elapsed < TEN_SEC) {
          message = `Starting backend services... (${elapsed}s)`
        } else if (elapsed < THIRTY_SEC) {
          message = `Backend initializing... (${elapsed}s)`
        } else if (elapsed < SIXTY_SEC) {
          message = `Still starting up — this can take a minute... (${elapsed}s)`
        } else {
          message = `Almost there — waiting for health check... (${elapsed}s)`
        }

        setProgress({ status: 'restarting', message, progress: pct })

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

    function connect(attemptNumber = 0) {
      try {
        const ws = new WebSocket(LOCAL_AGENT_WS_URL)
        wsRef.current = ws
        reconnectAttemptsRef.current = attemptNumber

        ws.onopen = () => {
          // Reset reconnect attempts and stale timer on successful connection
          reconnectAttemptsRef.current = 0
          lastMessageTimeRef.current = Date.now()

          // If we reconnected while showing "restarting", kc-agent is back -
          // but backend may still be building. Wait for it.
          const cur = progressRef.current
          if (cur && cur.status === 'restarting') {
            waitForBackend()
          }
        }

        ws.onmessage = (event) => {
          // Update last-message timestamp for stale detection
          lastMessageTimeRef.current = Date.now()

          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'update_progress' && msg.payload) {
              const p = msg.payload as UpdateProgress

              // Start stale detection when an active update begins
              if (ACTIVE_UPDATE_STATUSES.has(p.status) && !staleTimerRef.current) {
                startStaleDetection()
              }

              setProgress(p)
              updateStepHistory(p)

              // Stop stale detection when update is done, failed, or cancelled
              if (p.status === 'done' || p.status === 'failed' || p.status === 'cancelled') {
                if (staleTimerRef.current) {
                  clearInterval(staleTimerRef.current)
                  staleTimerRef.current = null
                }
              }
            }
          } catch {
            // Ignore parse errors
          }
        }

        ws.onclose = () => {
          wsRef.current = null

          // Check if we've exceeded max reconnect attempts
          if (reconnectAttemptsRef.current >= MAX_WS_RECONNECT_ATTEMPTS) {
            console.warn('[UpdateProgress] Max reconnect attempts exceeded, giving up')
            return
          }

          const delay = getWsBackoffDelay(reconnectAttemptsRef.current)
          console.debug(`[UpdateProgress] Connection lost, reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttemptsRef.current + 1}/${MAX_WS_RECONNECT_ATTEMPTS})`)

          reconnectTimer = setTimeout(() => {
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
        if (reconnectAttemptsRef.current >= MAX_WS_RECONNECT_ATTEMPTS) {
          console.warn('[UpdateProgress] Max reconnect attempts exceeded, giving up')
          return
        }

        const delay = getWsBackoffDelay(reconnectAttemptsRef.current)
        console.debug(`[UpdateProgress] Agent unavailable, retrying in ${Math.round(delay)}ms (attempt ${reconnectAttemptsRef.current + 1}/${MAX_WS_RECONNECT_ATTEMPTS})`)

        reconnectTimer = setTimeout(() => {
          if (!unmounted) {
            connect(reconnectAttemptsRef.current + 1)
          }
        }, delay)
      }
    }

    // Skip agent WebSocket on Netlify deployments (no local agent available)
    if (isNetlifyDeployment) return

    connect()

    return () => {
      unmounted = true
      clearTimeout(reconnectTimer)
      if (staleTimerRef.current) {
        clearInterval(staleTimerRef.current)
        staleTimerRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [updateStepHistory, startStaleDetection])

  const dismiss = () => {
    setProgress(null)
    setStepHistory([])
  }

  return { progress, stepHistory, dismiss }
}
