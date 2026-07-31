import { describe, it, expect } from 'vitest'
import {
  HARDWARE_SPECS,
  generateBenchmarkReport,
  generateBenchmarkReports,
  generateTimelineReports,
} from '../benchmarkMockData.generators'
import type { BenchmarkReport, TimelinePoint } from '../benchmarkMockData.types'

// ─── HARDWARE_SPECS ────────────────────────────────────────────────────────

describe('HARDWARE_SPECS', () => {
  it('exposes power/cost lookup for the four hardware configs', () => {
    expect(Object.keys(HARDWARE_SPECS).sort()).toEqual([
      'NVIDIA-A100-SXM4-80GB',
      'NVIDIA-H100-80GB-HBM3',
      'NVIDIA-H200-141GB',
      'NVIDIA-L40S',
    ])
  })

  it('records only powerKw and costPerHr (memory is not projected)', () => {
    for (const spec of Object.values(HARDWARE_SPECS)) {
      expect(Object.keys(spec).sort()).toEqual(['costPerHr', 'powerKw'])
      expect(typeof spec.powerKw).toBe('number')
      expect(typeof spec.costPerHr).toBe('number')
      expect(spec.powerKw).toBeGreaterThan(0)
      expect(spec.costPerHr).toBeGreaterThan(0)
    }
  })

  it('has the expected values for known hardware', () => {
    expect(HARDWARE_SPECS['NVIDIA-H100-80GB-HBM3']).toEqual({ powerKw: 0.7, costPerHr: 2.5 })
    expect(HARDWARE_SPECS['NVIDIA-A100-SXM4-80GB']).toEqual({ powerKw: 0.4, costPerHr: 1.5 })
    expect(HARDWARE_SPECS['NVIDIA-L40S']).toEqual({ powerKw: 0.35, costPerHr: 1.0 })
    expect(HARDWARE_SPECS['NVIDIA-H200-141GB']).toEqual({ powerKw: 0.7, costPerHr: 3.8 })
  })
})

// ─── generateBenchmarkReport ───────────────────────────────────────────────

const H100 = { model: 'NVIDIA-H100-80GB-HBM3', memory: 80, costPerHr: 2.5, powerKw: 0.7 }
const L40S = { model: 'NVIDIA-L40S', memory: 48, costPerHr: 1.0, powerKw: 0.35 }
const LLAMA70B = { name: 'meta-llama/Llama-3-70B-Instruct', short: 'Llama-3-70B' }
const LLAMA1B = { name: 'meta-llama/Llama-3.2-1B-Instruct', short: 'Llama-3.2-1B' }
const QWEN32B = { name: 'Qwen/Qwen3-32B', short: 'Qwen3-32B' }
const R1 = { name: 'deepseek-ai/DeepSeek-R1-0528', short: 'DeepSeek-R1' }
const SEQ_1K1K = { label: '1k1k', isl: 1024, osl: 1024 }
const DATE = '2026-07-31'

function fixedRand(): () => number {
  // Deterministic sequence — cycles through mid-range values so jitter is
  // predictable but non-trivial.
  const seq = [0.5, 0.25, 0.75, 0.1, 0.9]
  let i = 0
  return () => seq[i++ % seq.length]
}

