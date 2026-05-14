export const DEFAULT_WS_STALE_TIMEOUT_MS = 45_000
export const WS_STALE_CHECK_INTERVAL_MS = 5_000

interface CreateWsStaleDetectionOptions {
  timeoutMs?: number
  onStale: (elapsedMs: number) => void
  isConnected?: () => boolean
  shouldCheck?: () => boolean
}

export interface WsStaleDetectionController {
  markMessageReceived: () => void
  start: () => void
  stop: () => void
  getLastMessageAgeMs: () => number
}

/**
 * Create a reusable WebSocket stale detector.
 *
 * The detector mirrors the useUpdateProgress pattern: once started, it checks
 * every 5 seconds whether the socket is disconnected and no message has been
 * received for the configured timeout window.
 */
export function createWsStaleDetection({
  timeoutMs = DEFAULT_WS_STALE_TIMEOUT_MS,
  onStale,
  isConnected,
  shouldCheck,
}: CreateWsStaleDetectionOptions): WsStaleDetectionController {
  let lastMessageTime = 0
  let staleTimer: ReturnType<typeof setInterval> | null = null

  const stop = () => {
    if (staleTimer) {
      clearInterval(staleTimer)
      staleTimer = null
    }
    lastMessageTime = 0
  }

  const markMessageReceived = () => {
    lastMessageTime = Date.now()
  }

  const start = () => {
    if (staleTimer) {
      return
    }

    staleTimer = setInterval(() => {
      if (shouldCheck && !shouldCheck()) {
        stop()
        return
      }

      if (lastMessageTime === 0) {
        return
      }

      if (isConnected && isConnected()) {
        return
      }

      const elapsedMs = Date.now() - lastMessageTime
      if (elapsedMs > timeoutMs) {
        onStale(elapsedMs)
        stop()
      }
    }, WS_STALE_CHECK_INTERVAL_MS)
  }

  return {
    markMessageReceived,
    start,
    stop,
    getLastMessageAgeMs: () => (lastMessageTime > 0 ? Date.now() - lastMessageTime : 0),
  }
}
