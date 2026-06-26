import { describe, it, expect} from 'vitest'
import {
  extractExperimentMeta,
  groupByExperiment,
  getFilterOptions,
  buildHeatmapData,
  CONFIG_TYPE_COLORS,
} from '../benchmarkDataUtils'
import type { BenchmarkReport } from '../benchmarkMockData'

// ---------------------------------------------------------------------------
// Helper: build a minimal BenchmarkReport-like object
// ---------------------------------------------------------------------------
type ReportLike = Parameters<typeof extractExperimentMeta>[0]

function makeReport(
  eid: string,
  overrides: {
    qps?: number
    isl?: number
    osl?: number
    stack?: Partial<BenchmarkReport['scenario']['stack'][number]>[]
    throughput?: number
    ttft?: number
    tpot?: number
    itl?: number
    p99?: number
    reqLat?: number
    reqRate?: number
    total?: number
    failures?: number
  } = {}
): ReportLike {
  const {
    qps = 10,
    isl = 2148,
    osl = 100,
    stack = [],
    throughput = 500,
    ttft = 0.05,
    tpot = 0.015,
    itl = 0.016,
    p99 = 0.5,
    reqLat = 0.2,
    reqRate = 10,
    total = 100,
    failures = 0,
  } = overrides

  return {
    run: { eid, uid: `uid-${eid}-${qps}` },
    scenario: {
      stack: stack as BenchmarkReport['scenario']['stack'],
      load: {
        standardized: {
          rate_qps: qps,
          input_seq_len: { value: isl },
          output_seq_len: { value: osl },
        },
      } as BenchmarkReport['scenario']['load'],
    },
    results: {
      request_performance: {
        aggregate: {
          latency: {
            time_to_first_token: { p50: ttft, mean: ttft, units: 's' },
            time_per_output_token: { p50: tpot, mean: tpot, units: 's/token' },
            inter_token_latency: { p50: itl, mean: itl, units: 's/token' },
            request_latency: { p50: reqLat, p99, mean: reqLat, units: 's' },
          },
          throughput: {
            output_token_rate: { mean: throughput, units: 'tokens/s' },
            request_rate: { mean: reqRate, units: 'queries/s' },
          },
          requests: { total, failures },
        },
      },
    },
  } as ReportLike
}

// ---------------------------------------------------------------------------
// extractExperimentMeta
// ---------------------------------------------------------------------------
describe('extractExperimentMeta', () => {
  it('extracts category and variant from eid', () => {
    const meta = extractExperimentMeta(makeReport('Inference Scheduling/queue-scorer'))
    expect(meta.category).toBe('Inference Scheduling')
    expect(meta.variant).toBe('queue-scorer')
  })

  it('extracts QPS, ISL, OSL from load config', () => {
    const meta = extractExperimentMeta(makeReport('Test/v', { qps: 15, isl: 3048, osl: 300 }))
    expect(meta.qps).toBe(15)
    expect(meta.isl).toBe(3048)
    expect(meta.osl).toBe(300)
  })

  it('handles empty eid gracefully', () => {
    const meta = extractExperimentMeta(makeReport(''))
    expect(meta.category).toBe('')
  })

  it('handles multi-level eid (slashes in variant)', () => {
    const meta = extractExperimentMeta(makeReport('Cat/sub/deep'))
    expect(meta.category).toBe('Cat')
    expect(meta.variant).toBe('sub/deep')
  })

  it('detects standalone config when role is replica', () => {
    const meta = extractExperimentMeta(
      makeReport('PD/setup_standalone_1_4', {
        stack: [{ standardized: { role: 'replica', kind: 'other', tool: 'vllm', tool_version: '' } } as never],
      })
    )
    expect(meta.config).toBe('standalone')
  })

  it('detects disaggregated config when role is prefill', () => {
    const meta = extractExperimentMeta(
      makeReport('PD/setup_modelservice_2_4', {
        stack: [{ standardized: { role: 'prefill', kind: 'inference_engine', tool: 'llm-d', tool_version: '' } } as never],
      })
    )
    expect(meta.config).toBe('disaggregated')
  })

  it('defaults to scheduling config when no special roles', () => {
    const meta = extractExperimentMeta(makeReport('Inference Scheduling/kv-scorer'))
    expect(meta.config).toBe('scheduling')
  })

  it('produces a short variant for standalone setups', () => {
    const meta = extractExperimentMeta(makeReport('X/pd-disaggregation.setup_standalone_1_4_NA'))
    expect(meta.shortVariant).toContain('Standalone')
  })

  it('produces a short variant for modelservice setups', () => {
    const meta = extractExperimentMeta(makeReport('X/pd-disaggregation.setup_modelservice_NA_NA_2_4'))
    expect(meta.shortVariant).toContain('PD')
  })

  it('produces a short variant for precise prefix variants', () => {
    const meta = extractExperimentMeta(makeReport('X/precise_prefix_cache_aware.cache_tracking'))
    expect(meta.shortVariant).toBe('cache_tracking')
  })

  it('produces a short variant for inference-scheduling- prefix', () => {
    const meta = extractExperimentMeta(makeReport('X/inference-scheduling-kv-scorer'))
    expect(meta.shortVariant).toBe('kv-scorer')
  })
})