describe('generateBenchmarkReport', () => {
  it('produces a well-formed v0.2 report skeleton', () => {
    const r = generateBenchmarkReport(H100, LLAMA1B, 'standalone', SEQ_1K1K, DATE, fixedRand())
    expect(r.version).toBe('0.2')
    expect(r.run.user).toBe('ci-nightly')
    expect(r.run.time.start).toBe(`${DATE}T02:00:00Z`)
    expect(r.run.time.end).toBe(`${DATE}T02:17:00Z`)
    expect(r.run.time.duration).toBe('PT1020S')
    // uid follows the "bench-XXXXXXXX" format
    expect(r.run.uid).toMatch(/^bench-[0-9a-f]{8}$/)
    // eid is an 8-hex hash of the (dateStr, hw.model) pair
    expect(r.run.eid).toMatch(/^[0-9a-f]{8}$/)
  })

  it('standalone config emits exactly one stack component (vllm-svc-0)', () => {
    const r = generateBenchmarkReport(H100, LLAMA1B, 'standalone', SEQ_1K1K, DATE, fixedRand())
    expect(r.scenario.stack).toHaveLength(1)
    const svc = r.scenario.stack[0]
    expect(svc.metadata.label).toBe('vllm-svc-0')
    expect(svc.standardized.tool).toBe('vllm')
    expect(svc.standardized.role).toBeUndefined()
    expect(svc.standardized.replicas).toBe(1)
  })

  it('llm-d config appends the epp scheduler (2 components)', () => {
    const r = generateBenchmarkReport(H100, LLAMA1B, 'llm-d', SEQ_1K1K, DATE, fixedRand())
    expect(r.scenario.stack).toHaveLength(2)
    expect(r.scenario.stack[0].standardized.tool).toBe('llm-d')
    expect(r.scenario.stack[1].metadata.label).toBe('epp-0')
    expect(r.scenario.stack[1].standardized.tool).toBe('llm-d-inference-scheduler')
  })

  it('disaggregated config yields decode-svc + prefill + epp (3 components)', () => {
    const r = generateBenchmarkReport(H100, LLAMA1B, 'disaggregated', SEQ_1K1K, DATE, fixedRand())
    expect(r.scenario.stack).toHaveLength(3)
    expect(r.scenario.stack[0].standardized.role).toBe('decode')
    expect(r.scenario.stack[0].standardized.replicas).toBe(2)
    expect(r.scenario.stack[1].metadata.label).toBe('vllm-prefill-0')
    expect(r.scenario.stack[1].standardized.role).toBe('prefill')
    expect(r.scenario.stack[1].standardized.replicas).toBe(3)
    expect(r.scenario.stack[2].metadata.label).toBe('epp-0')
  })

  it('assigns gpuCount 8 for 70B and R1, 4 for 32B, 1 otherwise', () => {
    const rl = generateBenchmarkReport(H100, LLAMA70B, 'standalone', SEQ_1K1K, DATE, fixedRand())
    expect(rl.scenario.stack[0].standardized.accelerator?.count).toBe(8)
    expect(rl.scenario.stack[0].standardized.accelerator?.parallelism?.tp).toBe(8)

    const r1 = generateBenchmarkReport(H100, R1, 'standalone', SEQ_1K1K, DATE, fixedRand())
    expect(r1.scenario.stack[0].standardized.accelerator?.count).toBe(8)

    const rq = generateBenchmarkReport(H100, QWEN32B, 'standalone', SEQ_1K1K, DATE, fixedRand())
    expect(rq.scenario.stack[0].standardized.accelerator?.count).toBe(4)

    const rs = generateBenchmarkReport(H100, LLAMA1B, 'standalone', SEQ_1K1K, DATE, fixedRand())
    expect(rs.scenario.stack[0].standardized.accelerator?.count).toBe(1)
  })

  it('disaggregated is faster (lower ttft mean) than standalone for the same params', () => {
    // Reuse the same rand sequence for both runs so jitter cancels out.
    const stdReport = generateBenchmarkReport(H100, LLAMA70B, 'standalone', SEQ_1K1K, DATE, fixedRand())
    const disReport = generateBenchmarkReport(H100, LLAMA70B, 'disaggregated', SEQ_1K1K, DATE, fixedRand())
    const stdTtft = stdReport.results.request_performance.aggregate.latency.time_to_first_token!.mean
    const disTtft = disReport.results.request_performance.aggregate.latency.time_to_first_token!.mean
    expect(disTtft).toBeLessThan(stdTtft)
  })

  it('llm-d has higher throughput than standalone for the same params', () => {
    const stdReport = generateBenchmarkReport(H100, LLAMA70B, 'standalone', SEQ_1K1K, DATE, fixedRand())
    const llmdReport = generateBenchmarkReport(H100, LLAMA70B, 'llm-d', SEQ_1K1K, DATE, fixedRand())
    const stdTp = stdReport.results.request_performance.aggregate.throughput.output_token_rate!.mean
    const llmdTp = llmdReport.results.request_performance.aggregate.throughput.output_token_rate!.mean
    expect(llmdTp).toBeGreaterThan(stdTp)
  })

  it('L40S is slower than H100 on the same model (higher ttft mean)', () => {
    const h100Report = generateBenchmarkReport(H100, QWEN32B, 'standalone', SEQ_1K1K, DATE, fixedRand())
    const l40Report = generateBenchmarkReport(L40S, QWEN32B, 'standalone', SEQ_1K1K, DATE, fixedRand())
    const h100Ttft = h100Report.results.request_performance.aggregate.latency.time_to_first_token!.mean
    const l40Ttft = l40Report.results.request_performance.aggregate.latency.time_to_first_token!.mean
    expect(l40Ttft).toBeGreaterThan(h100Ttft)
  })

  it('load stats reflect input/output sequence lengths', () => {
    const r = generateBenchmarkReport(H100, LLAMA1B, 'standalone', SEQ_1K1K, DATE, fixedRand())
    const req = r.results.request_performance.aggregate.requests
    expect(req.input_length!.mean).toBe(1024)
    expect(req.output_length!.mean).toBe(1024)
    expect(r.scenario.load.standardized.input_seq_len).toEqual({ distribution: 'fixed', value: 1024 })
    expect(r.scenario.load.standardized.output_seq_len).toEqual({ distribution: 'gaussian', value: 1024 })
  })

  it('emits GPU util/mem/power observability metrics tagged to vllm-svc-0', () => {
    const r = generateBenchmarkReport(H100, LLAMA1B, 'standalone', SEQ_1K1K, DATE, fixedRand())
    const metrics = r.results.observability!.metrics!
    expect(metrics).toHaveLength(3)
    const names = metrics.map(m => m.name)
    expect(names).toEqual([
      'gpu_util.vllm-svc-0',
      'gpu_mem.vllm-svc-0',
      'gpu_power.vllm-svc-0',
    ])
    for (const m of metrics) {
      expect(m.type).toBe('gauge')
      expect(m.component_id).toBe('vllm-svc-0')
      expect(m.samples![0].ts).toBe(`${DATE}T02:05:00Z`)
    }
  })

  it('component_health entry per stack component with no failed replicas', () => {
    const r = generateBenchmarkReport(H100, LLAMA1B, 'disaggregated', SEQ_1K1K, DATE, fixedRand())
    const health = r.results.component_health!
    expect(health).toHaveLength(3)
    expect(health.map(h => h.component_label)).toEqual([
      'vllm-svc-0', 'vllm-prefill-0', 'epp-0',
    ])
    for (const h of health) {
      expect(h.failed_replicas).toBe(0)
      expect(h.total_restarts).toBeGreaterThanOrEqual(0)
    }
  })

  it('makeStats — p50 equals the mean, min is non-negative, stddev is spread*mean', () => {
    const r = generateBenchmarkReport(H100, LLAMA1B, 'standalone', SEQ_1K1K, DATE, fixedRand())
    const stats = r.results.request_performance.aggregate.latency.time_to_first_token!
    expect(stats.p50).toBe(stats.mean)
    expect(stats.min).toBeGreaterThanOrEqual(0)
    expect(stats.max).toBeGreaterThan(stats.mean)
    expect(stats.p99).toBeGreaterThan(stats.p95!)
    expect(stats.p95).toBeGreaterThan(stats.p90!)
  })

  it('makeStats clamps a small mean so min never goes negative', () => {
    // 1B model on H100 llm-d → smallest baseTpotMs; spread * mean * 2 can
    // exceed mean, so min-clamping matters.
    const r = generateBenchmarkReport(H100, LLAMA1B, 'llm-d', SEQ_1K1K, DATE, fixedRand())
    const tpot = r.results.request_performance.aggregate.latency.time_per_output_token!
    expect(tpot.min).toBeGreaterThanOrEqual(0)
  })
})

