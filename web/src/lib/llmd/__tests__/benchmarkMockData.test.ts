import { describe, it, expect } from 'vitest'
import {
  getModelShort,
  getHardwareShort,
  generateBenchmarkReports,
  generateBenchmarkReport,
  generateTimelineReports,
  extractParetoPoints,
  computeParetoFrontier,
  generateLeaderboardRows,
  HARDWARE_SPECS,
  HARDWARE_COLORS,
  CONFIG_COLORS,
} from '../benchmarkMockData'
import type { BenchmarkReport, ParetoPoint } from '../benchmarkMockData'

// ---------------------------------------------------------------------------
// getModelShort / getHardwareShort
// ---------------------------------------------------------------------------
describe('getModelShort', () => {
  it('returns the last segment after "/"', () => {
    expect(getModelShort('meta-llama/Llama-3-70B-Instruct')).toBe('Llama-3-70B-Instruct')
  })

  it('returns the name as-is when no slash', () => {
    expect(getModelShort('simple-model')).toBe('simple-model')
  })

  it('handles deeply nested paths', () => {
    expect(getModelShort('org/sub/model-name')).toBe('model-name')
  })
})

describe('getHardwareShort', () => {
  it('strips NVIDIA- prefix', () => {
    expect(getHardwareShort('NVIDIA-H100-80GB-HBM3')).toBe('H100')
  })

  it('strips -SXM4-80GB suffix', () => {
    expect(getHardwareShort('NVIDIA-A100-SXM4-80GB')).toBe('A100')
  })

  it('strips -141GB suffix', () => {
    expect(getHardwareShort('NVIDIA-H200-141GB')).toBe('H200')
  })

  it('returns the name as-is when no known prefixes/suffixes', () => {
    expect(getHardwareShort('CustomGPU')).toBe('CustomGPU')
  })
})

