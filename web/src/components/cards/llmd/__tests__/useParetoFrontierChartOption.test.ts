import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useParetoFrontierChartOption } from '../useParetoFrontierChartOption'
import { CHART_PRESETS } from '../ParetoFrontier.presets'
import type { ParetoPoint } from '../../../../lib/llmd/benchmarkMockData'

function makePoint(overrides: Partial<ParetoPoint> = {}): ParetoPoint {
  return {
    uid: 'p1',
    hardware: 'H100',
    model: 'llama-3-70b',
    framework: 'vllm',
    hardwareMemory: 80,
    config: 'standalone',
    seqLen: '1k/1k',
    gpuCount: 4,
    throughputPerGpu: 1200,
    ttftP50Ms: 150,
    tpotP50Ms: 20,
    p99LatencyMs: 900,
    requestRate: 10,
    powerPerGpuKw: 1.2,
    tcoPerGpuHr: 2.5,
    ...overrides,
  }
}

const preset = CHART_PRESETS.throughputVsLatency

function baseParams() {
  const a = makePoint({ uid: 'a' })
  const b = makePoint({ uid: 'b', ttftP50Ms: 300, throughputPerGpu: 1500 })
  return {
    seriesMap: new Map<string, ParetoPoint[]>([['H100', [a, b]]]),
    frontier: [a, b],
    hideNonOptimal: false,
    hideLabels: false,
    highContrast: true,
    hiddenHw: new Set<string>(),
    preset,
  }
}

describe('useParetoFrontierChartOption', () => {
  it('builds one series per hardware plus the dashed frontier', () => {
    const { result } = renderHook(() => useParetoFrontierChartOption(baseParams()))
    const names = result.current.series.map(s => s.name)
    expect(names).toEqual(['H100', 'Pareto Frontier'])
    expect(result.current.series[0].data).toHaveLength(2)
    expect(result.current.series[0].symbolSize).toBe(10)
  })

  it('omits the frontier series when hideNonOptimal is set', () => {
    const { result } = renderHook(() =>
      useParetoFrontierChartOption({ ...baseParams(), hideNonOptimal: true }),
    )
    expect(result.current.series.map(s => s.name)).toEqual(['H100'])
  })

  it('skips hidden hardware series and applies low-contrast styling', () => {
    const { result } = renderHook(() =>
      useParetoFrontierChartOption({ ...baseParams(), hiddenHw: new Set(['H100']), highContrast: false }),
    )
    expect(result.current.series.map(s => s.name)).toEqual(['Pareto Frontier'])
  })

  it('uses the preset axis labels and units', () => {
    const { result } = renderHook(() => useParetoFrontierChartOption(baseParams()))
    expect(result.current.xAxis.name).toBe(`${preset.xAxis.label} (${preset.xAxis.unit})`)
    expect(result.current.yAxis.name).toBe(`${preset.yAxis.label} (${preset.yAxis.unit})`)
  })

  it('tooltip formatter renders point details and returns empty without a point', () => {
    const { result } = renderHook(() => useParetoFrontierChartOption(baseParams()))
    const fmt = result.current.tooltip.formatter
    expect(fmt({})).toBe('')
    const html = fmt({ data: { point: makePoint() } })
    expect(html).toContain('standalone')
    expect(html).toContain('1200 tok/s')
  })
})
