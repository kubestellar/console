import { useState, useEffect, useRef } from 'react'
import type { PredictedRisk } from '../types/predictions'
import { getPredictionSettings } from './usePredictionSettings'
import { setActiveTokenCategory, clearActiveTokenCategory } from './useTokenUsage'
import {
  DEMO_AI_PREDICTIONS,
  DEGRADED_RECONNECT_INTERVAL_MS,
  POLL_INTERVAL_MS,
  ANALYSIS_POLL_INTERVAL_MS,
  ANALYSIS_MAX_TIMEOUT_MS,
  aiPredictionToRisk,
  coercePredictionText,
  sanitizeAIPrediction,
  sanitizeAIPredictions,
} from './useAIPredictions.helpers'
import {
  aiPredictionsState,
  subscribers,
  getCombinedStaleState,
  reconnectWebSocket,
  fetchAIPredictions,
  connectWebSocket,
  triggerAnalysis,
  startSingletonPolling,
  stopSingleton,
} from './useAIPredictions.store'

export { getRawAIPredictions, isWSConnected, syncSettingsToBackend } from './useAIPredictions.store'

/**
 * Hook to access AI predictions
 */
export function useAIPredictions() {
  const [predictions, setPredictions] = useState<PredictedRisk[]>(
    aiPredictionsState.aiPredictions.map(aiPredictionToRisk)
  )
  const [lastUpdated, setLastUpdated] = useState<Date | null>(aiPredictionsState.lastAnalyzed)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [stale, setStale] = useState(getCombinedStaleState())
  const [activeProviders, setActiveProviders] = useState<string[]>(aiPredictionsState.providers)

  // Subscribe to state updates
  useEffect(() => {
    const handleUpdate = () => {
      setPredictions(aiPredictionsState.aiPredictions.map(aiPredictionToRisk))
      setLastUpdated(aiPredictionsState.lastAnalyzed)
      setStale(getCombinedStaleState())
      setActiveProviders(aiPredictionsState.providers)
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
        aiPredictionsState.aiPredictions
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

    const timestampBeforeTrigger = aiPredictionsState.lastAnalyzed ? aiPredictionsState.lastAnalyzed.getTime() : 0

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

          const currentTimestamp = aiPredictionsState.lastAnalyzed ? aiPredictionsState.lastAnalyzed.getTime() : 0
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
