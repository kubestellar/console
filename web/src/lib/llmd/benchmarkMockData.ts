/**
 * LLM-d Benchmark Mock Data
 *
 * TypeScript interfaces and generators mirroring the llm-d-benchmark v0.2
 * Benchmark Report schema. Used for dashboard visualization when no live
 * backend is connected.
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HARDWARE_CONFIGS: { model: string; memory: number; costPerHr: number }[] = [
  { model: 'NVIDIA-H100-80GB-HBM3', memory: 80, costPerHr: 2.50 },
  { model: 'NVIDIA-A100-SXM4-80GB', memory: 80, costPerHr: 1.50 },
  { model: 'NVIDIA-L40S', memory: 48, costPerHr: 1.00 },
  { model: 'NVIDIA-H200-141GB', memory: 141, costPerHr: 3.80 },
]

const MODELS = [
  { name: 'meta-llama/Llama-3-70B-Instruct', short: 'Llama-3-70B' },
  { name: 'meta-llama/Llama-3.2-1B-Instruct', short: 'Llama-3.2-1B' },
  { name: 'Qwen/Qwen3-32B', short: 'Qwen3-32B' },
  { name: 'deepseek-ai/DeepSeek-R1-0528', short: 'DeepSeek-R1' },
]

const CONFIGS: ('standalone' | 'llm-d' | 'disaggregated')[] = ['standalone', 'llm-d', 'disaggregated']

const SEQ_LENS = [
  { label: '1k1k', isl: 1024, osl: 1024 },
  { label: '1k8k', isl: 1024, osl: 8192 },
  { label: '8k1k', isl: 8192, osl: 1024 },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let uidCounter = 0
function uid(): string {
  uidCounter++
  return `bench-${uidCounter.toString(16).padStart(8, '0')}`
}

function hash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(16).padStart(8, '0')
}

/** Seeded pseudo-random for reproducible mock data */
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

function makeStats(mean: number, units: string, spread = 0.25): Statistics {
  const s = spread * mean
  return {
    units,
    mean,
    min: Math.max(0, mean - s * 2),
    p10: Math.max(0, mean - s * 1.3),
    p25: Math.max(0, mean - s * 0.7),
    p50: mean,
    p75: mean + s * 0.7,
    p90: mean + s * 1.3,
    p95: mean + s * 1.6,
    p99: mean + s * 2.3,
    p99p9: mean + s * 3,
    max: mean + s * 3.5,
    stddev: s,
  }
}

// ---------------------------------------------------------------------------
// Performance model: given hardware + model + config, produce realistic metrics
// ---------------------------------------------------------------------------

interface PerfProfile {
  baseTtftMs: number
  baseTpotMs: number
  baseThroughputPerGpu: number
  baseRequestLatencyMs: number
}

function getPerfProfile(hwModel: string, modelName: string, config: string): PerfProfile {
  // Base performance varies by model size
  const modelSize = modelName.includes('70B') ? 70
    : modelName.includes('32B') ? 32
    : modelName.includes('R1') ? 671
    : 1

  // Hardware speed factor
  const hwFactor = hwModel.includes('H200') ? 1.4
    : hwModel.includes('H100') ? 1.0
    : hwModel.includes('A100') ? 0.65
    : hwModel.includes('L40S') ? 0.45
    : 1.0

  // Config improvement factors (llm-d advantage)
  const configTtftFactor = config === 'disaggregated' ? 0.45 : config === 'llm-d' ? 0.65 : 1.0
  const configThroughputFactor = config === 'disaggregated' ? 1.85 : config === 'llm-d' ? 1.55 : 1.0
  const configLatencyFactor = config === 'disaggregated' ? 0.5 : config === 'llm-d' ? 0.7 : 1.0

  // Scale by model size
  const sizeFactor = modelSize < 5 ? 0.1 : modelSize < 40 ? 0.5 : modelSize < 100 ? 1.0 : 2.5

  return {
    baseTtftMs: (250 * sizeFactor / hwFactor) * configTtftFactor,
    baseTpotMs: (15 * sizeFactor / hwFactor) * configTtftFactor,
    baseThroughputPerGpu: (800 / sizeFactor * hwFactor) * configThroughputFactor,
    baseRequestLatencyMs: (500 * sizeFactor / hwFactor) * configLatencyFactor,
  }
}

