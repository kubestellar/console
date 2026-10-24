import type { AIPrediction, AIPredictionsResponse } from '../types/predictions'
import { getPredictionSettings, getSettingsForBackend } from './usePredictionSettings'
import { getDemoMode } from './useDemoMode'
import { isAgentUnavailable, reportAgentDataSuccess, reportAgentDataError } from './useLocalAgent'
import { fullFetchClusters, clusterCache, agentFetch } from './mcp/shared'

import { LOCAL_AGENT_WS_URL, LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { getWsAuthParams } from '../lib/utils/wsAuth'
import { FETCH_DEFAULT_TIMEOUT_MS, AI_PREDICTION_TIMEOUT_MS, UI_FEEDBACK_TIMEOUT_MS, MAX_WS_RECONNECT_ATTEMPTS, getWsBackoffDelay, isLocalAgentSuppressed, areOptionalPollersSuppressed } from '../lib/constants/network'
import { createWsStaleDetection, type WsStaleDetectionController } from '../lib/ws/useWsStaleDetection'
import {
  DEGRADED_RECONNECT_INTERVAL_MS,
  STALE_AI_PREDICTIONS_TIMEOUT_MS,
  POLL_INTERVAL_MS,
  DEMO_AI_PREDICTIONS,
  getRequestSignal,
  delayWithSignal,
  sanitizeAIPredictions,
} from './useAIPredictions.helpers'

// Singleton state - shared across all hook instances. The values read by the
// useAIPredictions hook live on one object so both modules observe updates.
export const aiPredictionsState: {
  aiPredictions: AIPrediction[]
  lastAnalyzed: Date | null
  providers: string[]
} = {
  aiPredictions: [],
  lastAnalyzed: null,
  providers: [],
}
let isStale = false
let wsConnectionIsStale = false
let wsConnected = false
let ws: WebSocket | null = null
let singletonPollInterval: ReturnType<typeof setInterval> | null = null
let wsReconnectTimeout: ReturnType<typeof setTimeout> | null = null
let degradedRetryInterval: ReturnType<typeof setInterval> | null = null
let wsReconnectAttempts = 0  // Track current reconnect attempt number
let inDegradedMode = false   // True when initial reconnect attempts exhausted
let predictionStaleDetection: WsStaleDetectionController | null = null
export const subscribers = new Set<() => void>()

// Notify all subscribers
function notifySubscribers() {
  subscribers.forEach(fn => fn())
}

export function getCombinedStaleState(): boolean {
  return isStale || wsConnectionIsStale
}

function getPredictionStaleDetection(): WsStaleDetectionController {
  if (!predictionStaleDetection) {
    predictionStaleDetection = createWsStaleDetection({
      timeoutMs: STALE_AI_PREDICTIONS_TIMEOUT_MS,
      isConnected: () => wsConnected && Boolean(ws),
      shouldCheck: () => subscribers.size > 0,
      onStale: () => {
        wsConnectionIsStale = true
        notifySubscribers()
      },
      onDrift: (versions) => {
        // Drift detected by comparing server-side resource versions with client state.
        // If 'clusters' count drifted, we MUST trigger a full refresh to avoid
        // showing stale data from a deleted/added context (#12000).
        const currentClusters = clusterCache.clusters?.length || 0
        const serverClusters = parseInt(versions.clusters)
        if (!isNaN(serverClusters) && serverClusters !== currentClusters) {
          console.warn('[AIPredictions] Cluster count drift detected, refreshing...');
          fullFetchClusters();
        }
      },
    })
  }

  return predictionStaleDetection
}

/**
 * Reset WebSocket reconnect state so the next attempt uses fast exponential backoff.
 * Called when evidence suggests the backend is reachable again (e.g. successful HTTP fetch).
 */
function resetWsReconnect(): void {
  wsReconnectAttempts = 0
  inDegradedMode = false
  if (degradedRetryInterval) {
    clearInterval(degradedRetryInterval)
    degradedRetryInterval = null
  }
}

/**
 * Start degraded-mode reconnection: slow periodic retry after initial attempts are exhausted.
 */
function startDegradedReconnect(): void {
  if (degradedRetryInterval) return
  inDegradedMode = true
  console.warn('[AIPredictions] Entering degraded reconnect mode — retrying every 60s')
  degradedRetryInterval = setInterval(() => {
    if (subscribers.size === 0) {
      // No active subscribers — stop degraded retry
      resetWsReconnect()
      return
    }
    if (!ws && !wsReconnectTimeout) {
      console.debug('[AIPredictions] Degraded-mode reconnect attempt')
      connectWebSocket()
    }
  }, DEGRADED_RECONNECT_INTERVAL_MS)
}

/**
 * Manually trigger a WebSocket reconnection attempt.
 * Resets the backoff counter so fast reconnection is tried immediately.
 */
export function reconnectWebSocket(): void {
  resetWsReconnect()
  if (wsReconnectTimeout) {
    clearTimeout(wsReconnectTimeout)
    wsReconnectTimeout = null
  }
  if (ws) {
    ws.onclose = null
    ws.close()
    ws = null
    wsConnected = false
  }
  connectWebSocket()
}

/**
 * Fetch AI predictions from HTTP endpoint
 */
export async function fetchAIPredictions(signal?: AbortSignal): Promise<void> {
  if (getDemoMode()) {
    aiPredictionsState.aiPredictions = DEMO_AI_PREDICTIONS
    aiPredictionsState.lastAnalyzed = new Date()
    aiPredictionsState.providers = ['claude']
    isStale = false
    wsConnectionIsStale = false
    notifySubscribers()
    return
  }

  if (isLocalAgentSuppressed() || areOptionalPollersSuppressed()) {
    aiPredictionsState.aiPredictions = []
    aiPredictionsState.providers = []
    isStale = false
    wsConnectionIsStale = false
    notifySubscribers()
    return
  }

  if (isAgentUnavailable()) {
    // Agent is known to be unavailable — mark existing predictions as stale so
    // the UI stops presenting them as fresh (#5937). Also notify subscribers so
    // the UI re-renders immediately instead of waiting for the next poll cycle
    // (#5938).
    if (!isStale) {
      isStale = true
      notifySubscribers()
    }
    return
  }

  try {
    const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/predictions/ai`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: getRequestSignal(AI_PREDICTION_TIMEOUT_MS, signal)
    })

    if (signal?.aborted) return

    if (response.ok) {
      reportAgentDataSuccess()
      const data: AIPredictionsResponse = await response.json()
      if (signal?.aborted) return
      const sanitizedPredictions = sanitizeAIPredictions(Array.isArray(data.predictions) ? data.predictions : [])

      // Successful HTTP fetch means backend is reachable — reset WS reconnect
      // so it retries with fast backoff if currently in degraded mode.
      if (inDegradedMode && !wsConnected) {
        resetWsReconnect()
        connectWebSocket()
      }

      // Filter by confidence threshold
      const settings = getPredictionSettings()
      aiPredictionsState.aiPredictions = sanitizedPredictions.filter(p => p.confidence >= settings.minConfidence)
      aiPredictionsState.lastAnalyzed = new Date(data.lastAnalyzed)
      aiPredictionsState.providers = Array.isArray(data.providers) ? data.providers.filter((provider): provider is string => typeof provider === 'string') : []
      isStale = Boolean(data.stale)
      notifySubscribers()
    } else if (response.status === 404) {
      // Endpoint not implemented yet, use empty predictions
      aiPredictionsState.aiPredictions = []
      isStale = true
      notifySubscribers()
    } else {
      // Non-OK response (5xx, 401, etc.) — report failure, mark stale, and
      // notify subscribers so the UI reflects the error state (#5937, #5938).
      reportAgentDataError('/predictions/ai', `HTTP ${response.status}`)
      isStale = true
      notifySubscribers()
    }
  } catch (error: unknown) {
    if (signal?.aborted) return

    // Network error or timeout — backend is unreachable. Mark predictions
    // stale and notify subscribers so the UI updates immediately rather than
    // continuing to show data as if it were fresh (#5937, #5938). Existing
    // prediction data is intentionally preserved (not cleared) so users can
    // still see the last known state, clearly labeled as stale.
    reportAgentDataError('/predictions/ai', error instanceof Error ? error.message : 'fetch_failed')
    isStale = true
    notifySubscribers()
  }
}

/**
 * Connect to WebSocket for real-time prediction updates
 */
export async function connectWebSocket(): Promise<void> {
  if (getDemoMode() || ws || isLocalAgentSuppressed() || areOptionalPollersSuppressed()) return

  try {
    const { url, protocols } = await getWsAuthParams(LOCAL_AGENT_WS_URL)
    ws = new WebSocket(url, protocols)

    ws.onopen = () => {
      wsConnected = true
      wsConnectionIsStale = false
      getPredictionStaleDetection().markMessageReceived()
      getPredictionStaleDetection().start()
      notifySubscribers()
      // Reset reconnect attempts and degraded mode on successful connection
      resetWsReconnect()
      // Send current settings to backend
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'prediction_settings',
          payload: getSettingsForBackend()
        }))
      }
    }

    ws.onmessage = (event) => {
      wsConnectionIsStale = false
      getPredictionStaleDetection().markMessageReceived()

      try {
        const message = JSON.parse(event.data)
        if (message.type === 'ai_predictions_updated') {
          const settings = getPredictionSettings()
          const payload = (message.payload ?? {}) as {
            predictions?: AIPrediction[]
            timestamp?: string
            providers?: string[]
          }
          const sanitizedPredictions = sanitizeAIPredictions(Array.isArray(payload.predictions) ? payload.predictions : [])
          aiPredictionsState.aiPredictions = sanitizedPredictions.filter(
            (p: AIPrediction) => p.confidence >= settings.minConfidence
          )
          aiPredictionsState.lastAnalyzed = new Date(payload.timestamp || new Date().toISOString())
          aiPredictionsState.providers = Array.isArray(payload.providers) ? payload.providers.filter((provider): provider is string => typeof provider === 'string') : []
          isStale = false
          notifySubscribers()
        } else if (message.type === 'clusters_updated') {
          // Kubeconfig changed - refresh cluster data
          clusterCache.consecutiveFailures = 0
          clusterCache.isFailed = false
          fullFetchClusters()
        } else if (message.type === 'state_digest') {
          const payload = (message.payload ?? {}) as { versions?: Record<string, string> }
          getPredictionStaleDetection().handleDigest(payload.versions || {})
        }
      } catch {
        // Invalid JSON, ignore
      }
    }

    ws.onclose = () => {
      wsConnected = false
      ws = null

      // Only reconnect if there are still active subscribers
      if (subscribers.size > 0) {
        // Check if we've exceeded max reconnect attempts
        if (wsReconnectAttempts >= MAX_WS_RECONNECT_ATTEMPTS) {
          // Switch to degraded mode instead of permanently giving up
          startDegradedReconnect()
          return
        }

        const delay = getWsBackoffDelay(wsReconnectAttempts)
        console.debug(`[AIPredictions] Connection lost, reconnecting in ${Math.round(delay)}ms (attempt ${wsReconnectAttempts + 1}/${MAX_WS_RECONNECT_ATTEMPTS})`)

        wsReconnectTimeout = setTimeout(() => {
          wsReconnectTimeout = null
          wsReconnectAttempts++
          connectWebSocket()
        }, delay)
      }
    }

    ws.onerror = () => {
      wsConnected = false
      ws?.close()
      ws = null
    }
  } catch {
    // WebSocket not supported or connection failed
  }
}

/**
 * Trigger manual AI analysis
 */
export async function triggerAnalysis(specificProviders?: string[], signal?: AbortSignal): Promise<boolean> {
  if (isLocalAgentSuppressed() || areOptionalPollersSuppressed()) return false

  if (getDemoMode()) {
    // Simulate analysis in demo mode
    await delayWithSignal(UI_FEEDBACK_TIMEOUT_MS, signal)
    if (signal?.aborted) return false

    aiPredictionsState.aiPredictions = DEMO_AI_PREDICTIONS.map(p => ({
      ...p,
      id: `demo-ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      generatedAt: new Date().toISOString()
    }))
    aiPredictionsState.lastAnalyzed = new Date()
    notifySubscribers()
    return true
  }

  try {
    const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/predictions/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providers: specificProviders }),
      signal: getRequestSignal(FETCH_DEFAULT_TIMEOUT_MS, signal)
    })

    if (signal?.aborted) return false

    if (response.ok) {
      // Analysis started, results will come via WebSocket or next poll
      return true
    }
    return false
  } catch (error) {
    if (signal?.aborted) throw error
    return false
  }
}

