import { describe, it, expect } from 'vitest'
import { extractExperimentMeta, groupByExperiment } from '../benchmarkDataUtils'

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
})