// ---------------------------------------------------------------------------
// Report generator
// ---------------------------------------------------------------------------

export function generateBenchmarkReport(
  hw: typeof HARDWARE_CONFIGS[number],
  model: typeof MODELS[number],
  config: typeof CONFIGS[number],
  seqLen: typeof SEQ_LENS[number],
  dateStr: string,
  rand: () => number,
): BenchmarkReport {
  const perf = getPerfProfile(hw.model, model.name, config)

  // Add some randomness
  const jitter = () => 0.9 + rand() * 0.2

  const ttft = perf.baseTtftMs * jitter()
  const tpot = perf.baseTpotMs * jitter()
  const throughput = perf.baseThroughputPerGpu * jitter()
  const latency = perf.baseRequestLatencyMs * jitter()
  const gpuCount = model.name.includes('70B') || model.name.includes('R1') ? 8 : model.name.includes('32B') ? 4 : 1

  const runUid = uid()

  const stack: StackComponent[] = [{
    metadata: { label: 'vllm-svc-0', cfg_id: hash(`${hw.model}-${model.name}-${config}`) },
    standardized: {
      kind: 'inference_engine',
      tool: config === 'standalone' ? 'vllm' : 'llm-d',
      tool_version: config === 'standalone' ? 'vllm/vllm-openai:v0.8.5' : 'ghcr.io/llm-d/llm-d-cuda:0.3.1',
      role: config === 'disaggregated' ? 'decode' : undefined,
      replicas: config === 'disaggregated' ? 2 : 1,
      model: { name: model.name, quantization: 'fp16' },
      accelerator: {
        model: hw.model,
        count: gpuCount,
        memory: hw.memory,
        parallelism: { dp: 1, tp: gpuCount, pp: 1, ep: 1 },
      },
    },
  }]

  if (config === 'disaggregated') {
    stack.push({
      metadata: { label: 'vllm-prefill-0', cfg_id: hash(`prefill-${hw.model}-${model.name}`) },
      standardized: {
        kind: 'inference_engine',
        tool: 'llm-d',
        tool_version: 'ghcr.io/llm-d/llm-d-cuda:0.3.1',
        role: 'prefill',
        replicas: 3,
        model: { name: model.name, quantization: 'fp16' },
        accelerator: { model: hw.model, count: gpuCount, memory: hw.memory, parallelism: { dp: 1, tp: gpuCount, pp: 1, ep: 1 } },
      },
    })
    stack.push({
      metadata: { label: 'epp-0', cfg_id: hash(`epp-${config}`) },
      standardized: {
        kind: 'generic',
        tool: 'llm-d-inference-scheduler',
        tool_version: 'ghcr.io/llm-d/llm-d-inference-scheduler:0.3.2',
      },
    })
  } else if (config === 'llm-d') {
    stack.push({
      metadata: { label: 'epp-0', cfg_id: hash(`epp-${config}`) },
      standardized: {
        kind: 'generic',
        tool: 'llm-d-inference-scheduler',
        tool_version: 'ghcr.io/llm-d/llm-d-inference-scheduler:0.3.2',
      },
    })
  }

  const totalRequests = 500 + Math.floor(rand() * 500)
  const failures = rand() < 0.9 ? 0 : Math.floor(rand() * 3)

  const gpuUtil = 40 + rand() * 45
  const gpuMemUtil = 60 + rand() * 30
  const gpuPower = 300 + rand() * 200

  return {
    version: '0.2',
    run: {
      uid: runUid,
      eid: hash(`exp-${dateStr}-${hw.model}`),
      time: {
        start: `${dateStr}T02:00:00Z`,
        end: `${dateStr}T02:17:00Z`,
        duration: 'PT1020S',
      },
      user: 'ci-nightly',
    },
    scenario: {
      stack,
      load: {
        metadata: { cfg_id: hash(`load-${seqLen.label}`) },
        standardized: {
          tool: 'inference-perf',
          tool_version: '0.3.0',
          source: 'sampled',
          input_seq_len: { distribution: 'fixed', value: seqLen.isl },
          output_seq_len: { distribution: 'gaussian', value: seqLen.osl },
          rate_qps: 10 + rand() * 20,
          concurrency: 32 + Math.floor(rand() * 96),
        },
      },
    },
    results: {
      request_performance: {
        aggregate: {
          requests: {
            total: totalRequests,
            failures,
            input_length: makeStats(seqLen.isl, 'count', 0.1),
            output_length: makeStats(seqLen.osl, 'count', 0.15),
          },
          latency: {
            time_to_first_token: makeStats(ttft / 1000, 's'),
            time_per_output_token: makeStats(tpot / 1000, 's/token'),
            inter_token_latency: makeStats(tpot * 1.05 / 1000, 's/token'),
            normalized_time_per_output_token: makeStats((ttft / seqLen.osl + tpot) / 1000, 's/token'),
            request_latency: makeStats(latency / 1000, 's'),
          },
          throughput: {
            output_token_rate: makeStats(throughput, 'tokens/s'),
            input_token_rate: makeStats(throughput * 0.8, 'tokens/s'),
            total_token_rate: makeStats(throughput * 1.8, 'tokens/s'),
            request_rate: makeStats(throughput / seqLen.osl, 'queries/s'),
          },
        },
      },
      observability: {
        metrics: [
          { name: `gpu_util.vllm-svc-0`, component_id: 'vllm-svc-0', type: 'gauge', unit: 'percent', labels: { gpu: '0' }, samples: [{ ts: `${dateStr}T02:05:00Z`, value: gpuUtil }] },
          { name: `gpu_mem.vllm-svc-0`, component_id: 'vllm-svc-0', type: 'gauge', unit: 'percent', labels: { gpu: '0' }, samples: [{ ts: `${dateStr}T02:05:00Z`, value: gpuMemUtil }] },
          { name: `gpu_power.vllm-svc-0`, component_id: 'vllm-svc-0', type: 'gauge', unit: 'Watts', labels: { gpu: '0' }, samples: [{ ts: `${dateStr}T02:05:00Z`, value: gpuPower }] },
        ],
      },
      component_health: stack.map(c => ({
        component_label: c.metadata.label,
        total_restarts: rand() < 0.85 ? 0 : Math.floor(rand() * 2),
        failed_replicas: 0,
      })),
    },
  }
}