// ---------------------------------------------------------------------------
// groupByExperiment
// ---------------------------------------------------------------------------
describe('groupByExperiment', () => {
  it('returns empty array for empty input', () => {
    expect(groupByExperiment([])).toEqual([])
  })

  it('filters out reports with zero QPS', () => {
    const groups = groupByExperiment([makeReport('Cat/var', { qps: 0 })])
    expect(groups).toHaveLength(0)
  })

  it('filters out reports with zero ISL', () => {
    const groups = groupByExperiment([makeReport('Cat/var', { isl: 0 })])
    expect(groups).toHaveLength(0)
  })

  it('filters out reports with zero OSL', () => {
    const groups = groupByExperiment([makeReport('Cat/var', { osl: 0 })])
    expect(groups).toHaveLength(0)
  })

  it('groups reports by category/variant', () => {
    const reports = [
      makeReport('Cat/var', { qps: 5 }),
      makeReport('Cat/var', { qps: 10 }),
      makeReport('Cat/other', { qps: 5 }),
    ]
    const groups = groupByExperiment(reports)
    expect(groups.length).toBe(2)
    const catVar = groups.find(g => g.variant === 'var')
    expect(catVar).toBeDefined()
    expect(catVar!.rawPoints).toHaveLength(2)
  })

  it('aggregates points by QPS (average across ISL/OSL)', () => {
    const reports = [
      makeReport('Cat/var', { qps: 10, isl: 100, osl: 50, throughput: 200 }),
      makeReport('Cat/var', { qps: 10, isl: 200, osl: 100, throughput: 400 }),
    ]
    const groups = groupByExperiment(reports)
    expect(groups).toHaveLength(1)
    // Two ISL/OSL combos at same QPS should be averaged into one point
    expect(groups[0].points).toHaveLength(1)
    expect(groups[0].points[0].throughput).toBe(300) // avg of 200 and 400
  })

  it('sorts aggregated points by QPS ascending', () => {
    const reports = [
      makeReport('Cat/var', { qps: 20 }),
      makeReport('Cat/var', { qps: 5 }),
      makeReport('Cat/var', { qps: 10 }),
    ]
    const groups = groupByExperiment(reports)
    const qpsValues = groups[0].points.map(p => p.qps)
    expect(qpsValues).toEqual([5, 10, 20])
  })

  it('assigns hex color strings to each group', () => {
    const reports = [makeReport('Cat/var', { qps: 10 })]
    const groups = groupByExperiment(reports)
    expect(groups[0].color).toMatch(/^#/)
  })

  it('applies category filter', () => {
    const reports = [
      makeReport('A/var', { qps: 10 }),
      makeReport('B/var', { qps: 10 }),
    ]
    const groups = groupByExperiment(reports, { category: 'A' })
    expect(groups).toHaveLength(1)
    expect(groups[0].category).toBe('A')
  })

  it('applies ISL filter', () => {
    const reports = [
      makeReport('Cat/var', { qps: 10, isl: 100 }),
      makeReport('Cat/var', { qps: 10, isl: 200 }),
    ]
    const groups = groupByExperiment(reports, { isl: 100 })
    expect(groups).toHaveLength(1)
    expect(groups[0].rawPoints).toHaveLength(1)
    expect(groups[0].rawPoints[0].isl).toBe(100)
  })

  it('applies OSL filter', () => {
    const reports = [
      makeReport('Cat/var', { qps: 10, osl: 50 }),
      makeReport('Cat/var', { qps: 10, osl: 300 }),
    ]
    const groups = groupByExperiment(reports, { osl: 300 })
    expect(groups).toHaveLength(1)
    expect(groups[0].rawPoints[0].osl).toBe(300)
  })

  it('sorts groups alphabetically by shortVariant', () => {
    const reports = [
      makeReport('Cat/z-variant', { qps: 10 }),
      makeReport('Cat/a-variant', { qps: 10 }),
    ]
    const groups = groupByExperiment(reports)
    expect(groups[0].shortVariant.localeCompare(groups[1].shortVariant)).toBeLessThanOrEqual(0)
  })
})

// ---------------------------------------------------------------------------
// getFilterOptions
// ---------------------------------------------------------------------------
describe('getFilterOptions', () => {
  it('returns empty arrays for empty input', () => {
    const opts = getFilterOptions([])
    expect(opts.categories).toEqual([])
    expect(opts.models).toEqual([])
    expect(opts.islValues).toEqual([])
    expect(opts.oslValues).toEqual([])
  })

  it('extracts unique categories sorted', () => {
    const reports = [
      makeReport('B-Category/var1'),
      makeReport('A-Category/var2'),
      makeReport('B-Category/var3'),
    ]
    const opts = getFilterOptions(reports)
    expect(opts.categories).toEqual(['A-Category', 'B-Category'])
  })

  it('excludes ISL/OSL values of zero', () => {
    const reports = [makeReport('Cat/var', { isl: 0, osl: 0 })]
    const opts = getFilterOptions(reports)
    expect(opts.islValues).toEqual([])
    expect(opts.oslValues).toEqual([])
  })

  it('returns sorted ISL and OSL values', () => {
    const reports = [
      makeReport('Cat/v1', { isl: 3048, osl: 1000 }),
      makeReport('Cat/v2', { isl: 2148, osl: 100 }),
      makeReport('Cat/v3', { isl: 2348, osl: 300 }),
    ]
    const opts = getFilterOptions(reports)
    expect(opts.islValues).toEqual([2148, 2348, 3048])
    expect(opts.oslValues).toEqual([100, 300, 1000])
  })
})

// ---------------------------------------------------------------------------
// buildHeatmapData
// ---------------------------------------------------------------------------
describe('buildHeatmapData', () => {
  it('returns empty array for empty input', () => {
    expect(buildHeatmapData([], 'throughput')).toEqual([])
  })

  it('skips reports with ISL=0 or OSL=0', () => {
    const reports = [makeReport('Cat/var', { isl: 0, osl: 100 })]
    expect(buildHeatmapData(reports, 'throughput')).toEqual([])
  })

  it('returns cells with correct ISL/OSL and averaged values', () => {
    const reports = [
      makeReport('Cat/var', { isl: 100, osl: 50, throughput: 200, qps: 10 }),
      makeReport('Cat/var', { isl: 100, osl: 50, throughput: 400, qps: 20 }),
    ]
    const cells = buildHeatmapData(reports, 'throughput')
    expect(cells).toHaveLength(1)
    expect(cells[0].isl).toBe(100)
    expect(cells[0].osl).toBe(50)
    expect(cells[0].value).toBe(300) // avg of 200, 400
  })

  it('applies category filter', () => {
    const reports = [
      makeReport('A/var', { isl: 100, osl: 50 }),
      makeReport('B/var', { isl: 200, osl: 100 }),
    ]
    const cells = buildHeatmapData(reports, 'throughput', { category: 'A' })
    expect(cells).toHaveLength(1)
    expect(cells[0].isl).toBe(100)
  })

  it('applies variant filter', () => {
    const reports = [
      makeReport('Cat/v1', { isl: 100, osl: 50 }),
      makeReport('Cat/v2', { isl: 200, osl: 100 }),
    ]
    const cells = buildHeatmapData(reports, 'throughput', { variant: 'v1' })
    expect(cells).toHaveLength(1)
  })

  it('applies qps filter', () => {
    const reports = [
      makeReport('Cat/var', { isl: 100, osl: 50, qps: 5 }),
      makeReport('Cat/var', { isl: 100, osl: 50, qps: 10 }),
    ]
    const cells = buildHeatmapData(reports, 'throughput', { qps: 5 })
    expect(cells).toHaveLength(1)
  })

  it('supports ttftP50Ms metric', () => {
    const reports = [makeReport('Cat/var', { isl: 100, osl: 50, ttft: 0.05 })]
    const cells = buildHeatmapData(reports, 'ttftP50Ms')
    expect(cells).toHaveLength(1)
    expect(cells[0].value).toBeCloseTo(50) // 0.05 * 1000
  })

  it('supports p99LatencyMs metric', () => {
    const reports = [makeReport('Cat/var', { isl: 100, osl: 50, p99: 0.5 })]
    const cells = buildHeatmapData(reports, 'p99LatencyMs')
    expect(cells).toHaveLength(1)
    expect(cells[0].value).toBeCloseTo(500) // 0.5 * 1000
  })
})

describe('getFilterOptions', () => {
  const makeFilterReport = (eid: string) => ({
    run: { eid },
    scenario: {
      stack: [],
      load: { standardized: { rate_qps: 10, input_seq_len: { value: 100 }, output_seq_len: { value: 50 } } },
    },
    results: {
      request_performance: {
        aggregate: {
          latency: {},
          throughput: {},
          requests: { total: 10, failures: 0 },
        },
      },
    },
  })

  it('returns empty arrays for empty input', () => {
    const opts = getFilterOptions([])
    expect(opts.categories).toEqual([])
  })

  it('extracts unique categories', () => {
    const reports = [
      makeFilterReport('Cat A/var1'),
      makeFilterReport('Cat A/var2'),
      makeFilterReport('Cat B/var3'),
    ]
    const opts = getFilterOptions(reports as Parameters<typeof getFilterOptions>[0])
    expect(opts.categories).toContain('Cat A')
    expect(opts.categories).toContain('Cat B')
    expect(opts.categories.length).toBe(2)
  })
})

describe('buildHeatmapData', () => {
  it('returns object for empty input', () => {
    const result = buildHeatmapData([])
    expect(result).toBeDefined()
  })
})

describe('CONFIG_TYPE_COLORS', () => {
  it('has colors for standalone, disaggregated, scheduling', () => {
    expect(CONFIG_TYPE_COLORS).toHaveProperty('standalone')
    expect(CONFIG_TYPE_COLORS).toHaveProperty('disaggregated')
    expect(CONFIG_TYPE_COLORS).toHaveProperty('scheduling')
  })

  it('all colors are valid hex strings', () => {
    for (const [key, color] of Object.entries(CONFIG_TYPE_COLORS)) {
      expect(color, `${key} should be a hex color`).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})
