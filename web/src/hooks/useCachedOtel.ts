/**
 * useCachedOtel — Cached hook for OpenTelemetry Collector status.
 *
 * Follows the mandatory caching contract defined in CLAUDE.md:
 * - useCache with fetcher + demoData
 * - isDemoFallback guarded so it's false during loading
 * - Standard CachedHookResult return shape
 *
 * Discovers OpenTelemetry Collector pods across connected clusters via the
 * MCP bridge. Pipeline composition (receivers / processors / exporters) is
 * parsed from the well-known `opentelemetry.io/*` annotations when set by
 * the OpenTelemetry Operator; otherwise we report an empty pipeline list
 * rather than fabricating live values. Telemetry counters come from the
 * same annotations and default to zero when unavailable.
 */

import { useCache, type RefreshCategory, type CachedHookResult } from '../lib/cache'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  OTEL_DEMO_DATA,
  type OtelCollector,
  type OtelCollectorState,
  type OtelPipeline,
  type OtelSignal,
  type OtelStatusData,
} from '../lib/demo/otel'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_OTEL = 'otel-status'

const INITIAL_DATA: OtelStatusData = {
  health: 'not-installed',
  collectors: [],
  summary: {
    totalCollectors: 0,
    runningCollectors: 0,
    degradedCollectors: 0,
    totalPipelines: 0,
    healthyPipelines: 0,
    uniqueReceivers: [],
    uniqueExporters: [],
    totalSpansAccepted: 0,
    totalSpansDropped: 0,
    totalMetricsAccepted: 0,
    totalMetricsDropped: 0,
    totalLogsAccepted: 0,
    totalLogsDropped: 0,
    totalExportErrors: 0,
  },
  lastCheckTime: new Date().toISOString(),
}

// OTel Operator-style annotations. When a collector is managed by the operator
// these annotations are set on the pod; otherwise they may be missing.
const ANNOT_PIPELINES = 'opentelemetry.io/pipelines'
const ANNOT_SPANS_ACCEPTED = 'opentelemetry.io/spans-accepted'
const ANNOT_SPANS_DROPPED = 'opentelemetry.io/spans-dropped'
const ANNOT_METRICS_ACCEPTED = 'opentelemetry.io/metrics-accepted'
const ANNOT_METRICS_DROPPED = 'opentelemetry.io/metrics-dropped'
const ANNOT_LOGS_ACCEPTED = 'opentelemetry.io/logs-accepted'
const ANNOT_LOGS_DROPPED = 'opentelemetry.io/logs-dropped'
const ANNOT_EXPORT_ERRORS = 'opentelemetry.io/export-errors'

const LABEL_MODE = 'app.kubernetes.io/component'
const DEFAULT_MODE = 'deployment'

// ---------------------------------------------------------------------------
// Internal types (shape of MCP custom-resource response)
// ---------------------------------------------------------------------------

interface PodItem {
  name: string
  namespace?: string
  cluster?: string
  status?: {
    phase?: string
    containerStatuses?: Array<{ name?: string; ready?: boolean; image?: string }>
  }
  metadata?: {
    labels?: Record<string, string>
    annotations?: Record<string, string>
  }
}

interface PodListResponse {
  items?: PodItem[]
}

// ---------------------------------------------------------------------------
// Helpers (pure, unit-testable)
// ---------------------------------------------------------------------------

function isOtelCollectorPod(pod: PodItem): boolean {
  const name = pod.name?.toLowerCase() || ''
  const labels = pod.metadata?.labels || {}
  if (labels['app.kubernetes.io/name'] === 'opentelemetry-collector') return true
  if (labels['app.kubernetes.io/part-of'] === 'opentelemetry') return true
  if (labels['app'] === 'opentelemetry-collector') return true
  return (
    name.includes('otel-collector') ||
    name.includes('opentelemetry-collector') ||
    name.startsWith('otel-agent') ||
    name.startsWith('otel-gateway')
  )
}

function parseIntOrZero(value: string | undefined): number {
  if (!value) return 0
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : 0
}

function deriveCollectorState(pod: PodItem): OtelCollectorState {
  const phase = pod.status?.phase
  if (phase === 'Running') {
    const containers = pod.status?.containerStatuses || []
    const allReady = containers.length > 0 && containers.every(c => c.ready === true)
    return allReady ? 'Running' : 'Degraded'
  }
  if (phase === 'Pending') return 'Pending'
  if (phase === 'Failed') return 'Failed'
  return 'Failed'
}

function parseVersion(pod: PodItem): string {
  const containers = pod.status?.containerStatuses || []
  const otelContainer = containers.find(c =>
    (c.name || '').toLowerCase().includes('otel') ||
    (c.name || '').toLowerCase().includes('opentelemetry'),
  )
  const image = otelContainer?.image || containers[0]?.image || ''
  if (!image) return ''
  const withoutDigest = image.split('@')[0]
  const colonIdx = withoutDigest.lastIndexOf(':')
  if (colonIdx < 0) return ''
  return withoutDigest.substring(colonIdx + 1)
}

/**
 * Parse the operator-set pipelines annotation. Two shapes are accepted:
 *   1. JSON array of {name,signal,receivers,processors,exporters,healthy}
 *   2. Comma-delimited "name:signal" tokens (no receiver/exporter detail)
 */
function parsePipelines(value: string | undefined): OtelPipeline[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.map(raw => normalizePipeline(raw))
    }
  } catch {
    // fall through to token parsing
  }
  const tokens = value.split(',').map(s => s.trim()).filter(Boolean)
  return tokens.map(tok => {
    const [rawName, rawSignal] = tok.split(':')
    const signal = normalizeSignal(rawSignal)
    return {
      name: rawName || signal,
      signal,
      receivers: [],
      processors: [],
      exporters: [],
      healthy: true,
    }
  })
}

