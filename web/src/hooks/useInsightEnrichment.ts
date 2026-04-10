/**
 * AI enrichment hook for multi-cluster insights.
 *
 * Follows the useAIPredictions.ts singleton pattern:
 * - Module-level state shared across all hook instances
 * - Debounced POST to agent /insights/enrich endpoint
 * - WebSocket listener for real-time enrichments
 * - Graceful degradation: agent disconnect = heuristic-only, no error UI
 * - Cache with TTL to avoid re-enriching unchanged insights
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  MultiClusterInsight,
  AIInsightEnrichment,
  InsightEnrichmentRequest,
  InsightEnrichmentResponse,
} from '../types/insights'
import { isAgentConnected, isAgentUnavailable } from './useLocalAgent'
import { LOCAL_AGENT_HTTP_URL, LOCAL_AGENT_WS_URL } from '../lib/constants'

/** Debounce before sending enrichment request (2 seconds) */
const ENRICHMENT_DEBOUNCE_MS = 2_000

/** Timeout for enrichment HTTP request (15 seconds) */
const ENRICHMENT_TIMEOUT_MS = 15_000

/** Cache TTL for enrichments (5 minutes) */
const ENRICHMENT_CACHE_TTL_MS = 5 * 60_000

/** Base WebSocket reconnect delay (5 seconds) */
const WS_BASE_RECONNECT_DELAY_MS = 5_000
/** Maximum WebSocket reconnect delay (2 minutes) */
const WS_MAX_RECONNECT_DELAY_MS = 2 * 60_000
/** Maximum WebSocket reconnect attempts before giving up */
const MAX_WS_RECONNECT_ATTEMPTS = 5

// ── Singleton state ──────────────────────────────────────────────────────

const enrichments: Map<string, AIInsightEnrichment> = new Map()
let lastEnrichmentTime = 0
let lastRequestHash = ''
let wsConnection: WebSocket | null = null
let wsReconnectAttempts = 0
/** Tracked reconnect timer handle (#6205). Previously the reconnect
 * `setTimeout` inside `onclose` discarded its handle, so the cleanup path
 * could never cancel a pending reconnect — when the last subscriber
 * unmounted, the reconnect loop kept firing into the void. */
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
/** Set to false after receiving 404 — endpoint doesn't exist */
let enrichmentEndpointAvailable = true
const subscribers = new Set<() => void>()

function notifySubscribers() {
  subscribers.forEach(fn => fn())
}

/** Hash insight IDs + descriptions to detect changes */
function hashInsights(insights: MultiClusterInsight[]): string {
  return insights
    .map(i => `${i.id}:${i.severity}:${i.affectedClusters.length}`)
    .sort()
    .join('|')
}

/** Check if enrichment cache is still valid */
function isCacheValid(): boolean {
  return Date.now() - lastEnrichmentTime < ENRICHMENT_CACHE_TTL_MS && enrichments.size > 0
}

/** Request AI enrichment from agent */
async function requestEnrichment(insights: MultiClusterInsight[]): Promise<void> {
  if (!isAgentConnected() || isAgentUnavailable()) return
  if (!enrichmentEndpointAvailable) return
  if (insights.length === 0) return

  const hash = hashInsights(insights)
  if (hash === lastRequestHash && isCacheValid()) return

  lastRequestHash = hash

  const payload: InsightEnrichmentRequest = {
    insights: insights.map(i => ({
      id: i.id,
      category: i.category,
      title: i.title,
      description: i.description,
      severity: i.severity,
      affectedClusters: i.affectedClusters,
      chain: i.chain,
      deltas: i.deltas,
      metrics: i.metrics,
    })),
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ENRICHMENT_TIMEOUT_MS)

    const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/insights/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (response.ok) {
      const data = (await response.json()) as InsightEnrichmentResponse
      applyEnrichments(data.enrichments)
    } else if (response.status === 404) {
      // Endpoint not implemented — stop retrying until next page load
      enrichmentEndpointAvailable = false
    }
  } catch {
    // Silently fail — heuristic insights remain unchanged
  }
}

/** Apply enrichments to the cache */
function applyEnrichments(newEnrichments: AIInsightEnrichment[]): void {
  let changed = false
  for (const e of (newEnrichments || [])) {
    enrichments.set(e.insightId, e)
    changed = true
  }
  if (changed) {
    lastEnrichmentTime = Date.now()
    notifySubscribers()
  }
}

/** Connect WebSocket for real-time enrichments */
function connectWebSocket(): void {
  if (wsConnection) return
  if (!isAgentConnected() || isAgentUnavailable()) return
  if (wsReconnectAttempts >= MAX_WS_RECONNECT_ATTEMPTS) return

  try {
    // LOCAL_AGENT_WS_URL already includes /ws — don't append it again
    wsConnection = new WebSocket(LOCAL_AGENT_WS_URL)

    wsConnection.onopen = () => {
      // Reset backoff on successful connection
      wsReconnectAttempts = 0
    }

    wsConnection.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'insights_enriched' && msg.data?.enrichments) {
          applyEnrichments(msg.data.enrichments)
        }
      } catch {
        // Ignore parse errors
      }
    }

    wsConnection.onclose = () => {
      wsConnection = null
      wsReconnectAttempts++
      if (wsReconnectAttempts >= MAX_WS_RECONNECT_ATTEMPTS) return
      if (!isAgentConnected() || isAgentUnavailable()) return
      // Don't schedule a reconnect if every subscriber has unmounted —
      // the loop would keep firing forever otherwise (#6205).
      if (subscribers.size === 0) return

      // Exponential backoff: 5s, 10s, 20s, 40s, 80s (capped at 2 min)
      const delay = Math.min(
        WS_BASE_RECONNECT_DELAY_MS * Math.pow(2, wsReconnectAttempts - 1),
        WS_MAX_RECONNECT_DELAY_MS,
      )
      // #6205: store the handle so the cleanup path can cancel a pending
      // reconnect. The previous version discarded this so the loop kept
      // firing after the last subscriber unmounted.
      wsReconnectTimer = setTimeout(() => {
        wsReconnectTimer = null
        connectWebSocket()
      }, delay)
    }

    wsConnection.onerror = () => {
      wsConnection?.close()
      wsConnection = null
    }
  } catch {
    wsConnection = null
  }
}

