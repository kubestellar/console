/**
 * Unit coverage for lib/llmd/benchmarkMockData.pareto.ts.
 *
 * These are pure analysis functions extracted from the LLM-d benchmark mock
 * data pipeline — no side effects, no async, no DOM. Tests exercise the full
 * export surface (extractParetoPoints, computeParetoFrontier,
 * generateLeaderboardRows, getHardwareShort, getModelShort, and the
 * HARDWARE_COLORS / CONFIG_COLORS palettes).
 */
import { describe, expect, it } from 'vitest'

import {
  CONFIG_COLORS,
  HARDWARE_COLORS,
  computeParetoFrontier,
  extractParetoPoints,
  generateLeaderboardRows,
  getHardwareShort,
  getModelShort,
} from './benchmarkMockData.pareto'
import type {
  BenchmarkReport,
  ParetoPoint,
} from './benchmarkMockData.types'

// ---------------------------------------------------------------------------
// Report factory — builds a minimal but valid BenchmarkReport for tests.
// ---------------------------------------------------------------------------
interface FakeReportOverrides {
  uid?: string
  eid?: string
  model?: string
  hardware?: string
  gpuCount?: number
  tool?: string
  roles?: string[]              // stack-component roles
  outputRate?: number
  ttft?: number                 // seconds (converted to ms internally)
  tpot?: number                 // seconds
  p99?: number                  // seconds
  requestRate?: number
  isl?: number
  osl?: number
  memory?: number
}

function makeReport(overrides: FakeReportOverrides = {}): BenchmarkReport {
  const {
    uid = 'run-1',
    eid = 'exp-1',
    model = 'meta-llama/Llama-3-70B-Instruct',
    hardware = 'NVIDIA-H100-SXM4-80GB',
    gpuCount = 1,
    tool = 'vllm',
    roles = ['inference_engine'],
    outputRate = 100,
    ttft = 0.05,   // 50 ms
    tpot = 0.02,   // 20 ms
    p99 = 0.5,     // 500 ms
    requestRate = 10,
    isl = 1024,
    osl = 1024,
    memory = 80,
  } = overrides

  const stack = roles.map((role) => ({
    standardized: {
      kind: role === 'inference_engine' ? 'inference_engine' : 'other',
      role,
      tool,
      model: { name: model },
      accelerator: { model: hardware, count: gpuCount, memory },
    },
  }))

  return {
    version: '1',
    run: {
      uid,
      eid,
      time: { start: '', end: '', duration: '' },
      user: 'tester',
    },
    scenario: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stack: stack as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      load: { standardized: { input_seq_len: { value: isl }, output_seq_len: { value: osl } } } as any,
    },
    results: {
      request_performance: {
        aggregate: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          requests: {} as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          latency: {
            time_to_first_token: { p50: ttft },
            time_per_output_token: { p50: tpot },
            request_latency: { p99 },
          } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          throughput: {
            output_token_rate: { mean: outputRate },
            request_rate: { mean: requestRate },
          } as any,
        },
      },
    },
  }
}

// ---------------------------------------------------------------------------
// extractParetoPoints
// ---------------------------------------------------------------------------
describe('extractParetoPoints', () => {
  it('extracts a valid point from a well-formed report', () => {
    const [point] = extractParetoPoints([makeReport()])
    expect(point.uid).toBe('run-1')
    expect(point.model).toBe('meta-llama/Llama-3-70B-Instruct')
    expect(point.hardware).toBe('NVIDIA-H100-SXM4-80GB')
    expect(point.gpuCount).toBe(1)
    expect(point.throughputPerGpu).toBe(100)  // outputRate / gpuCount
    expect(point.ttftP50Ms).toBe(50)          // ttft (s) * 1000
    expect(point.tpotP50Ms).toBe(20)
    expect(point.p99LatencyMs).toBe(500)
    expect(point.requestRate).toBe(10)
    expect(point.seqLen).toBe('1024/1024')
  })

  it('divides output rate by gpuCount to get per-GPU throughput', () => {
    const [point] = extractParetoPoints([makeReport({ outputRate: 800, gpuCount: 4 })])
    expect(point.throughputPerGpu).toBe(200)
  })

  it('drops reports with zero throughput', () => {
    const points = extractParetoPoints([
      makeReport({ uid: 'good', outputRate: 100 }),
      makeReport({ uid: 'zero', outputRate: 0 }),
    ])
    expect(points.map(p => p.uid)).toEqual(['good'])
  })

  it('drops reports with no inference_engine stack component', () => {
    const bad = makeReport({ uid: 'no-engine', roles: ['other-thing'] })
    const good = makeReport({ uid: 'ok' })
    const points = extractParetoPoints([bad, good])
    expect(points.map(p => p.uid)).toEqual(['ok'])
  })

  it('classifies vllm reports as standalone', () => {
    const [point] = extractParetoPoints([makeReport({ tool: 'vllm' })])
    expect(point.config).toBe('standalone')
  })

  it('classifies reports with the replica role as standalone', () => {
    const [point] = extractParetoPoints([
      makeReport({ tool: 'other', roles: ['inference_engine', 'replica'] }),
    ])
    expect(point.config).toBe('standalone')
  })

  it('classifies "standalone" experiment IDs as standalone even for non-vllm tools', () => {
    const [point] = extractParetoPoints([
      makeReport({ tool: 'sglang', eid: 'standalone-benchmark' }),
    ])
    expect(point.config).toBe('standalone')
  })

  it('classifies reports with prefill + decode roles as disaggregated', () => {
    const [point] = extractParetoPoints([
      makeReport({
        tool: 'sglang',
        eid: 'exp-x',
        roles: ['inference_engine', 'prefill', 'decode'],
      }),
    ])
    expect(point.config).toBe('disaggregated')
  })

  it('classifies "modelservice" experiment IDs as disaggregated', () => {
    const [point] = extractParetoPoints([
      makeReport({ tool: 'sglang', eid: 'modelservice-x' }),
    ])
    expect(point.config).toBe('disaggregated')
  })

  it('falls back to scheduling when no other classification matches', () => {
    const [point] = extractParetoPoints([
      makeReport({ tool: 'sglang', eid: 'plain-experiment', roles: ['inference_engine'] }),
    ])
    expect(point.config).toBe('scheduling')
  })

  it('uses "?" for missing output-seq-len in the seqLen label', () => {
    const report = makeReport({ isl: 1024 })
    // Remove output_seq_len entirely from the load standardization.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (report.scenario.load as any).standardized.output_seq_len
    const [point] = extractParetoPoints([report])
    expect(point.seqLen).toBe('1024/?')
  })
})

