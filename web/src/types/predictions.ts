/**
 * Prediction types for AI-powered and heuristic-based failure detection
 */

/** Prediction source - heuristic (threshold-based) or AI (ML-detected) */
export type PredictionSource = 'heuristic' | 'ai'

/** Prediction severity levels */
export type PredictionSeverity = 'warning' | 'critical'

/** Prediction types/categories */
export type PredictionType =
  | 'pod-crash'          // Pod restart patterns
  | 'node-pressure'      // Node under stress
  | 'gpu-exhaustion'     // GPU capacity at limit
  | 'resource-exhaustion'// CPU/memory pressure
  | 'resource-trend'     // AI: trending toward limits
  | 'capacity-risk'      // AI: failover capacity concerns
  | 'anomaly'            // AI: unusual pattern detected

/** Trend direction for predictions */
export type TrendDirection = 'worsening' | 'improving' | 'stable'

/** User feedback on prediction accuracy */
export type PredictionFeedback = 'accurate' | 'inaccurate'

/**
 * Represents a predicted risk/failure
 */
export interface PredictedRisk {
  /** Unique identifier for this prediction */
  id: string
  /** Type/category of prediction */
  type: PredictionType
  /** Severity level */
  severity: PredictionSeverity
  /** Name of affected resource (pod, node, cluster) */
  name: string
  /** Cluster name if applicable */
  cluster?: string
  /** Brief summary explanation (shown in list, max ~80 chars) */
  reason: string
  /** Detailed explanation with context and recommendations (shown on hover/expand) */
  reasonDetailed?: string
  /** Metric value if applicable (e.g., "85% CPU", "5 restarts") */
  metric?: string
  /** Source of prediction */
  source: PredictionSource
  /** AI confidence level (0-100), only for AI predictions */
  confidence?: number
  /** When this prediction was generated */
  generatedAt?: Date
  /** AI provider that generated this prediction (for multi-provider consensus) */
  provider?: string
  /** Trend direction based on historical data */
  trend?: TrendDirection
  /** Previous value for trend comparison */
  previousMetric?: string
}

/**
 * AI prediction as returned from the backend
 */
export interface AIPrediction {
  id: string
  category: PredictionType
  severity: PredictionSeverity
  name: string
  cluster: string
  reason: string
  reasonDetailed: string
  confidence: number
  generatedAt: string
  provider: string
  trend?: TrendDirection
}

/**
 * Response from GET /predictions/ai endpoint
 */
export interface AIPredictionsResponse {
  predictions: AIPrediction[]
  lastAnalyzed: string
  providers: string[]
  stale: boolean
}

/**
 * Response from POST /predictions/analyze endpoint
 */
export interface AnalyzeResponse {
  status: 'started' | 'already_running'
  estimatedTime?: string
}

/**
 * Response from GET /predictions/stats endpoint
 */
export interface PredictionStats {
  totalPredictions: number
  accurateFeedback: number
  inaccurateFeedback: number
  accuracyRate: number
  byProvider: Record<string, {
    total: number
    accurate: number
    inaccurate: number
    accuracyRate: number
  }>
}

/**
 * Feedback submission request
 */
export interface FeedbackRequest {
  predictionId: string
  feedback: PredictionFeedback
}

/**
 * Stored feedback record
 */
export interface StoredFeedback {
  predictionId: string
  feedback: PredictionFeedback
  timestamp: string
  predictionType: PredictionType
  provider?: string
}

/**
 * Metrics snapshot for historical trending
 */
export interface MetricsSnapshot {
  timestamp: string
  clusters: Array<{
    name: string
    cpuPercent: number
    memoryPercent: number
    nodeCount: number
    healthyNodes: number
  }>
  podIssues: Array<{
    name: string
    cluster: string
    restarts: number
    status: string
  }>
  gpuNodes: Array<{
    name: string
    cluster: string
    gpuAllocated: number
    gpuTotal: number
  }>
}

/**
 * Prediction settings stored in user profile (localStorage)
 */
export interface PredictionSettings {
  /** Enable/disable AI predictions */
  aiEnabled: boolean
  /** Minutes between AI analysis runs (5-30) */
  interval: number
  /** Minimum confidence threshold (50-90) */
  minConfidence: number
  /** Maximum predictions to show per analysis */
  maxPredictions: number
  /** Enable multi-provider consensus mode */
  consensusMode: boolean
  /** Threshold settings for heuristic predictions */
  thresholds: {
    /** Pod restart count to trigger warning */
    highRestartCount: number
    /** CPU percent to trigger warning */
    cpuPressure: number
    /** Memory percent to trigger warning */
    memoryPressure: number
    /** GPU allocation percent to trigger warning */
    gpuMemoryPressure: number
  }
}

/**
 * WebSocket message for AI predictions update
 */
export interface AIPredictionsUpdatedMessage {
  type: 'ai_predictions_updated'
  payload: {
    predictions: AIPrediction[]
    timestamp: string
    providers: string[]
  }
}

/**
 * WebSocket message for settings sync
 */
export interface PredictionSettingsMessage {
  type: 'prediction_settings'
  payload: PredictionSettings
}

/**
 * Default prediction settings
 */
export const DEFAULT_PREDICTION_SETTINGS: PredictionSettings = {
  aiEnabled: true,
  interval: 10,
  minConfidence: 60,
  maxPredictions: 10,
  consensusMode: false,
  thresholds: {
    highRestartCount: 3,
    cpuPressure: 80,
    memoryPressure: 85,
    gpuMemoryPressure: 90,
  },
}