/** Tear down the singleton WebSocket and any pending reconnect (#6204, #6205).
 * Called when the last subscriber unmounts. Mirrors the `stopSingleton()`
 * pattern used by useAIPredictions. */
function disconnectWebSocket(): void {
  if (wsReconnectTimer !== null) {
    clearTimeout(wsReconnectTimer)
    wsReconnectTimer = null
  }
  if (wsConnection) {
    // Drop event handlers BEFORE closing so the close handler doesn't
    // fire and immediately schedule another reconnect.
    wsConnection.onopen = null
    wsConnection.onmessage = null
    wsConnection.onclose = null
    wsConnection.onerror = null
    try { wsConnection.close() } catch { /* ignore */ }
    wsConnection = null
  }
  // Reset backoff so the next mount starts fresh.
  wsReconnectAttempts = 0
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Merge AI enrichments into heuristic insights.
 *
 * For each heuristic insight, if an AI enrichment exists:
 * - Replace description with AI description
 * - Add remediation
 * - Set source to 'ai', add confidence + provider
 * - Use higher severity (AI may upgrade)
 */
export function mergeEnrichments(insights: MultiClusterInsight[]): MultiClusterInsight[] {
  if (enrichments.size === 0) return insights

  return insights.map(insight => {
    const enrichment = enrichments.get(insight.id)
    if (!enrichment) return insight

    // Determine winning severity (AI can upgrade, never downgrade)
    const severityRank = { info: 0, warning: 1, critical: 2 }
    const heuristicRank = severityRank[insight.severity]
    const aiRank = enrichment.severity ? severityRank[enrichment.severity] : heuristicRank
    const winningSeverity = aiRank >= heuristicRank
      ? (enrichment.severity || insight.severity)
      : insight.severity

    return {
      ...insight,
      source: 'ai' as const,
      description: enrichment.description,
      remediation: enrichment.remediation || insight.remediation,
      confidence: enrichment.confidence,
      provider: enrichment.provider,
      severity: winningSeverity,
    }
  })
}

// ── React hook ───────────────────────────────────────────────────────────

/**
 * Hook to enrich heuristic insights with AI analysis.
 *
 * Pass in heuristic insights — the hook will:
 * 1. Check if agent is connected
 * 2. Debounce and POST to /insights/enrich
 * 3. Listen for WebSocket updates
 * 4. Return enriched insights via mergeEnrichments()
 *
 * If agent is not connected, returns insights unchanged.
 */
export function useInsightEnrichment(heuristicInsights: MultiClusterInsight[]): {
  enrichedInsights: MultiClusterInsight[]
  hasEnrichments: boolean
  enrichmentCount: number
} {
  const [, forceUpdate] = useState(0)
  const insightsRef = useRef(heuristicInsights)
  insightsRef.current = heuristicInsights

  // Subscribe to enrichment changes. When the last subscriber unmounts,
  // tear down the singleton WebSocket and cancel any pending reconnect
  // (#6204, #6205) — without this, the singleton stays open forever and
  // the reconnect loop keeps firing into the void.
  useEffect(() => {
    const subscriber = () => forceUpdate(n => n + 1)
    subscribers.add(subscriber)
    return () => {
      subscribers.delete(subscriber)
      if (subscribers.size === 0) {
        disconnectWebSocket()
      }
    }
  }, [])

  // Connect WebSocket on mount. The teardown lives in the subscribers
  // useEffect above so we don't double-disconnect when multiple consumers
  // share the singleton — it only disconnects when subscribers.size === 0.
  useEffect(() => {
    connectWebSocket()
  }, [])

  // Debounced enrichment request when insights change
  const requestRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerEnrichment = useCallback(() => {
    if (requestRef.current) clearTimeout(requestRef.current)
    requestRef.current = setTimeout(() => {
      requestEnrichment(insightsRef.current)
    }, ENRICHMENT_DEBOUNCE_MS)
  }, [])

  // Stabilize with a length-based key to avoid re-firing on every new array reference
  const insightsKey = heuristicInsights.length
  useEffect(() => {
    if (insightsKey > 0) {
      triggerEnrichment()
    }
    return () => {
      if (requestRef.current) clearTimeout(requestRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insightsKey, triggerEnrichment])

  const enrichedInsights = mergeEnrichments(heuristicInsights)
  const enrichmentCount = enrichments.size

  return {
    enrichedInsights,
    hasEnrichments: enrichmentCount > 0,
    enrichmentCount,
  }
}