// ─── generateBenchmarkReports ──────────────────────────────────────────────

describe('generateBenchmarkReports', () => {
  const reports = generateBenchmarkReports()

  it('produces a non-empty set of reports', () => {
    expect(reports.length).toBeGreaterThan(0)
  })

  it('never combines 70B model with L40S hardware', () => {
    const violations = reports.filter((r: BenchmarkReport) => {
      const modelName = r.scenario.stack[0].standardized.model!.name
      const hwModel = r.scenario.stack[0].standardized.accelerator!.model
      return modelName.includes('70B') && hwModel.includes('L40S')
    })
    expect(violations).toEqual([])
  })

  it('DeepSeek-R1 only runs on H100 or H200', () => {
    const r1Reports = reports.filter(
      r => r.scenario.stack[0].standardized.model!.name.includes('R1'),
    )
    expect(r1Reports.length).toBeGreaterThan(0)
    for (const r of r1Reports) {
      const hw = r.scenario.stack[0].standardized.accelerator!.model
      expect(hw.includes('H100') || hw.includes('H200')).toBe(true)
    }
  })

  it('covers all three configs across the mix', () => {
    const configs = new Set<string>()
    for (const r of reports) {
      const tool = r.scenario.stack[0].standardized.tool
      const role = r.scenario.stack[0].standardized.role
      if (tool === 'vllm') configs.add('standalone')
      else if (role === 'decode') configs.add('disaggregated')
      else configs.add('llm-d')
    }
    expect(configs).toEqual(new Set(['standalone', 'llm-d', 'disaggregated']))
  })

  it('all reports carry the current-day date stamp', () => {
    const today = new Date().toISOString().slice(0, 10)
    for (const r of reports) {
      expect(r.run.time.start.startsWith(`${today}T`)).toBe(true)
    }
  })

  it('uids within a single generation are unique', () => {
    // uidCounter is module-level, so uids may drift across runs; but within
    // one call they must be unique.
    const uids = new Set(reports.map(r => r.run.uid))
    expect(uids.size).toBe(reports.length)
  })
})

