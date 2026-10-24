import type { AIPrediction, PredictedRisk } from '../types/predictions'

export const DEGRADED_RECONNECT_INTERVAL_MS = 60_000
export const FALLBACK_AI_RESOURCE_NAME = 'Unknown resource'
export const FALLBACK_AI_CLUSTER_NAME = 'unknown'
export const FALLBACK_AI_REASON = 'AI response unavailable'
export const STALE_AI_PREDICTIONS_TIMEOUT_MS = 45_000

export const POLL_INTERVAL_MS = 30_000 // Poll every 30 seconds as fallback

// Polling constants for analysis completion detection
export const ANALYSIS_POLL_INTERVAL_MS = 4_000  // Poll for results every 4 seconds after triggering analysis
export const ANALYSIS_MAX_TIMEOUT_MS = 60_000   // Give up waiting after 60 seconds

// Demo mode predictions
export const DEMO_AI_PREDICTIONS: AIPrediction[] = [
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

export function getRequestSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
}

export async function delayWithSignal(timeoutMs: number, signal?: AbortSignal): Promise<void> {
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

export function coercePredictionText(value: unknown, fallback: string): string {
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

export function sanitizeAIPrediction(prediction: AIPrediction): AIPrediction {
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

export function sanitizeAIPredictions(predictions: AIPrediction[]): AIPrediction[] {
  return predictions.map(sanitizeAIPrediction)
}

/**
 * Convert AI prediction from backend to PredictedRisk format
 */
export function aiPredictionToRisk(prediction: AIPrediction): PredictedRisk {
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
