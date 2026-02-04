import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  AIPrediction,
  AIPredictionsResponse,
  PredictedRisk,
} from '../types/predictions'
import { getPredictionSettings, getSettingsForBackend } from './usePredictionSettings'
import { getDemoMode } from './useDemoMode'
import { isAgentUnavailable, reportAgentDataSuccess, reportAgentDataError } from './useLocalAgent'

const AGENT_HTTP_URL = 'http://127.0.0.1:8585'
const AGENT_WS_URL = 'ws://127.0.0.1:8585/ws'
const POLL_INTERVAL = 30000 // Poll every 30 seconds as fallback

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
    trend: 'worsening',
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
    provider: 'claude',
  },
]

// Singleton state - shared across all hook instances
let aiPredictions: AIPrediction[] = []
let lastAnalyzed: Date | null = null
let providers: string[] = []
let isStale = false
let wsConnected = false
let ws: WebSocket | null = null
const subscribers = new Set<() => void>()

// Notify all subscribers
function notifySubscribers() {
  subscribers.forEach(fn => fn())
}

/**
 * Convert AI prediction from backend to PredictedRisk format
 */
function aiPredictionToRisk(prediction: AIPrediction): PredictedRisk {
  return {
    id: prediction.id,
    type: prediction.category,
    severity: prediction.severity,
    name: prediction.name,
    cluster: prediction.cluster,
    reason: prediction.reason,
    reasonDetailed: prediction.reasonDetailed,
    source: 'ai',
    confidence: prediction.confidence,
    generatedAt: new Date(prediction.generatedAt),
    provider: prediction.provider,
    trend: prediction.trend,
  }
}

/**
 * Fetch AI predictions from HTTP endpoint
 */
async function fetchAIPredictions(): Promise<void> {
  if (getDemoMode()) {
    aiPredictions = DEMO_AI_PREDICTIONS
    lastAnalyzed = new Date()
    providers = ['claude']
    isStale = false
    notifySubscribers()
    return
  }

  if (isAgentUnavailable()) {
    return
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(`${AGENT_HTTP_URL}/predictions/ai`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (response.ok) {
      reportAgentDataSuccess()
      const data: AIPredictionsResponse = await response.json()

      // Filter by confidence threshold
      const settings = getPredictionSettings()
      aiPredictions = data.predictions.filter(p => p.confidence >= settings.minConfidence)
      lastAnalyzed = new Date(data.lastAnalyzed)
      providers = data.providers
      isStale = data.stale
      notifySubscribers()
    } else if (response.status === 404) {
      // Endpoint not implemented yet, use empty predictions
      aiPredictions = []
      isStale = true
    } else {
      reportAgentDataError('/predictions/ai', `HTTP ${response.status}`)
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // Timeout, agent likely unavailable
    }
    // Don't clear predictions on error, keep stale data
    isStale = true
  }
}

/**
 * Connect to WebSocket for real-time prediction updates
 */
function connectWebSocket(): void {
  if (getDemoMode() || ws) return

  try {
    ws = new WebSocket(AGENT_WS_URL)

    ws.onopen = () => {
      wsConnected = true
      // Send current settings to backend
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'prediction_settings',
          payload: getSettingsForBackend(),
        }))
      }
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'ai_predictions_updated') {
          const settings = getPredictionSettings()
          aiPredictions = message.payload.predictions.filter(
            (p: AIPrediction) => p.confidence >= settings.minConfidence
          )
          lastAnalyzed = new Date(message.payload.timestamp)
          providers = message.payload.providers || []
          isStale = false
          notifySubscribers()
        }
      } catch {
        // Invalid JSON, ignore
      }
    }

    ws.onclose = () => {
      wsConnected = false
      ws = null
      // Reconnect after delay
      setTimeout(connectWebSocket, 5000)
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
async function triggerAnalysis(specificProviders?: string[]): Promise<boolean> {
  if (getDemoMode()) {
    // Simulate analysis in demo mode
    await new Promise(resolve => setTimeout(resolve, 2000))
    aiPredictions = DEMO_AI_PREDICTIONS.map(p => ({
      ...p,
      id: `demo-ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      generatedAt: new Date().toISOString(),
    }))
    lastAnalyzed = new Date()
    notifySubscribers()
    return true
  }

  try {
    const response = await fetch(`${AGENT_HTTP_URL}/predictions/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providers: specificProviders }),
    })

    if (response.ok) {
      // Analysis started, results will come via WebSocket or next poll
      return true
    }
    return false
  } catch {
    return false
  }
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

    // Start WebSocket connection
    connectWebSocket()

    // Initial fetch
    fetchAIPredictions()

    // Set up polling as fallback
    pollRef.current = setInterval(fetchAIPredictions, POLL_INTERVAL)

    return () => {
      subscribers.delete(handleUpdate)
      if (pollRef.current) {
        clearInterval(pollRef.current)
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

  // Trigger analysis
  const analyze = useCallback(async (specificProviders?: string[]) => {
    setIsAnalyzing(true)
    try {
      await triggerAnalysis(specificProviders)
      // Wait a bit then fetch results
      await new Promise(resolve => setTimeout(resolve, 1000))
      await fetchAIPredictions()
    } finally {
      setIsAnalyzing(false)
    }
  }, [])

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
      payload: getSettingsForBackend(),
    }))
  }
}
