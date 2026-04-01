import { describe, it, expect } from 'vitest'
import { extractExperimentMeta, groupByExperiment, getFilterOptions, buildHeatmapData, CONFIG_TYPE_COLORS } from '../benchmarkDataUtils'

describe('extractExperimentMeta', () => {
  const makeReport = (eid: string, overrides = {}) => ({
    run: { eid },
    scenario: {
      stack: [],
      load: { standardized: { rate_qps: 10, input_seq_len: { value: 2148 }, output_seq_len: { value: 100 } } },
    },
    results: {
      request_performance: {
        aggregate: {
          latency: {},
          throughput: {},
          requests: { total: 100, failures: 0 },
        },
      },
    },
    ...overrides,
  })

  it('extracts category and variant from eid', () => {
    const report = makeReport('Inference Scheduling/queue-scorer')
    const meta = extractExperimentMeta(report as Parameters<typeof extractExperimentMeta>[0])
    expect(meta.category).toBe('Inference Scheduling')
    expect(meta.variant).toBe('queue-scorer')
  })

  it('extracts QPS, ISL, OSL', () => {
    const report = makeReport('Test/variant')
    const meta = extractExperimentMeta(report as Parameters<typeof extractExperimentMeta>[0])
    expect(meta.qps).toBe(10)
    expect(meta.isl).toBe(2148)
    expect(meta.osl).toBe(100)
  })

  it('handles empty eid', () => {
    const report = makeReport('')
    const meta = extractExperimentMeta(report as Parameters<typeof extractExperimentMeta>[0])
    expect(meta.category).toBe('')
  })

  it('detects standalone config', () => {
    const report = makeReport('PD/setup_standalone_1_4', {
      scenario: {
        stack: [{ standardized: { role: 'replica', kind: 'other' } }],
        load: { standardized: { rate_qps: 5, input_seq_len: { value: 100 }, output_seq_len: { value: 50 } } },
      },
    })
    const meta = extractExperimentMeta(report as Parameters<typeof extractExperimentMeta>[0])
    expect(meta.config).toBe('standalone')
  })
})

describe('groupByExperiment', () => {
  it('returns empty array for empty input', () => {
    expect(groupByExperiment([])).toEqual([])
  })

  it('filters out reports with zero QPS', () => {
    const report = {
      run: { eid: 'Cat/var' },
      scenario: {
        stack: [],
        load: { standardized: { rate_qps: 0, input_seq_len: { value: 100 }, output_seq_len: { value: 50 } } },
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
    }
    const groups = groupByExperiment([report] as Parameters<typeof groupByExperiment>[0])
    expect(groups).toHaveLength(0)
  })

  it('groups multiple reports with same category/variant', () => {
    const makeGroupReport = (qps: number) => ({
      run: { eid: 'Cat/var' },
      scenario: {
        stack: [],
        load: { standardized: { rate_qps: qps, input_seq_len: { value: 100 }, output_seq_len: { value: 50 } } },
      },
      results: {
        request_performance: {
          aggregate: {
            latency: { ttft_ms: { p50: 50 }, tpot_ms: { p50: 20 }, itl_ms: { p50: 10 }, e2e_latency_ms: { p99: 200 } },
            throughput: { output_tokens_per_s: 100 },
            requests: { total: 100, failures: 0, request_rate: qps, mean_latency_ms: 80 },
          },
        },
      },
    })

    const groups = groupByExperiment([
      makeGroupReport(5),
      makeGroupReport(10),
    ] as Parameters<typeof groupByExperiment>[0])

    expect(groups.length).toBeGreaterThanOrEqual(1)
    const group = groups[0]
    expect(group.category).toBe('Cat')
    expect(group.variant).toBe('var')
    expect(group.points.length).toBeGreaterThanOrEqual(1)
    expect(group.color).toMatch(/^#/)
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
