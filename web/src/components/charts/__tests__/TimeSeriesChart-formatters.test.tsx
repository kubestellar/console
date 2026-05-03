/**
 * Tests for TimeSeriesChart ECharts formatter callbacks.
 *
 * The base TimeSeriesChart.test.tsx renders components but ECharts never
 * invokes formatter functions in jsdom. This file mocks echarts-for-react
 * to capture the option prop, then calls the formatters directly to cover
 * lines 66-78 (yAxis formatter + tooltip formatter) of TimeSeriesChart.tsx.
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
}))

vi.mock('../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

// Capture the ECharts option so formatters can be invoked directly
const capturedOptions: unknown[] = []
vi.mock('echarts-for-react', () => ({
  default: ({ option }: { option: unknown; children?: ReactNode }) => {
    capturedOptions.push(option)
    return null
  },
}))

import { TimeSeriesChart } from '../TimeSeriesChart'

type SeriesOption = {
  label?: { formatter?: (p: { name: string; value: number }) => string }
}
type EChartsOption = {
  yAxis?: { axisLabel?: { formatter?: (v: number) => string } }
  tooltip?: { formatter?: (params: Array<{ name: string; value: number }> | { name: string; value: number }) => string }
  series?: SeriesOption[]
}

function renderAndGetOption(props?: Partial<Parameters<typeof TimeSeriesChart>[0]>): EChartsOption {
  capturedOptions.length = 0
  const data = [
    { time: '10:00', value: 45 },
    { time: '10:05', value: 52 },
  ]
  render(<TimeSeriesChart data={data} {...props} />)
  return capturedOptions[capturedOptions.length - 1] as EChartsOption
}

describe('TimeSeriesChart yAxis formatter', () => {
  it('returns plain value when unit is empty', () => {
    const option = renderAndGetOption({ unit: '' })
    const fmt = option.yAxis?.axisLabel?.formatter!
    expect(typeof fmt).toBe('function')
    expect(fmt(42)).toBe('42')
  })

  it('appends unit to value', () => {
    const option = renderAndGetOption({ unit: 'ms' })
    const fmt = option.yAxis?.axisLabel?.formatter!
    expect(fmt(100)).toBe('100ms')
  })

  it('handles zero value', () => {
    const option = renderAndGetOption({ unit: '%' })
    const fmt = option.yAxis?.axisLabel?.formatter!
    expect(fmt(0)).toBe('0%')
  })
})

describe('TimeSeriesChart tooltip formatter', () => {
  it('returns HTML with time and value for array params', () => {
    const option = renderAndGetOption({ unit: '' })
    const fmt = option.tooltip?.formatter!
    expect(typeof fmt).toBe('function')
    const result = fmt([{ name: '10:00', value: 45 }])
    expect(result).toContain('10:00')
    expect(result).toContain('45')
  })

  it('appends unit to tooltip value', () => {
    const option = renderAndGetOption({ unit: 'GB' })
    const fmt = option.tooltip?.formatter!
    const result = fmt([{ name: '10:05', value: 52 }])
    expect(result).toContain('52GB')
  })

  it('handles non-array params (single point)', () => {
    const option = renderAndGetOption({ unit: 'ms' })
    const fmt = option.tooltip?.formatter!
    // Formatter accepts Array or single object
    const result = fmt({ name: '10:00', value: 99 } as unknown as Array<{ name: string; value: number }>)
    expect(result).toContain('99ms')
  })
})
