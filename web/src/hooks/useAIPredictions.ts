import { useState, useEffect, useRef } from 'react'
import type {
  AIPrediction,
  AIPredictionsResponse,
  PredictedRisk
} from '../types/predictions'
import { getPredictionSettings, getSettingsForBackend } from './usePredictionSettings'
import { getDemoMode } from './useDemoMode'
import { isAgentUnavailable, reportAgentDataSuccess, reportAgentDataError } from './useLocalAgent'
import { setActiveTokenCategory, clearActiveTokenCategory } from './useTokenUsage'
import { fullFetchClusters, clusterCache } from './mcp/shared'

import { LOCAL_AGENT_WS_URL, LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { appendWsAuthToken } from '../lib/utils/wsAuth'
import { FETCH_DEFAULT_TIMEOUT_MS, AI_PREDICTION_TIMEOUT_MS, UI_FEEDBACK_TIMEOUT_MS, MAX_WS_RECONNECT_ATTEMPTS, getWsBackoffDelay } from '../lib/constants/network'

const DEGRADED_RECONNECT_INTERVAL_MS = 60_000
const FALLBACK_AI_RESOURCE_NAME = 'Unknown resource'
const FALLBACK_AI_CLUSTER_NAME = 'unknown'
const FALLBACK_AI_REASON = 'AI response unavailable'

const AGENT_HTTP_URL = LOCAL_AGENT_HTTP_URL
const POLL_INTERVAL_MS = 30_000 // Poll every 30 seconds as fallback

// Polling constants for analysis completion detection
const ANALYSIS_POLL_INTERVAL_MS = 4_000  // Poll for results every 4 seconds after triggering analysis
const ANALYSIS_MAX_TIMEOUT_MS = 60_000   // Give up waiting after 60 seconds

// Demo mode predictions
const DEMO_AI_PREDICTIONS: AIPrediction[] = [
  {
    id: 'demo-ai-1',
    category: 'resource-trend',
    severity: 'warning',
    name: 'gke-production-default-pool',
    cluster: 'gke-production',
    reason: 'Memory usage trending upward, may hit limits in ~2 hours',
    reasonDetailed: 'Memory usage has increased from 72% to 81% over the past hour. At current rate, the cluster will hit the 85% warning threshold in approximately 2 hours. Consider scaling up or investigating memory-intensive workloads.',
    confidence: 78,
    generatedAt: new Date().toISOString(),
    provider: 'claude',
    trend: 'worsening'
  },
  {
    id: 'demo-ai-2',
    category: 'anomaly',
    severity: 'warning',
    name: 'api-gateway-7f8d9c',
    cluster: 'eks-staging',
    reason: 'Unusual restart pattern detected - crashes correlate with traffic spikes',
    reasonDetailed: 'Pod has restarted 4 times in the past 3 hours, with each restart occurring during traffic peaks. This suggests memory or CPU limits may be too low for peak load. Recommend increasing resource limits or implementing HPA.',
    confidence: 85,
    generatedAt: new Date().toISOString(),
    provider: 'claude'
  },
]

// Singleton state - shared across all hook instances
let aiPredictions: AIPrediction[] = []
let lastAnalyzed: Date | null = null
let providers: string[] = []
let isStale = false
let wsConnected = false
let ws: WebSocket | null = null
let singletonPollInterval: ReturnType<typeof setInterval> | null = null
let wsReconnectTimeout: ReturnType<typeof setTimeout> | null = null
let degradedRetryInterval: ReturnType<typeof setInterval> | null = null
let wsReconnectAttempts = 0  // Track current reconnect attempt number
let inDegradedMode = false   // True when initial reconnect attempts exhausted
const subscribers = new Set<() => void>()

// Notify all subscribers
function notifySubscribers() {
  subscribers.forEach(fn => fn())
}

function getRequestSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
}

