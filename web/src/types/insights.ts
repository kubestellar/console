/**
 * Multi-Cluster Insight Types
 *
 * Types for the cross-cluster correlation engine that detects patterns
 * impossible to see in single-cluster dashboards.
 */

/** Insight source - heuristic (algorithmic) or AI (agent-enriched) */
export type InsightSource = 'heuristic' | 'ai'

/** Insight severity levels */
export type InsightSeverity = 'critical' | 'warning' | 'info'

/** Insight categories matching the 7 correlation card types */
export type InsightCategory =
  | 'event-correlation'
  | 'cluster-delta'
  | 'cascade-impact'
  | 'config-drift'
  | 'resource-imbalance'
  | 'restart-correlation'
  | 'rollout-tracker'

/** A single insight produced by the multi-cluster correlation engine */
export interface MultiClusterInsight {
  id: string
  category: InsightCategory
  source: InsightSource
  severity: InsightSeverity
  /** Confidence percentage 0-100, present only for AI-sourced insights */
  confidence?: number
  /** AI provider name (e.g. 'claude'), present only for AI-sourced insights */
  provider?: string
  title: string
  /** Heuristic: templated string; AI: natural language explanation */
  description: string
  /** AI-only: suggested remediation action */
  remediation?: string
  affectedClusters: string[]
  relatedResources?: string[]
  detectedAt: string
  /** For cascade insights: ordered chain of events across clusters */
  chain?: CascadeLink[]
  /** For delta insights: list of differences between clusters */
  deltas?: ClusterDelta[]
  /** For imbalance insights: metric name → per-cluster value */
  metrics?: Record<string, number>
}

/** A link in a cascading failure chain */
export interface CascadeLink {
  cluster: string
  resource: string
  event: string
  timestamp: string
  severity: InsightSeverity
}

/** A single delta between two clusters */
export interface ClusterDelta {
  dimension: string
  clusterA: { name: string; value: string | number }
  clusterB: { name: string; value: string | number }
  significance: 'high' | 'medium' | 'low'
}

/** Return type of the useMultiClusterInsights hook */
export interface UseMultiClusterInsightsResult {
  insights: MultiClusterInsight[]
  isLoading: boolean
  isDemoData: boolean
  insightsByCategory: Record<InsightCategory, MultiClusterInsight[]>
  topInsights: MultiClusterInsight[]
}

// ── AI Enrichment Types ──────────────────────────────────────────────────

/** AI enrichment for a single heuristic insight */
export interface AIInsightEnrichment {
  /** Matches the heuristic insight's id */
  insightId: string
  /** Natural-language explanation (replaces heuristic description) */
  description: string
  /** Root cause hypothesis */
  rootCause?: string
  /** Suggested remediation action */
  remediation: string
  /** AI confidence 0-100 */
  confidence: number
  /** AI provider name (e.g. 'claude', 'gpt-4') */
  provider: string
  /** AI may upgrade severity (higher severity wins) */
  severity?: InsightSeverity
}

/** Request payload for POST /insights/enrich */
export interface InsightEnrichmentRequest {
  insights: Array<{
    id: string
    category: InsightCategory
    title: string
    description: string
    severity: InsightSeverity
    affectedClusters: string[]
    chain?: CascadeLink[]
    deltas?: ClusterDelta[]
    metrics?: Record<string, number>
  }>
}

/** Response payload from POST /insights/enrich or WebSocket insights_enriched */
export interface InsightEnrichmentResponse {
  enrichments: AIInsightEnrichment[]
  timestamp: string
}
