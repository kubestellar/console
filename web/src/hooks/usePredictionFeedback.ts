import { useState, useEffect, useCallback } from 'react'
import type { PredictionFeedback, StoredFeedback, PredictionType, PredictionStats } from '../types/predictions'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'

const STORAGE_KEY = 'kubestellar-prediction-feedback'
const FEEDBACK_CHANGED_EVENT = 'kubestellar-prediction-feedback-changed'
const MAX_FEEDBACK_ENTRIES = 500 // Keep last 500 feedback entries

// Singleton state - shared across all hook instances
let feedbackMap: Map<string, StoredFeedback> = new Map()
const subscribers = new Set<(map: Map<string, StoredFeedback>) => void>()

// Initialize from localStorage
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      const parsed: StoredFeedback[] = JSON.parse(stored)
      feedbackMap = new Map(parsed.map(f => [f.predictionId, f]))
    } catch {
      // Invalid JSON, use empty map
    }
  }
}

// Notify all subscribers
function notifySubscribers() {
  subscribers.forEach(fn => fn(feedbackMap))
}

// Persist to localStorage (with size limit)
function persistFeedback() {
  const entries = Array.from(feedbackMap.values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, MAX_FEEDBACK_ENTRIES)

  // Update map if we had to trim
  if (entries.length < feedbackMap.size) {
    feedbackMap = new Map(entries.map(f => [f.predictionId, f]))
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  window.dispatchEvent(new Event(FEEDBACK_CHANGED_EVENT))
}

/**
 * Hook to manage prediction feedback (thumbs up/down)
 */
export function usePredictionFeedback() {
  const [feedbackState, setFeedbackState] = useState<Map<string, StoredFeedback>>(feedbackMap)

  // Subscribe to shared state updates
  useEffect(() => {
    const handleUpdate = (newMap: Map<string, StoredFeedback>) => {
      setFeedbackState(new Map(newMap))
    }
    subscribers.add(handleUpdate)
    setFeedbackState(new Map(feedbackMap))

    return () => {
      subscribers.delete(handleUpdate)
    }
  }, [])

  // Listen for changes from other components/tabs
  useEffect(() => {
    const handleFeedbackChange = () => {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        try {
          const parsed: StoredFeedback[] = JSON.parse(stored)
          feedbackMap = new Map(parsed.map(f => [f.predictionId, f]))
          notifySubscribers()
        } catch {
          // Invalid JSON, ignore
        }
      }
    }

    window.addEventListener(FEEDBACK_CHANGED_EVENT, handleFeedbackChange)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) handleFeedbackChange()
    }
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener(FEEDBACK_CHANGED_EVENT, handleFeedbackChange)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  // Submit feedback for a prediction
  const submitFeedback = useCallback((
    predictionId: string,
    feedback: PredictionFeedback,
    predictionType: PredictionType,
    provider?: string
  ) => {
    const entry: StoredFeedback = {
      predictionId,
      feedback,
      timestamp: new Date().toISOString(),
      predictionType,
      provider,
    }
    feedbackMap.set(predictionId, entry)
    notifySubscribers()
    persistFeedback()

    // Also send to backend if available
    sendFeedbackToBackend(predictionId, feedback).catch(() => {
      // Backend unavailable, feedback is still stored locally
    })
  }, [])

  // Get feedback for a specific prediction
  const getFeedback = useCallback((predictionId: string): PredictionFeedback | null => {
    return feedbackState.get(predictionId)?.feedback ?? null
  }, [feedbackState])

  // Remove feedback for a prediction
  const removeFeedback = useCallback((predictionId: string) => {
    feedbackMap.delete(predictionId)
    notifySubscribers()
    persistFeedback()
  }, [])

  // Calculate stats
  const getStats = useCallback((): PredictionStats => {
    const entries = Array.from(feedbackState.values())
    const accurate = entries.filter(f => f.feedback === 'accurate').length
    const inaccurate = entries.filter(f => f.feedback === 'inaccurate').length
    const total = accurate + inaccurate

    // Stats by provider
    const byProvider: Record<string, { total: number; accurate: number; inaccurate: number; accuracyRate: number }> = {}
    entries.forEach(f => {
      const provider = f.provider || 'unknown'
      if (!byProvider[provider]) {
        byProvider[provider] = { total: 0, accurate: 0, inaccurate: 0, accuracyRate: 0 }
      }
      byProvider[provider].total++
      if (f.feedback === 'accurate') {
        byProvider[provider].accurate++
      } else {
        byProvider[provider].inaccurate++
      }
    })

    // Calculate accuracy rates
    Object.keys(byProvider).forEach(provider => {
      const p = byProvider[provider]
      p.accuracyRate = p.total > 0 ? p.accurate / p.total : 0
    })

    return {
      totalPredictions: total,
      accurateFeedback: accurate,
      inaccurateFeedback: inaccurate,
      accuracyRate: total > 0 ? accurate / total : 0,
      byProvider,
    }
  }, [feedbackState])

  // Clear all feedback
  const clearFeedback = useCallback(() => {
    feedbackMap.clear()
    notifySubscribers()
    persistFeedback()
  }, [])

  return {
    submitFeedback,
    getFeedback,
    removeFeedback,
    getStats,
    clearFeedback,
    feedbackCount: feedbackState.size,
  }
}

/**
 * Send feedback to backend
 */
async function sendFeedbackToBackend(predictionId: string, feedback: PredictionFeedback): Promise<void> {
  const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/predictions/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ predictionId, feedback }),
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
}

/**
 * Get feedback history for AI prompt context
 * Returns recent feedback to help AI improve predictions
 */
export function getFeedbackContext(): string {
  const entries = Array.from(feedbackMap.values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 50)

  if (entries.length === 0) {
    return 'No prediction feedback recorded yet.'
  }

  const accurate = entries.filter(f => f.feedback === 'accurate')
  const inaccurate = entries.filter(f => f.feedback === 'inaccurate')

  let context = `User feedback on past ${entries.length} predictions:\n`
  context += `- Accurate: ${accurate.length} (${((accurate.length / entries.length) * 100).toFixed(0)}%)\n`
  context += `- Inaccurate: ${inaccurate.length} (${((inaccurate.length / entries.length) * 100).toFixed(0)}%)\n`

  // Note which types were inaccurate more often
  const inaccurateByType = new Map<string, number>()
  inaccurate.forEach(f => {
    inaccurateByType.set(f.predictionType, (inaccurateByType.get(f.predictionType) || 0) + 1)
  })

  if (inaccurateByType.size > 0) {
    context += '\nTypes with higher inaccuracy:\n'
    Array.from(inaccurateByType.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        context += `- ${type}: ${count} inaccurate\n`
      })
  }

  return context
}
