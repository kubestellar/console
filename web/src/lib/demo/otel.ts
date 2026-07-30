/**
 * OpenTelemetry Status Card — Demo Data & Type Definitions
 *
 * Models OpenTelemetry (CNCF incubating) Collector instances per cluster:
 * configured receivers, processors, exporters, pipeline health, and
 * counters for dropped/exported telemetry items. Demo data is used when
 * OpenTelemetry is not installed or the user is in demo mode.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OtelCollectorState = 'Running' | 'Degraded' | 'Pending' | 'Failed'

export type OtelSignal = 'traces' | 'metrics' | 'logs'

export interface OtelPipeline {
  /** Pipeline name, e.g. "traces", "metrics/prometheus". */
  name: string
  signal: OtelSignal
  receivers: string[]
  processors: string[]
  exporters: string[]
  /** Whether the pipeline is currently operational on this collector. */
  healthy: boolean
}

export interface OtelCollector {
  /** Pod name of the collector. */
  name: string
  namespace: string
  cluster: string
  state: OtelCollectorState
  /** Image tag / collector version (e.g. 0.109.0). */
  version: string
  /** Mode label: daemonset, deployment, statefulset — surfaced via labels. */
  mode: string
  pipelines: OtelPipeline[]
  /** Spans accepted by receivers since start. */
  spansAccepted: number
  /** Spans dropped (refused + exporter failures). */
  spansDropped: number
  /** Metric points accepted. */
  metricsAccepted: number
  /** Metric points dropped. */
  metricsDropped: number
  /** Log records accepted. */
  logsAccepted: number
  /** Log records dropped. */
  logsDropped: number
  /** Number of exporter send failures recorded by the collector. */
  exportErrors: number
}

export interface OtelSummary {
  totalCollectors: number
  runningCollectors: number
  degradedCollectors: number
  totalPipelines: number
  healthyPipelines: number
  /** Unique receiver types seen across all collectors. */
  uniqueReceivers: string[]
  /** Unique exporter types seen across all collectors. */
  uniqueExporters: string[]
  totalSpansAccepted: number
  totalSpansDropped: number
  totalMetricsAccepted: number
  totalMetricsDropped: number
  totalLogsAccepted: number
  totalLogsDropped: number
  totalExportErrors: number
}