// ---------------------------------------------------------------------------
// computeParetoFrontier
// ---------------------------------------------------------------------------
describe('computeParetoFrontier', () => {
  function point(overrides: Partial<ParetoPoint>): ParetoPoint {
    return {
      uid: 'p',
      model: 'm',
      hardware: 'h',
      hardwareMemory: 0,
      gpuCount: 1,
      config: 'standalone',
      framework: 'vllm',
      seqLen: '1024/1024',
      throughputPerGpu: 100,
      ttftP50Ms: 50,
      tpotP50Ms: 20,
      p99LatencyMs: 500,
      requestRate: 10,
      powerPerGpuKw: 0.5,
      tcoPerGpuHr: 2,
      ...overrides,
    }
  }

  it('returns an empty array for an empty input', () => {
    expect(computeParetoFrontier([])).toEqual([])
  })

  it('keeps a single point as the frontier', () => {
    const p = point({ uid: 'a' })
    expect(computeParetoFrontier([p])).toEqual([p])
  })

  it('drops a dominated point (lower throughput AND higher TTFT)', () => {
    const dominated = point({ uid: 'dom', throughputPerGpu: 50, ttftP50Ms: 100 })
    const winner = point({ uid: 'win', throughputPerGpu: 200, ttftP50Ms: 50 })
    const frontier = computeParetoFrontier([dominated, winner])
    expect(frontier.map(p => p.uid)).toEqual(['win'])
  })

  it('keeps both endpoints of a genuine tradeoff', () => {
    const highThrough = point({ uid: 'ht', throughputPerGpu: 200, ttftP50Ms: 100 })
    const lowTtft = point({ uid: 'lt', throughputPerGpu: 50, ttftP50Ms: 10 })
    const frontier = computeParetoFrontier([highThrough, lowTtft])
    const uids = frontier.map(p => p.uid).sort()
    expect(uids).toEqual(['ht', 'lt'])
  })

  it('returns the frontier in ascending throughput order', () => {
    const points = [
      point({ uid: 'a', throughputPerGpu: 100, ttftP50Ms: 100 }),
      point({ uid: 'b', throughputPerGpu: 200, ttftP50Ms: 50 }),
      point({ uid: 'c', throughputPerGpu: 300, ttftP50Ms: 25 }),
    ]
    const frontier = computeParetoFrontier(points)
    const throughputs = frontier.map(p => p.throughputPerGpu)
    expect(throughputs).toEqual([...throughputs].sort((a, b) => a - b))
  })

  it('does not mutate the input array', () => {
    const points = [
      point({ uid: 'a', throughputPerGpu: 100 }),
      point({ uid: 'b', throughputPerGpu: 200 }),
    ]
    const snapshot = points.map(p => p.uid)
    computeParetoFrontier(points)
    expect(points.map(p => p.uid)).toEqual(snapshot)
  })
})