async function delayWithSignal(timeoutMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('Aborted', 'AbortError')
  }

  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', handleAbort)
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
    }

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort)
      resolve()
    }, timeoutMs)

    signal?.addEventListener('abort', handleAbort, { once: true })
  })
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
function reconnectWebSocket(): void {
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

function coercePredictionText(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (value == null) {
    return fallback
  }
  try {
    const serialized = JSON.stringify(value)
    return serialized || fallback
  } catch {
    return fallback
  }
}

function sanitizeAIPrediction(prediction: AIPrediction): AIPrediction {
  const rawPrediction = prediction as unknown as Record<string, unknown>
  const safeReason = coercePredictionText(rawPrediction.reason, FALLBACK_AI_REASON)

  return {
    ...prediction,
    name: coercePredictionText(rawPrediction.name, FALLBACK_AI_RESOURCE_NAME),
    cluster: coercePredictionText(rawPrediction.cluster, FALLBACK_AI_CLUSTER_NAME),
    reason: safeReason,
    reasonDetailed: coercePredictionText(rawPrediction.reasonDetailed, safeReason),
  }
}

function sanitizeAIPredictions(predictions: AIPrediction[]): AIPrediction[] {
  return predictions.map(sanitizeAIPrediction)
}

/**
 * Convert AI prediction from backend to PredictedRisk format
 */
function aiPredictionToRisk(prediction: AIPrediction): PredictedRisk {
  const sanitizedPrediction = sanitizeAIPrediction(prediction)
  return {
    id: sanitizedPrediction.id,
    type: sanitizedPrediction.category,
    severity: sanitizedPrediction.severity,
    name: sanitizedPrediction.name,
    cluster: sanitizedPrediction.cluster,
    namespace: sanitizedPrediction.namespace,
    reason: sanitizedPrediction.reason,
    reasonDetailed: sanitizedPrediction.reasonDetailed,
    source: 'ai',
    confidence: sanitizedPrediction.confidence,
    generatedAt: new Date(sanitizedPrediction.generatedAt),
    provider: sanitizedPrediction.provider,
    trend: sanitizedPrediction.trend
  }
}

/**
 * Fetch AI predictions from HTTP endpoint
 */
async function fetchAIPredictions(signal?: AbortSignal): Promise<void> {
  if (getDemoMode()) {
    aiPredictions = DEMO_AI_PREDICTIONS
    lastAnalyzed = new Date()
    providers = ['claude']
    isStale = false
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
    const response = await fetch(`${AGENT_HTTP_URL}/predictions/ai`, {
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
      aiPredictions = sanitizedPredictions.filter(p => p.confidence >= settings.minConfidence)
      lastAnalyzed = new Date(data.lastAnalyzed)
      providers = Array.isArray(data.providers) ? data.providers.filter((provider): provider is string => typeof provider === 'string') : []
      isStale = Boolean(data.stale)
      notifySubscribers()
    } else if (response.status === 404) {
      // Endpoint not implemented yet, use empty predictions
      aiPredictions = []
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
function connectWebSocket(): void {
  if (getDemoMode() || ws) return

  try {
    ws = new WebSocket(appendWsAuthToken(LOCAL_AGENT_WS_URL))

    ws.onopen = () => {
      wsConnected = true
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
          aiPredictions = sanitizedPredictions.filter(
            (p: AIPrediction) => p.confidence >= settings.minConfidence
          )
          lastAnalyzed = new Date(payload.timestamp || new Date().toISOString())
          providers = Array.isArray(payload.providers) ? payload.providers.filter((provider): provider is string => typeof provider === 'string') : []
          isStale = false
          notifySubscribers()
        } else if (message.type === 'clusters_updated') {
          // Kubeconfig changed - refresh cluster data
          clusterCache.consecutiveFailures = 0
          clusterCache.isFailed = false
          fullFetchClusters()
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
async function triggerAnalysis(specificProviders?: string[], signal?: AbortSignal): Promise<boolean> {
  if (getDemoMode()) {
    // Simulate analysis in demo mode
    await delayWithSignal(UI_FEEDBACK_TIMEOUT_MS, signal)
    if (signal?.aborted) return false

    aiPredictions = DEMO_AI_PREDICTIONS.map(p => ({
      ...p,
      id: `demo-ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      generatedAt: new Date().toISOString()
    }))
    lastAnalyzed = new Date()
    notifySubscribers()
    return true
  }

  try {
    const response = await fetch(`${AGENT_HTTP_URL}/predictions/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
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
function startSingletonPolling() {
  if (singletonPollInterval) return
  fetchAIPredictions()
  singletonPollInterval = setInterval(fetchAIPredictions, POLL_INTERVAL_MS)
}

/** Stop all singleton resources when the last subscriber unmounts */
function stopSingleton() {
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
 * Hook to access AI predictions
 */
export function useAIPredictions() {
  const [predictions, setPredictions] = useState<PredictedRisk[]>(
    aiPredictions.map(aiPredictionToRisk)
  )
  const [lastUpdated, setLastUpdated] = useState<Date | null>(lastAnalyzed)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [stale, setStale] = useState(isStale)
  const [activeProviders, setActiveProviders] = useState<string[]>(providers)

  // Subscribe to state updates
  useEffect(() => {
    const handleUpdate = () => {
      setPredictions(aiPredictions.map(aiPredictionToRisk))
      setLastUpdated(lastAnalyzed)
      setStale(isStale)
      setActiveProviders(providers)
    }

    subscribers.add(handleUpdate)
    handleUpdate() // Get initial state

    // Start WebSocket and polling only when first subscriber mounts
    connectWebSocket()
    startSingletonPolling()

    return () => {
      subscribers.delete(handleUpdate)
      // Tear down singleton resources when last subscriber unmounts
      if (subscribers.size === 0) {
        stopSingleton()
      }
    }
  }, [])

  // Re-filter when settings change
  useEffect(() => {
    const handleSettingsChange = () => {
      const settings = getPredictionSettings()
      setPredictions(
        aiPredictions
          .filter(p => p.confidence >= settings.minConfidence)
          .map(aiPredictionToRisk)
      )
    }

    window.addEventListener('kubestellar-prediction-settings-changed', handleSettingsChange)
    return () => {
      window.removeEventListener('kubestellar-prediction-settings-changed', handleSettingsChange)
    }
  }, [])

  // Refs to track active analysis so unmount/cancel can abort it cleanly
  const analysisPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analysisTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const analysisAbortRef = useRef<AbortController | null>(null)
  const analysisOpIdRef = useRef<string | null>(null)
  const isMountedRef = useRef(true)

  const clearAnalysisTimers = () => {
    if (analysisPollRef.current) {
      clearInterval(analysisPollRef.current)
      analysisPollRef.current = null
    }
    if (analysisTimeoutRef.current) {
      clearTimeout(analysisTimeoutRef.current)
      analysisTimeoutRef.current = null
    }
  }

  const cancelActiveAnalysis = () => {
    clearAnalysisTimers()

    if (analysisOpIdRef.current) {
      clearActiveTokenCategory(analysisOpIdRef.current)
      analysisOpIdRef.current = null
    }

    if (analysisAbortRef.current) {
      const controller = analysisAbortRef.current
      analysisAbortRef.current = null
      if (!controller.signal.aborted) {
        controller.abort()
      }
    }
  }

  const finishAnalysis = (controller: AbortController, opId: string) => {
    const isCurrentAnalysis = analysisAbortRef.current === controller

    if (isCurrentAnalysis) {
      clearAnalysisTimers()
      analysisAbortRef.current = null
      if (analysisOpIdRef.current === opId) {
        analysisOpIdRef.current = null
      }
      if (isMountedRef.current) {
        setIsAnalyzing(false)
      }
    }

    clearActiveTokenCategory(opId)
  }

  // Cleanup polling and in-flight requests on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false
      cancelActiveAnalysis()
    }
  }, [])

  // Trigger analysis with polling for completion
  const analyze = async (specificProviders?: string[]) => {
    // Generate a stable opId for the lifetime of this analyze call so
    // concurrent analyze() invocations (e.g. from different providers)
    // get independent token attribution (#6016). Fall back to a
    // timestamp-based id when crypto.randomUUID is unavailable (non-secure
    // contexts such as plain-http dev servers).
    const opId: string =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `predictions-${Date.now()}-${Math.random().toString(36).slice(2)}`

    cancelActiveAnalysis()

    const controller = new AbortController()
    analysisAbortRef.current = controller
    analysisOpIdRef.current = opId
    setIsAnalyzing(true)
    setActiveTokenCategory(opId, 'predictions')

    const timestampBeforeTrigger = lastAnalyzed ? lastAnalyzed.getTime() : 0

    try {
      const triggered = await triggerAnalysis(specificProviders, controller.signal)

      if (controller.signal.aborted) {
        return
      }

      if (!triggered) {
        finishAnalysis(controller, opId)
        return
      }

      // Poll until we detect newer predictions or hit the timeout.
      // A WebSocket `ai_predictions_updated` message will also update
      // `lastAnalyzed` via the singleton subscriber, so the poll check
      // will pick that up on its next tick.
      return new Promise<void>(resolve => {
        let settled = false

        const settle = () => {
          if (settled) return
          settled = true
          controller.signal.removeEventListener('abort', handleAbort)
          finishAnalysis(controller, opId)
          resolve()
        }

        const handleAbort = () => {
          settle()
        }

        controller.signal.addEventListener('abort', handleAbort, { once: true })

        // Max timeout — stop waiting regardless
        analysisTimeoutRef.current = setTimeout(() => {
          // One final fetch attempt before giving up
          fetchAIPredictions(controller.signal).finally(() => {
            if (!controller.signal.aborted) {
              settle()
            }
          })
        }, ANALYSIS_MAX_TIMEOUT_MS)

        // Poll at a regular interval for updated predictions
        analysisPollRef.current = setInterval(async () => {
          await fetchAIPredictions(controller.signal)
          if (controller.signal.aborted) return

          const currentTimestamp = lastAnalyzed ? lastAnalyzed.getTime() : 0
          if (currentTimestamp > timestampBeforeTrigger) {
            settle()
          }
        }, ANALYSIS_POLL_INTERVAL_MS)
      })
    } catch {
      if (!controller.signal.aborted) {
        finishAnalysis(controller, opId)
      }
      return
    }
  }

  // Check if AI predictions are enabled
  const isEnabled = getPredictionSettings().aiEnabled

  return {
    predictions,
    lastUpdated,
    isStale: stale,
    isAnalyzing,
    isEnabled,
    providers: activeProviders,
    analyze,
    refresh: fetchAIPredictions,
    reconnect: reconnectWebSocket
  }
}

/**
 * Get raw AI predictions for context building
 */
export function getRawAIPredictions(): AIPrediction[] {
  return aiPredictions
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

export const __testables = {
  aiPredictionToRisk,
  coercePredictionText,
  sanitizeAIPrediction,
  sanitizeAIPredictions,
  DEMO_AI_PREDICTIONS,
  DEGRADED_RECONNECT_INTERVAL_MS,
  POLL_INTERVAL_MS,
  ANALYSIS_POLL_INTERVAL_MS,
  ANALYSIS_MAX_TIMEOUT_MS,
}