export interface OtelStatusData {
  health: 'healthy' | 'degraded' | 'not-installed'
  collectors: OtelCollector[]
  summary: OtelSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo data — shown when OTel is not installed or in demo mode
// ---------------------------------------------------------------------------

// Named constants (no magic numbers)
const DEMO_SPANS_GATEWAY = 1_840_210
const DEMO_SPANS_DROPPED_GATEWAY = 42
const DEMO_METRICS_GATEWAY = 6_120_880
const DEMO_METRICS_DROPPED_GATEWAY = 0
const DEMO_LOGS_GATEWAY = 980_455
const DEMO_LOGS_DROPPED_GATEWAY = 18
const DEMO_EXPORT_ERRORS_GATEWAY = 3

const DEMO_SPANS_AGENT = 612_040
const DEMO_SPANS_DROPPED_AGENT = 0
const DEMO_METRICS_AGENT = 2_405_118
const DEMO_METRICS_DROPPED_AGENT = 0
const DEMO_LOGS_AGENT = 110_904
const DEMO_LOGS_DROPPED_AGENT = 0
const DEMO_EXPORT_ERRORS_AGENT = 0

const DEMO_SPANS_AGENT2 = 0
const DEMO_METRICS_AGENT2 = 0
const DEMO_LOGS_AGENT2 = 0

const DEMO_COLLECTORS: OtelCollector[] = [
  {
    name: 'otel-gateway-0',
    namespace: 'observability',
    cluster: 'prod-east',
    state: 'Running',
    version: '0.109.0',
    mode: 'statefulset',
    pipelines: [
      {
        name: 'traces',
        signal: 'traces',
        receivers: ['otlp', 'jaeger'],
        processors: ['batch', 'memory_limiter', 'k8sattributes'],
        exporters: ['otlphttp/tempo'],
        healthy: true,
      },
      {
        name: 'metrics',
        signal: 'metrics',
        receivers: ['otlp', 'hostmetrics'],
        processors: ['batch', 'memory_limiter'],
        exporters: ['prometheusremotewrite/mimir'],
        healthy: true,
      },
      {
        name: 'logs',
        signal: 'logs',
        receivers: ['otlp'],
        processors: ['batch', 'memory_limiter', 'k8sattributes'],
        exporters: ['otlphttp/loki'],
        healthy: true,
      },
    ],
    spansAccepted: DEMO_SPANS_GATEWAY,
    spansDropped: DEMO_SPANS_DROPPED_GATEWAY,
    metricsAccepted: DEMO_METRICS_GATEWAY,
    metricsDropped: DEMO_METRICS_DROPPED_GATEWAY,
    logsAccepted: DEMO_LOGS_GATEWAY,
    logsDropped: DEMO_LOGS_DROPPED_GATEWAY,
    exportErrors: DEMO_EXPORT_ERRORS_GATEWAY,
  },
  {
    name: 'otel-agent-node01',
    namespace: 'observability',
    cluster: 'prod-east',
    state: 'Running',
    version: '0.109.0',
    mode: 'daemonset',
    pipelines: [
      {
        name: 'traces',
        signal: 'traces',
        receivers: ['otlp'],
        processors: ['batch', 'k8sattributes'],
        exporters: ['otlp/gateway'],
        healthy: true,
      },
      {
        name: 'metrics/host',
        signal: 'metrics',
        receivers: ['hostmetrics', 'kubeletstats'],
        processors: ['batch'],
        exporters: ['otlp/gateway'],
        healthy: true,
      },
    ],
    spansAccepted: DEMO_SPANS_AGENT,
    spansDropped: DEMO_SPANS_DROPPED_AGENT,
    metricsAccepted: DEMO_METRICS_AGENT,
    metricsDropped: DEMO_METRICS_DROPPED_AGENT,
    logsAccepted: DEMO_LOGS_AGENT,
    logsDropped: DEMO_LOGS_DROPPED_AGENT,
    exportErrors: DEMO_EXPORT_ERRORS_AGENT,
  },
  {
    name: 'otel-agent-node02',
    namespace: 'observability',
    cluster: 'prod-west',
    state: 'Degraded',
    version: '0.108.1',
    mode: 'daemonset',
    pipelines: [
      {
        name: 'traces',
        signal: 'traces',
        receivers: ['otlp'],
        processors: ['batch'],
        exporters: ['otlp/gateway'],
        healthy: false,
      },
      {
        name: 'metrics/host',
        signal: 'metrics',
        receivers: ['hostmetrics'],
        processors: ['batch'],
        exporters: ['otlp/gateway'],
        healthy: true,
      },
    ],
    spansAccepted: DEMO_SPANS_AGENT2,
    spansDropped: 128,
    metricsAccepted: DEMO_METRICS_AGENT2,
    metricsDropped: 0,
    logsAccepted: DEMO_LOGS_AGENT2,
    logsDropped: 0,
    exportErrors: 12,
  },
]

function uniq(values: string[]): string[] {
  return Array.from(new Set(values))
}

const DEMO_ALL_RECEIVERS = uniq(
  DEMO_COLLECTORS.flatMap(c => c.pipelines.flatMap(p => p.receivers)),
)
const DEMO_ALL_EXPORTERS = uniq(
  DEMO_COLLECTORS.flatMap(c => c.pipelines.flatMap(p => p.exporters)),
)
const DEMO_TOTAL_PIPELINES = DEMO_COLLECTORS.reduce((a, c) => a + c.pipelines.length, 0)
const DEMO_HEALTHY_PIPELINES = DEMO_COLLECTORS.reduce(
  (a, c) => a + c.pipelines.filter(p => p.healthy).length,
  0,
)
const DEMO_RUNNING = DEMO_COLLECTORS.filter(c => c.state === 'Running').length
const DEMO_DEGRADED = DEMO_COLLECTORS.filter(c => c.state !== 'Running').length

export const OTEL_DEMO_DATA: OtelStatusData = {
  health: 'degraded',
  collectors: DEMO_COLLECTORS,
  summary: {
    totalCollectors: DEMO_COLLECTORS.length,
    runningCollectors: DEMO_RUNNING,
    degradedCollectors: DEMO_DEGRADED,
    totalPipelines: DEMO_TOTAL_PIPELINES,
    healthyPipelines: DEMO_HEALTHY_PIPELINES,
    uniqueReceivers: DEMO_ALL_RECEIVERS,
    uniqueExporters: DEMO_ALL_EXPORTERS,
    totalSpansAccepted: DEMO_COLLECTORS.reduce((a, c) => a + c.spansAccepted, 0),
    totalSpansDropped: DEMO_COLLECTORS.reduce((a, c) => a + c.spansDropped, 0),
    totalMetricsAccepted: DEMO_COLLECTORS.reduce((a, c) => a + c.metricsAccepted, 0),
    totalMetricsDropped: DEMO_COLLECTORS.reduce((a, c) => a + c.metricsDropped, 0),
    totalLogsAccepted: DEMO_COLLECTORS.reduce((a, c) => a + c.logsAccepted, 0),
    totalLogsDropped: DEMO_COLLECTORS.reduce((a, c) => a + c.logsDropped, 0),
    totalExportErrors: DEMO_COLLECTORS.reduce((a, c) => a + c.exportErrors, 0),
  },
  lastCheckTime: new Date().toISOString(),
}
