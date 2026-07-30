/**
 * LLM-d Benchmark Mock Data — Generators.
 *
 * Constants, helpers, and generator functions that produce mock BenchmarkReport
 * data. Split out from benchmarkMockData.ts to keep each file focused.
 */

import type { BenchmarkReport, StackComponent, Statistics, TimelinePoint } from './benchmarkMockData.types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HARDWARE_CONFIGS: { model: string; memory: number; costPerHr: number; powerKw: number }[] = [
  { model: 'NVIDIA-H100-80GB-HBM3', memory: 80, costPerHr: 2.50, powerKw: 0.70 },
  { model: 'NVIDIA-A100-SXM4-80GB', memory: 80, costPerHr: 1.50, powerKw: 0.40 },
  { model: 'NVIDIA-L40S', memory: 48, costPerHr: 1.00, powerKw: 0.35 },
  { model: 'NVIDIA-H200-141GB', memory: 141, costPerHr: 3.80, powerKw: 0.70 },
]

/** Hardware specs lookup by model name (power and cost). */
export const HARDWARE_SPECS: Record<string, { powerKw: number; costPerHr: number }> = Object.fromEntries(
  HARDWARE_CONFIGS.map(hw => [hw.model, { powerKw: hw.powerKw, costPerHr: hw.costPerHr }])
)

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
        for (const seqLen of SEQ_LENS) {
          // Skip unrealistic combos: large models on small GPUs
          if (model.name.includes('70B') && hw.model.includes('L40S')) continue
          if (model.name.includes('R1') && !hw.model.includes('H100') && !hw.model.includes('H200')) continue

          reports.push(generateBenchmarkReport(hw, model, config, seqLen, dateStr, rand))
        }
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