// ---------------------------------------------------------------------------
// Public generators
// ---------------------------------------------------------------------------

/** Generate a set of benchmark reports across hardware × model × config. */
export function generateBenchmarkReports(): BenchmarkReport[] {
  const rand = seededRandom(42)
  const reports: BenchmarkReport[] = []
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10)

  for (const hw of HARDWARE_CONFIGS) {
    for (const model of MODELS) {
      for (const config of CONFIGS) {
        // Skip unrealistic combos: large models on small GPUs
        if (model.name.includes('70B') && hw.model.includes('L40S')) continue
        if (model.name.includes('R1') && !hw.model.includes('H100') && !hw.model.includes('H200')) continue

        reports.push(generateBenchmarkReport(hw, model, config, SEQ_LENS[0], dateStr, rand))
      }
    }
  }
  return reports
}

/** Generate 90 days of nightly reports for timeline visualization. */
export function generateTimelineReports(days = 90): TimelinePoint[] {
  const rand = seededRandom(123)
  const points: TimelinePoint[] = []
  const now = Date.now()

  // Pick a subset of configs to track over time
  const tracked = [
    { hw: HARDWARE_CONFIGS[0], model: MODELS[0], config: 'standalone' as const },
    { hw: HARDWARE_CONFIGS[0], model: MODELS[0], config: 'llm-d' as const },
    { hw: HARDWARE_CONFIGS[0], model: MODELS[0], config: 'disaggregated' as const },
    { hw: HARDWARE_CONFIGS[1], model: MODELS[0], config: 'llm-d' as const },
  ]

  for (let d = days; d >= 0; d--) {
    const date = new Date(now - d * 86400000)
    const dateStr = date.toISOString().slice(0, 10)

    // Simulate gradual improvement over time (llm-d gets better)
    const improvementFactor = 1 - (d / days) * 0.15 // 15% improvement over period

    for (const t of tracked) {
      const perf = getPerfProfile(t.hw.model, t.model.name, t.config)
      const cfgFactor = t.config === 'standalone' ? 1.0 : improvementFactor
      const jitter = () => 0.95 + rand() * 0.1

      points.push({
        date: dateStr,
        hardware: t.hw.model.replace('NVIDIA-', '').replace('-SXM4-80GB', '').replace('-80GB-HBM3', ''),
        model: t.model.short,
        config: t.config,
        ttftP50Ms: perf.baseTtftMs * cfgFactor * jitter(),
        tpotP50Ms: perf.baseTpotMs * cfgFactor * jitter(),
        outputThroughput: perf.baseThroughputPerGpu / cfgFactor * jitter(),
        p99LatencyMs: perf.baseRequestLatencyMs * 2.3 * cfgFactor * jitter(),
      })
    }
  }
  return points
}