// ---------------------------------------------------------------------------
// generateLeaderboardRows
// ---------------------------------------------------------------------------
describe('generateLeaderboardRows', () => {
  it('produces one row per valid report', () => {
    const rows = generateLeaderboardRows([
      makeReport({ uid: 'a', outputRate: 100 }),
      makeReport({ uid: 'b', outputRate: 200 }),
    ])
    expect(rows).toHaveLength(2)
  })

  it('assigns rank 1 to the highest-scoring row and 2 to the next, etc.', () => {
    const rows = generateLeaderboardRows([
      makeReport({ uid: 'low', outputRate: 50, ttft: 0.1, p99: 1.0 }),
      makeReport({ uid: 'high', outputRate: 500, ttft: 0.01, p99: 0.1 }),
    ])
    expect(rows[0].rank).toBe(1)
    expect(rows[1].rank).toBe(2)
    // The "high" configuration should win.
    expect(rows[0].throughputPerGpu).toBeGreaterThan(rows[1].throughputPerGpu)
  })

  it('shortens the hardware label using the same rule as getHardwareShort', () => {
    const rows = generateLeaderboardRows([
      makeReport({ hardware: 'NVIDIA-H100-SXM4-80GB' }),
    ])
    expect(rows[0].hardware).toBe('H100')
  })

  it('shortens the model label to the last path segment', () => {
    const rows = generateLeaderboardRows([
      makeReport({ model: 'meta-llama/Llama-3-70B-Instruct' }),
    ])
    expect(rows[0].model).toBe('Llama-3-70B-Instruct')
  })

  it('computes llmdAdvantage when a matching standalone baseline exists', () => {
    // Baseline: same model + hardware, standalone (vllm), throughput 100/GPU.
    // Candidate: scheduling config, throughput 200/GPU -> +100% advantage.
    const rows = generateLeaderboardRows([
      makeReport({
        uid: 'baseline',
        model: 'm/model',
        hardware: 'NVIDIA-H100-SXM4-80GB',
        tool: 'vllm',
        outputRate: 100,
      }),
      makeReport({
        uid: 'candidate',
        model: 'm/model',
        hardware: 'NVIDIA-H100-SXM4-80GB',
        tool: 'sglang',
        eid: 'plain-scheduling',
        outputRate: 200,
      }),
    ])
    const candidate = rows.find(r => r.throughputPerGpu === 200)
    expect(candidate?.llmdAdvantage).toBe(100)
  })

  it('leaves llmdAdvantage null when no matching standalone baseline exists', () => {
    const rows = generateLeaderboardRows([
      makeReport({
        uid: 'only',
        tool: 'sglang',
        eid: 'plain',
        outputRate: 100,
      }),
    ])
    expect(rows[0].llmdAdvantage).toBeNull()
  })

  it('leaves llmdAdvantage null on the standalone row itself', () => {
    const rows = generateLeaderboardRows([
      makeReport({ uid: 'sa', tool: 'vllm' }),
    ])
    expect(rows[0].llmdAdvantage).toBeNull()
  })

  it('scores are bounded between 0 and 100', () => {
    const rows = generateLeaderboardRows([
      makeReport({ uid: 'a', outputRate: 100, ttft: 0.05, p99: 0.5 }),
      makeReport({ uid: 'b', outputRate: 200, ttft: 0.02, p99: 0.2 }),
    ])
    for (const row of rows) {
      expect(row.score).toBeGreaterThanOrEqual(0)
      expect(row.score).toBeLessThanOrEqual(100)
    }
  })

  it('links each row back to its source report via the `report` field', () => {
    const src = makeReport({ uid: 'unique-id' })
    const [row] = generateLeaderboardRows([src])
    expect(row.report.run.uid).toBe('unique-id')
  })
})

// ---------------------------------------------------------------------------
// getHardwareShort
// ---------------------------------------------------------------------------
describe('getHardwareShort', () => {
  it.each([
    ['NVIDIA-H100-SXM4-80GB', 'H100'],
    ['NVIDIA-H200-80GB-HBM3', 'H200'],
    ['NVIDIA-H200-141GB', 'H200'],
    ['NVIDIA-A100-SXM4-80GB', 'A100'],
  ])('shortens %s to %s', (input, expected) => {
    expect(getHardwareShort(input)).toBe(expected)
  })

  it('leaves unrecognised strings unchanged', () => {
    expect(getHardwareShort('custom-accelerator')).toBe('custom-accelerator')
  })
})

// ---------------------------------------------------------------------------
// getModelShort
// ---------------------------------------------------------------------------
describe('getModelShort', () => {
  it('returns the last path segment', () => {
    expect(getModelShort('meta-llama/Llama-3-70B-Instruct')).toBe('Llama-3-70B-Instruct')
  })

  it('returns the input unchanged when there is no "/"', () => {
    expect(getModelShort('just-a-name')).toBe('just-a-name')
  })

  it('returns the empty string for an empty input', () => {
    expect(getModelShort('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// HARDWARE_COLORS / CONFIG_COLORS palettes
// ---------------------------------------------------------------------------
describe('color palettes', () => {
  it('HARDWARE_COLORS covers the shortened hardware keys used by the leaderboard', () => {
    for (const key of ['H100', 'H200', 'A100', 'L40S']) {
      expect(HARDWARE_COLORS[key]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('CONFIG_COLORS covers all three ParetoPoint config values', () => {
    for (const key of ['standalone', 'scheduling', 'disaggregated'] as const) {
      expect(CONFIG_COLORS[key]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
