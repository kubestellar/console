/**
 * LLM-d Benchmark Mock Data — Types.
 *
 * TypeScript interfaces mirroring the llm-d-benchmark v0.2 Benchmark Report
 * schema. Split out from benchmarkMockData.ts to keep each file focused.
 *
 * Schema reference: llm-d/llm-d-benchmark/benchmark_report/schema_v0_2.py
 */

// ---------------------------------------------------------------------------
// Core interfaces (simplified from Pydantic v0.2 schema)
// ---------------------------------------------------------------------------

export interface Statistics {
  units: string
  mean: number
  min?: number
  p0p1?: number
  p1?: number
  p5?: number
  p10?: number
  p25?: number
  p50?: number
  p75?: number
  p90?: number
  p95?: number
  p99?: number
  p99p9?: number
  max?: number
  stddev?: number
}

export interface Accelerator {
  model: string
  count: number
  memory?: number
  parallelism?: { dp: number; tp: number; pp: number; ep: number }
}

export interface StackComponent {
  metadata: { label: string; cfg_id: string; description?: string }
  standardized: {
    kind: string
    tool: string
    tool_version: string
    role?: 'prefill' | 'decode' | 'aggregate'
    replicas?: number
    model?: { name: string; quantization?: string }
    accelerator?: Accelerator
  }
}

export interface LoadConfig {
  metadata: { cfg_id: string; description?: string }
  standardized: {
    tool: string
    tool_version: string
    source: 'random' | 'sampled' | 'unknown'
    input_seq_len: { distribution: string; value: number }
    output_seq_len?: { distribution: string; value: number }
    rate_qps?: number
    concurrency?: number
  }
}

export interface LatencyStats {
  time_to_first_token?: Statistics
  time_per_output_token?: Statistics
  inter_token_latency?: Statistics
  normalized_time_per_output_token?: Statistics
  request_latency?: Statistics
}

export interface ThroughputStats {
  input_token_rate?: Statistics
  output_token_rate?: Statistics
  total_token_rate?: Statistics
  request_rate?: Statistics
}

export interface RequestStats {
  total: number
  failures: number
  incomplete?: number
  input_length?: Statistics
  output_length?: Statistics
}

export interface TimeSeriesPoint {
  ts: string
  value?: number
  mean?: number
  p50?: number
  p90?: number
  p95?: number
  p99?: number
}

export interface ObservabilityMetric {
  name: string
  metric_ref?: { id: string; version: number }
  component_id: string
  type: 'counter' | 'gauge' | 'histogram' | 'summary'
  unit: string
  description?: string
  labels?: Record<string, string>
  samples?: TimeSeriesPoint[]
}

export interface ComponentHealth {
  component_label: string
  total_restarts: number
  failed_replicas: number
  replica_health?: { replica_id: string; restarts: number; healthy: boolean }[]
}

export interface BenchmarkReport {
  version: string
  run: {
    uid: string
    eid: string
    cid?: string
    time: { start: string; end: string; duration: string }
    user: string
  }
  scenario: {
    stack: StackComponent[]
    load: LoadConfig
  }
  results: {
    request_performance: {
      aggregate: {
        requests: RequestStats
        latency: LatencyStats
        throughput: ThroughputStats
      }
      time_series?: {
        latency?: { time_to_first_token?: { units: string; series: TimeSeriesPoint[] } }
        throughput?: { output_token_rate?: { units: string; series: TimeSeriesPoint[] } }
      }
    }
    observability?: { metrics?: ObservabilityMetric[] }
    component_health?: ComponentHealth[]
  }
}

// ---------------------------------------------------------------------------
// Derived types for card consumption
// ---------------------------------------------------------------------------

export interface ParetoPoint {
  uid: string
  model: string
  hardware: string
  hardwareMemory: number
  gpuCount: number
  config: 'standalone' | 'scheduling' | 'disaggregated'
  framework: string
  seqLen: string
  throughputPerGpu: number
  ttftP50Ms: number
  tpotP50Ms: number
  p99LatencyMs: number
  requestRate: number
  powerPerGpuKw: number
  tcoPerGpuHr: number
}

export interface LeaderboardRow {
  rank: number
  hardware: string
  model: string
  config: 'standalone' | 'scheduling' | 'disaggregated'
  framework: string
  throughputPerGpu: number
  ttftP50Ms: number
  tpotP50Ms: number
  p99LatencyMs: number
  score: number
  llmdAdvantage: number | null
  report: BenchmarkReport
}

export interface TimelinePoint {
  date: string
  hardware: string
  model: string
  config: 'standalone' | 'llm-d' | 'disaggregated'
  ttftP50Ms: number
  tpotP50Ms: number
  outputThroughput: number
  p99LatencyMs: number
}