function normalizePipeline(raw: unknown): OtelPipeline {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    name: typeof obj.name === 'string' ? obj.name : 'pipeline',
    signal: normalizeSignal(typeof obj.signal === 'string' ? obj.signal : undefined),
    receivers: toStringArray(obj.receivers),
    processors: toStringArray(obj.processors),
    exporters: toStringArray(obj.exporters),
    healthy: obj.healthy !== false,
  }
}

function normalizeSignal(value: string | undefined): OtelSignal {
  const lower = (value || '').toLowerCase()
  if (lower.startsWith('metric')) return 'metrics'
  if (lower.startsWith('log')) return 'logs'
  return 'traces'
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

function podToCollector(pod: PodItem): OtelCollector {
  const annotations = pod.metadata?.annotations || {}
  const labels = pod.metadata?.labels || {}
  const pipelines = parsePipelines(annotations[ANNOT_PIPELINES])
  return {
    name: pod.name,
    namespace: pod.namespace || 'default',
    cluster: pod.cluster || '',
    state: deriveCollectorState(pod),
    version: parseVersion(pod),
    mode: labels[LABEL_MODE] || DEFAULT_MODE,
    pipelines,
    spansAccepted: parseIntOrZero(annotations[ANNOT_SPANS_ACCEPTED]),
    spansDropped: parseIntOrZero(annotations[ANNOT_SPANS_DROPPED]),
    metricsAccepted: parseIntOrZero(annotations[ANNOT_METRICS_ACCEPTED]),
    metricsDropped: parseIntOrZero(annotations[ANNOT_METRICS_DROPPED]),
    logsAccepted: parseIntOrZero(annotations[ANNOT_LOGS_ACCEPTED]),
    logsDropped: parseIntOrZero(annotations[ANNOT_LOGS_DROPPED]),
    exportErrors: parseIntOrZero(annotations[ANNOT_EXPORT_ERRORS]),
  }
}

function summarize(collectors: OtelCollector[]): OtelStatusData['summary'] {
  let runningCollectors = 0
  let degradedCollectors = 0
  let totalPipelines = 0
  let healthyPipelines = 0
  const receivers = new Set<string>()
  const exporters = new Set<string>()
  let totalSpansAccepted = 0
  let totalSpansDropped = 0
  let totalMetricsAccepted = 0
  let totalMetricsDropped = 0
  let totalLogsAccepted = 0
  let totalLogsDropped = 0
  let totalExportErrors = 0

  for (const c of collectors) {
    if (c.state === 'Running') runningCollectors += 1
    else degradedCollectors += 1
    for (const pipeline of c.pipelines ?? []) {
      totalPipelines += 1
      if (pipeline.healthy) healthyPipelines += 1
      for (const r of pipeline.receivers ?? []) receivers.add(r)
      for (const e of pipeline.exporters ?? []) exporters.add(e)
    }
    totalSpansAccepted += c.spansAccepted
    totalSpansDropped += c.spansDropped
    totalMetricsAccepted += c.metricsAccepted
    totalMetricsDropped += c.metricsDropped
    totalLogsAccepted += c.logsAccepted
    totalLogsDropped += c.logsDropped
    totalExportErrors += c.exportErrors
  }

  return {
    totalCollectors: collectors.length,
    runningCollectors,
    degradedCollectors,
    totalPipelines,
    healthyPipelines,
    uniqueReceivers: Array.from(receivers).sort(),
    uniqueExporters: Array.from(exporters).sort(),
    totalSpansAccepted,
    totalSpansDropped,
    totalMetricsAccepted,
    totalMetricsDropped,
    totalLogsAccepted,
    totalLogsDropped,
    totalExportErrors,
  }
}

function buildStatus(collectors: OtelCollector[]): OtelStatusData {
  const summary = summarize(collectors)
  let health: OtelStatusData['health'] = 'healthy'
  if (summary.totalCollectors === 0) health = 'not-installed'
  else if (summary.degradedCollectors > 0 || summary.totalExportErrors > 0) {
    health = 'degraded'
  }
  return {
    health,
    collectors,
    summary,
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

/** HTTP statuses that indicate "endpoint not available" — treat as empty, not
 *  as a hard failure (#9933). */
const NOT_INSTALLED_STATUSES = new Set<number>([401, 403, 404, 501, 503])

async function fetchOtelStatus(): Promise<OtelStatusData> {
  const params = new URLSearchParams({
    group: '',
    version: 'v1',
    resource: 'pods',
  })

  const resp = await authFetch(`/api/mcp/custom-resources?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    if (NOT_INSTALLED_STATUSES.has(resp.status)) return buildStatus([])
    throw new Error(`HTTP ${resp.status}`)
  }

  // Defensive JSON parse — Netlify SPA fallback may return text/html (#9933)
  let body: PodListResponse
  try {
    body = (await resp.json()) as PodListResponse
  } catch {
    return buildStatus([])
  }
  const items = Array.isArray(body?.items) ? body.items : []
  const otelPods = items.filter(isOtelCollectorPod)
  const collectors = otelPods.map(podToCollector)
  return buildStatus(collectors)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCachedOtel(): CachedHookResult<OtelStatusData> {
  const result = useCache<OtelStatusData>({
    key: CACHE_KEY_OTEL,
    category: 'default' as RefreshCategory,
    initialData: INITIAL_DATA,
    demoData: OTEL_DEMO_DATA,
    persist: true,
    fetcher: fetchOtelStatus,
  })

  return {
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  isOtelCollectorPod,
  parseIntOrZero,
  deriveCollectorState,
  parseVersion,
  parsePipelines,
  normalizeSignal,
  podToCollector,
  summarize,
  buildStatus,
}