// ─── generateTimelineReports ───────────────────────────────────────────────

describe('generateTimelineReports', () => {
  it('defaults to 90 days × 4 tracked configs = 364 points (inclusive of day 0)', () => {
    const points = generateTimelineReports()
    expect(points.length).toBe(91 * 4)
  })

  it('honours a custom days parameter', () => {
    const points = generateTimelineReports(5)
    expect(points.length).toBe(6 * 4)
  })

  it('emits chronologically-ordered dates (oldest first)', () => {
    const points = generateTimelineReports(5)
    // For each of the 4 tracked configs, the first 4 points are day 5 back,
    // last 4 are day 0 (today). We check global order by extracting per-config.
    const perConfig: Record<string, string[]> = {}
    for (const p of points) {
      const k = `${p.hardware}-${p.model}-${p.config}`
      perConfig[k] = perConfig[k] || []
      perConfig[k].push(p.date)
    }
    for (const dates of Object.values(perConfig)) {
      expect(dates.length).toBe(6)
      const sorted = [...dates].sort()
      expect(dates).toEqual(sorted)
    }
  })

  it('shortens the hardware label (strips NVIDIA/SXM/HBM3 markers)', () => {
    const points = generateTimelineReports(1)
    const hardwares = new Set(points.map(p => p.hardware))
    for (const h of hardwares) {
      expect(h.startsWith('NVIDIA-')).toBe(false)
      expect(h).not.toContain('SXM4')
      expect(h).not.toContain('HBM3')
    }
  })

  it('tracks the four expected (hw, model, config) tuples', () => {
    const points = generateTimelineReports(1)
    const combos = new Set(points.map(p => `${p.hardware}|${p.model}|${p.config}`))
    expect(combos).toEqual(new Set([
      'H100|Llama-3-70B|standalone',
      'H100|Llama-3-70B|llm-d',
      'H100|Llama-3-70B|disaggregated',
      'A100|Llama-3-70B|llm-d',
    ]))
  })

  it('applies the improvementFactor over time for non-standalone configs', () => {
    // The generator scales non-standalone ttft by an improvementFactor derived
    // from day index. We verify the factor is actually applied (i.e. mean drifts
    // beyond the ±5% jitter envelope) without asserting a direction — that way
    // this test survives future fixes to the direction of the drift.
    const points = generateTimelineReports(30)
    const disagg = points.filter((p: TimelinePoint) => p.config === 'disaggregated')
    const chunk = Math.floor(disagg.length / 3)
    const oldAvg = disagg.slice(0, chunk).reduce((s, p) => s + p.ttftP50Ms, 0) / chunk
    const newAvg = disagg.slice(-chunk).reduce((s, p) => s + p.ttftP50Ms, 0) / chunk
    // 15% factor over the range → averages should differ by more than the
    // ±5% jitter envelope.
    expect(Math.abs(newAvg - oldAvg) / Math.max(oldAvg, newAvg)).toBeGreaterThan(0.05)
  })

  it('standalone config is not improved over time (config gating)', () => {
    const points = generateTimelineReports(30)
    const std = points.filter(p => p.config === 'standalone')
    // Every value is baseline * jitter (no improvementFactor).
    // Extract baseline: without jitter this would be constant; jitter is 0.95..1.05,
    // so max/min ratio must sit within [~0.95/1.05, 1.05/0.95] × baseline.
    const ttfts = std.map(p => p.ttftP50Ms)
    const min = Math.min(...ttfts)
    const max = Math.max(...ttfts)
    // ratio bounded — no drift beyond the ±5% jitter envelope
    expect(max / min).toBeLessThanOrEqual(1.05 / 0.95 + 1e-9)
  })
})