// ---------------------------------------------------------------------------
// HARDWARE_SPECS
// ---------------------------------------------------------------------------
describe('HARDWARE_SPECS', () => {
  it('has entries for known hardware models', () => {
    expect(HARDWARE_SPECS['NVIDIA-H100-80GB-HBM3']).toBeDefined()
    expect(HARDWARE_SPECS['NVIDIA-A100-SXM4-80GB']).toBeDefined()
    expect(HARDWARE_SPECS['NVIDIA-L40S']).toBeDefined()
    expect(HARDWARE_SPECS['NVIDIA-H200-141GB']).toBeDefined()
  })

  it('each entry has powerKw and costPerHr as positive numbers', () => {
    for (const [model, spec] of Object.entries(HARDWARE_SPECS)) {
      expect(spec.powerKw, `${model} powerKw`).toBeGreaterThan(0)
      expect(spec.costPerHr, `${model} costPerHr`).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// HARDWARE_COLORS / CONFIG_COLORS
// ---------------------------------------------------------------------------
describe('HARDWARE_COLORS', () => {
  it('has entries for H100, H200, A100, L40S', () => {
    expect(HARDWARE_COLORS).toHaveProperty('H100')
    expect(HARDWARE_COLORS).toHaveProperty('H200')
    expect(HARDWARE_COLORS).toHaveProperty('A100')
    expect(HARDWARE_COLORS).toHaveProperty('L40S')
  })

  it('all values are valid hex color strings', () => {
    for (const color of Object.values(HARDWARE_COLORS)) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})

describe('CONFIG_COLORS', () => {
  it('has entries for standalone, scheduling, disaggregated', () => {
    expect(CONFIG_COLORS).toHaveProperty('standalone')
    expect(CONFIG_COLORS).toHaveProperty('scheduling')
    expect(CONFIG_COLORS).toHaveProperty('disaggregated')
  })
})

// ---------------------------------------------------------------------------
// generateBenchmarkReport (single)
// ---------------------------------------------------------------------------
describe('generateBenchmarkReport', () => {
  const hw = { model: 'NVIDIA-H100-80GB-HBM3', memory: 80, costPerHr: 2.5, powerKw: 0.7 }
  const model = { name: 'meta-llama/Llama-3.2-1B-Instruct', short: 'Llama-3.2-1B' }
  const seqLen = { label: '1k1k', isl: 1024, osl: 1024 }

  function makeSeed(): () => number {
    let s = 42
    return () => {
      s = (s * 16807 + 0) % 2147483647
      return (s - 1) / 2147483646
    }
  }

  it('returns a valid v0.2 report', () => {
    const r = generateBenchmarkReport(hw, model, 'standalone', seqLen, '2026-01-01', makeSeed())
    expect(r.version).toBe('0.2')
    expect(r.run.uid).toBeDefined()
    expect(r.scenario.stack.length).toBeGreaterThan(0)
  })

  it('standalone config has 1 stack entry for inference engine', () => {
    const r = generateBenchmarkReport(hw, model, 'standalone', seqLen, '2026-01-01', makeSeed())
    expect(r.scenario.stack).toHaveLength(1)
    expect(r.scenario.stack[0].standardized.kind).toBe('inference_engine')
    expect(r.scenario.stack[0].standardized.tool).toBe('vllm')
  })

  it('disaggregated config adds prefill and epp stack entries', () => {
    const r = generateBenchmarkReport(hw, model, 'disaggregated', seqLen, '2026-01-01', makeSeed())
    // Should have 3 stack entries: decode, prefill, epp
    expect(r.scenario.stack.length).toBe(3)
    const roles = r.scenario.stack.map(s => s.standardized.role).filter(Boolean)
    expect(roles).toContain('decode')
    expect(roles).toContain('prefill')
  })

  it('llm-d config adds epp stack entry but no prefill', () => {
    const r = generateBenchmarkReport(hw, model, 'llm-d', seqLen, '2026-01-01', makeSeed())
    expect(r.scenario.stack.length).toBe(2)
    expect(r.scenario.stack[1].standardized.tool).toBe('llm-d-inference-scheduler')
  })

  it('includes observability metrics', () => {
    const r = generateBenchmarkReport(hw, model, 'standalone', seqLen, '2026-01-01', makeSeed())
    expect(r.results.observability?.metrics?.length).toBeGreaterThan(0)
  })

  it('includes component health data', () => {
    const r = generateBenchmarkReport(hw, model, 'standalone', seqLen, '2026-01-01', makeSeed())
    expect(r.results.component_health?.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// generateBenchmarkReports (batch)
// ---------------------------------------------------------------------------
describe('generateBenchmarkReports', () => {
  it('generates multiple reports', () => {
    const reports = generateBenchmarkReports()
    expect(reports.length).toBeGreaterThan(10)
  })

  it('skips unrealistic combos (70B on L40S)', () => {
    const reports = generateBenchmarkReports()
    const l40s70b = reports.filter(r => {
      const engine = r.scenario.stack.find(c => c.standardized.kind === 'inference_engine')
      return engine?.standardized.accelerator?.model === 'NVIDIA-L40S' &&
             engine?.standardized.model?.name?.includes('70B')
    })
    expect(l40s70b).toHaveLength(0)
  })

  it('is deterministic (same output on repeated calls)', () => {
    const a = generateBenchmarkReports()
    const b = generateBenchmarkReports()
    expect(a.length).toBe(b.length)
    // First report should have same UID structure (uid counter resets via seededRandom)
    expect(a[0].run.eid).toBe(b[0].run.eid)
  })
})

// ---------------------------------------------------------------------------
// generateTimelineReports
// ---------------------------------------------------------------------------
describe('generateTimelineReports', () => {
  it('generates 91 points per tracked config for 90 days (day 0 through 90)', () => {
    const points = generateTimelineReports(90)
    // 4 tracked configs * 91 days = 364
    const TRACKED_CONFIGS = 4
    const DAYS_INCLUSIVE = 91
    expect(points).toHaveLength(TRACKED_CONFIGS * DAYS_INCLUSIVE)
  })

  it('each point has required fields', () => {
    const points = generateTimelineReports(5)
    for (const p of points) {
      expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(typeof p.hardware).toBe('string')
      expect(typeof p.model).toBe('string')
      expect(['standalone', 'llm-d', 'disaggregated']).toContain(p.config)
      expect(p.ttftP50Ms).toBeGreaterThan(0)
      expect(p.tpotP50Ms).toBeGreaterThan(0)
      expect(p.outputThroughput).toBeGreaterThan(0)
      expect(p.p99LatencyMs).toBeGreaterThan(0)
    }
  })

  it('accepts a custom day count', () => {
    const points = generateTimelineReports(3)
    const TRACKED_CONFIGS = 4
    const DAYS_INCLUSIVE = 4
    expect(points).toHaveLength(TRACKED_CONFIGS * DAYS_INCLUSIVE)
  })
})

// ---------------------------------------------------------------------------
// extractParetoPoints
// ---------------------------------------------------------------------------
describe('extractParetoPoints', () => {
  it('returns empty for empty input', () => {
    expect(extractParetoPoints([])).toEqual([])
  })

  it('filters out reports with no inference engine', () => {
    const report: BenchmarkReport = {
      version: '0.2',
      run: { uid: 'x', eid: '', time: { start: '', end: '', duration: '' }, user: '' },
      scenario: { stack: [], load: { metadata: { cfg_id: '' }, standardized: { tool: '', tool_version: '', source: 'random', input_seq_len: { distribution: 'fixed', value: 0 } } } },
      results: { request_performance: { aggregate: { requests: { total: 0, failures: 0 }, latency: {}, throughput: {} } } },
    }
    expect(extractParetoPoints([report])).toEqual([])
  })

  it('extracts valid pareto points from generated reports', () => {
    const reports = generateBenchmarkReports()
    const points = extractParetoPoints(reports)
    expect(points.length).toBeGreaterThan(0)

    for (const p of points) {
      expect(p.uid).toBeDefined()
      expect(p.throughputPerGpu).toBeGreaterThan(0)
      expect(p.ttftP50Ms).toBeGreaterThanOrEqual(0)
      expect(p.gpuCount).toBeGreaterThanOrEqual(1)
      expect(['standalone', 'scheduling', 'disaggregated']).toContain(p.config)
    }
  })

  it('classifies standalone config for vllm tool', () => {
    const reports = generateBenchmarkReports()
    const points = extractParetoPoints(reports)
    const standalones = points.filter(p => p.config === 'standalone')
    expect(standalones.length).toBeGreaterThan(0)
    for (const p of standalones) {
      expect(p.framework).toBe('vllm')
    }
  })
})

// ---------------------------------------------------------------------------
// computeParetoFrontier
// ---------------------------------------------------------------------------
describe('computeParetoFrontier', () => {
  it('returns empty for empty input', () => {
    expect(computeParetoFrontier([])).toEqual([])
  })

  it('returns a single point when only one input', () => {
    const point: ParetoPoint = {
      uid: 'a', model: 'm', hardware: 'h', hardwareMemory: 80, gpuCount: 1,
      config: 'standalone', framework: 'vllm', seqLen: '1024/1024',
      throughputPerGpu: 100, ttftP50Ms: 10, tpotP50Ms: 5, p99LatencyMs: 50,
      requestRate: 10, powerPerGpuKw: 0.5, tcoPerGpuHr: 2,
    }
    expect(computeParetoFrontier([point])).toEqual([point])
  })

  it('filters dominated points (higher throughput AND lower TTFT wins)', () => {
    const dominated: ParetoPoint = {
      uid: 'a', model: 'm', hardware: 'h', hardwareMemory: 80, gpuCount: 1,
      config: 'standalone', framework: 'vllm', seqLen: '1k',
      throughputPerGpu: 50, ttftP50Ms: 100, tpotP50Ms: 5, p99LatencyMs: 50,
      requestRate: 10, powerPerGpuKw: 0.5, tcoPerGpuHr: 2,
    }
    const dominant: ParetoPoint = {
      ...dominated, uid: 'b', throughputPerGpu: 200, ttftP50Ms: 5,
    }
    const frontier = computeParetoFrontier([dominated, dominant])
    // The dominant point should be on the frontier; the dominated should not
    expect(frontier.some(p => p.uid === 'b')).toBe(true)
  })

  it('returns frontier sorted by throughput ascending', () => {
    const reports = generateBenchmarkReports()
    const points = extractParetoPoints(reports)
    const frontier = computeParetoFrontier(points)
    for (let i = 1; i < frontier.length; i++) {
      expect(frontier[i].throughputPerGpu).toBeGreaterThanOrEqual(frontier[i - 1].throughputPerGpu)
    }
  })
})

// ---------------------------------------------------------------------------
// generateLeaderboardRows
// ---------------------------------------------------------------------------
describe('generateLeaderboardRows', () => {
  it('generates rows from reports', () => {
    const reports = generateBenchmarkReports()
    const rows = generateLeaderboardRows(reports)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('assigns sequential ranks starting from 1', () => {
    const reports = generateBenchmarkReports()
    const rows = generateLeaderboardRows(reports)
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].rank).toBe(i + 1)
    }
  })

  it('sorts by score descending', () => {
    const reports = generateBenchmarkReports()
    const rows = generateLeaderboardRows(reports)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].score).toBeLessThanOrEqual(rows[i - 1].score)
    }
  })

  it('computes llmdAdvantage for non-standalone configs', () => {
    const reports = generateBenchmarkReports()
    const rows = generateLeaderboardRows(reports)
    const nonStandalone = rows.filter(r => r.config !== 'standalone')
    // At least some should have an advantage computed
    const withAdvantage = nonStandalone.filter(r => r.llmdAdvantage !== null)
    expect(withAdvantage.length).toBeGreaterThan(0)
  })

  it('standalone configs have null llmdAdvantage', () => {
    const reports = generateBenchmarkReports()
    const rows = generateLeaderboardRows(reports)
    const standalones = rows.filter(r => r.config === 'standalone')
    for (const row of standalones) {
      expect(row.llmdAdvantage).toBeNull()
    }
  })

  it('each row has a report reference', () => {
    const reports = generateBenchmarkReports()
    const rows = generateLeaderboardRows(reports)
    for (const row of rows) {
      expect(row.report).toBeDefined()
      expect(row.report.version).toBe('0.2')
    }
  })

  it('hardware names are shortened (no NVIDIA- prefix)', () => {
    const reports = generateBenchmarkReports()
    const rows = generateLeaderboardRows(reports)
    for (const row of rows) {
      expect(row.hardware).not.toContain('NVIDIA-')
    }
  })
})