/** Extract Pareto-plottable points from a set of reports. */
export function extractParetoPoints(reports: BenchmarkReport[]): ParetoPoint[] {
  return reports.map(r => {
    const engine = r.scenario.stack?.find(c => c.standardized?.kind === 'inference_engine')
    if (!engine) return null

    const agg = r.results?.request_performance?.aggregate
    if (!agg) return null

    const acc = engine.standardized.accelerator
    const gpuCount = acc?.count ?? 1
    const outputRate = agg.throughput?.output_token_rate?.mean ?? 0
    const ttft = (agg.latency?.time_to_first_token?.p50 ?? 0) * 1000
    const tpot = (agg.latency?.time_per_output_token?.p50 ?? 0) * 1000
    const p99 = (agg.latency?.request_latency?.p99 ?? 0) * 1000

    // Skip points with zero throughput (invalid data)
    if (outputRate === 0) return null

    // Classify config by stack roles, tool name, and experiment ID
    const roles = (r.scenario.stack ?? []).map(c => c.standardized?.role).filter(Boolean) as string[]
    const eid = r.run?.eid ?? ''
    const tool = engine.standardized.tool ?? ''
    const hasPrefill = roles.includes('prefill')
    const hasDecode = roles.includes('decode')
    const hasReplica = roles.includes('replica')

    let config: ParetoPoint['config'] = 'scheduling'
    if (hasReplica || eid.includes('standalone') || tool === 'vllm') {
      config = 'standalone'
    } else if ((hasPrefill && hasDecode) || eid.includes('modelservice')) {
      config = 'disaggregated'
    }

    const isl = r.scenario.load?.standardized?.input_seq_len?.value ?? 0
    const osl = r.scenario.load?.standardized?.output_seq_len?.value

    return {
      uid: r.run.uid,
      model: engine.standardized.model?.name ?? 'unknown',
      hardware: acc?.model ?? 'unknown',
      hardwareMemory: acc?.memory ?? 0,
      gpuCount,
      config,
      framework: tool,
      seqLen: `${isl}/${osl ?? '?'}`,
      throughputPerGpu: outputRate / gpuCount,
      ttftP50Ms: ttft,
      tpotP50Ms: tpot,
      p99LatencyMs: p99,
      requestRate: agg.throughput?.request_rate?.mean ?? 0,
    }
  }).filter((p): p is ParetoPoint => p !== null)
}