/** Start singleton polling — only starts once regardless of how many hook instances exist */
export function startSingletonPolling() {
  if (isLocalAgentSuppressed() || areOptionalPollersSuppressed()) {
    void fetchAIPredictions()
    return
  }
  if (singletonPollInterval) return
  fetchAIPredictions()
  singletonPollInterval = setInterval(fetchAIPredictions, POLL_INTERVAL_MS)
}

/** Stop all singleton resources when the last subscriber unmounts */
export function stopSingleton() {
  if (singletonPollInterval) {
    clearInterval(singletonPollInterval)
    singletonPollInterval = null
  }
  if (wsReconnectTimeout) {
    clearTimeout(wsReconnectTimeout)
    wsReconnectTimeout = null
  }
  if (degradedRetryInterval) {
    clearInterval(degradedRetryInterval)
    degradedRetryInterval = null
  }
  predictionStaleDetection?.stop()
  wsConnectionIsStale = false
  inDegradedMode = false
  if (ws) {
    ws.onclose = null // Prevent reconnect from onclose handler
    ws.close()
    ws = null
    wsConnected = false
  }
  // Reset reconnect attempts when stopping
  wsReconnectAttempts = 0
}

/**
 * Get raw AI predictions for context building
 */
export function getRawAIPredictions(): AIPrediction[] {
  return aiPredictionsState.aiPredictions
}

/**
 * Check if WebSocket is connected
 */
export function isWSConnected(): boolean {
  return wsConnected
}

/**
 * Send settings update to backend via WebSocket
 */
export function syncSettingsToBackend(): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'prediction_settings',
      payload: getSettingsForBackend()
    }))
  }
}
