import { describe, it, expect } from 'vitest'
import { CHART_PRESETS, DEFAULT_CHART_KEY, resolveInitialChartKey } from '../ParetoFrontier.presets'

describe('resolveInitialChartKey', () => {
  it('returns the default key when no chartType is provided', () => {
    expect(resolveInitialChartKey()).toBe(DEFAULT_CHART_KEY)
    expect(resolveInitialChartKey('')).toBe(DEFAULT_CHART_KEY)
  })

  it('matches a preset key contained in chartType', () => {
    expect(resolveInitialChartKey('pareto-gpuScaling')).toBe('gpuScaling')
  })

  it('falls back to the default key for unknown chartType', () => {
    expect(resolveInitialChartKey('unknown')).toBe(DEFAULT_CHART_KEY)
  })
})

describe('CHART_PRESETS', () => {
  it('defines ten presets including the default', () => {
    expect(Object.keys(CHART_PRESETS)).toHaveLength(10)
    expect(CHART_PRESETS[DEFAULT_CHART_KEY]).toBeDefined()
  })
})