/** Compute Pareto-optimal frontier from a set of points (maximizing throughput, minimizing TTFT). */
export function computeParetoFrontier(points: ParetoPoint[]): ParetoPoint[] {
  // Sort by throughput ascending
  const sorted = [...points].sort((a, b) => a.throughputPerGpu - b.throughputPerGpu)
  const frontier: ParetoPoint[] = []
  let minTtft = Infinity

  // Sweep from highest throughput to lowest, keeping points with lower TTFT
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].ttftP50Ms < minTtft) {
      minTtft = sorted[i].ttftP50Ms
      frontier.push(sorted[i])
    }
  }
  return frontier.reverse()
}

/** Generate leaderboard rows from reports. */
export function generateLeaderboardRows(reports: BenchmarkReport[]): LeaderboardRow[] {
  const points = extractParetoPoints(reports)

  // Build uid→report lookup (extractParetoPoints filters nulls, so indices don't match)
  const reportByUid = new Map(reports.map(r => [r.run.uid, r]))

  // Compute composite score: normalize each metric to 0-100, weighted average
  const maxThroughput = Math.max(...points.map(p => p.throughputPerGpu), 1)
  const minTtft = Math.min(...points.map(p => p.ttftP50Ms), 1)
  const minP99 = Math.min(...points.map(p => p.p99LatencyMs), 1)

  const rows: LeaderboardRow[] = points.map((p) => {
    const throughputScore = (p.throughputPerGpu / maxThroughput) * 100
    const ttftScore = (minTtft / p.ttftP50Ms) * 100
    const p99Score = (minP99 / p.p99LatencyMs) * 100
    const score = throughputScore * 0.4 + ttftScore * 0.35 + p99Score * 0.25

    // Compute llm-d advantage vs standalone for same hardware + model
    let advantage: number | null = null
    if (p.config !== 'standalone') {
      const baseline = points.find(
        pp => pp.hardware === p.hardware && pp.model === p.model && pp.config === 'standalone'
      )
      if (baseline) {
        advantage = Math.round(((p.throughputPerGpu / baseline.throughputPerGpu) - 1) * 100)
      }
    }

    const hw = p.hardware.replace('NVIDIA-', '').replace('-SXM4-80GB', '').replace('-80GB-HBM3', '').replace('-141GB', '')

    return {
      rank: 0,
      hardware: hw,
      model: p.model.split('/').pop() ?? p.model,
      config: p.config,
      framework: p.framework,
      throughputPerGpu: Math.round(p.throughputPerGpu),
      ttftP50Ms: Math.round(p.ttftP50Ms * 100) / 100,
      tpotP50Ms: Math.round(p.tpotP50Ms * 100) / 100,
      p99LatencyMs: Math.round(p.p99LatencyMs),
      score: Math.round(score * 10) / 10,
      llmdAdvantage: advantage,
      report: reportByUid.get(p.uid) ?? reports[0],
    }
  })

  // Sort by score descending and assign ranks
  rows.sort((a, b) => b.score - a.score)
  rows.forEach((r, i) => { r.rank = i + 1 })

  return rows
}

/** Get hardware short name for display. */
export function getHardwareShort(model: string): string {
  return model.replace('NVIDIA-', '').replace('-SXM4-80GB', '').replace('-80GB-HBM3', '').replace('-141GB', '')
}

/** Get model short name for display. */
export function getModelShort(name: string): string {
  return name.split('/').pop() ?? name
}

/** Color palette for hardware types. */
export const HARDWARE_COLORS: Record<string, string> = {
  'H100': '#3b82f6',
  'H200': '#8b5cf6',
  'A100': '#f59e0b',
  'L40S': '#10b981',
}

/** Color palette for config types. */
export const CONFIG_COLORS: Record<string, string> = {
  'standalone': '#f59e0b',
  'scheduling': '#3b82f6',
  'disaggregated': '#10b981',
}
