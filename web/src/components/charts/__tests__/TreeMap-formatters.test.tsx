/**
 * Tests for TreeMap and NestedTreeMap ECharts formatter callbacks.
 *
 * The base TreeMap.test.tsx renders the components but ECharts never invokes
 * the formatter functions in jsdom. This file mocks echarts-for-react to
 * capture the option prop, then calls the formatters directly to cover
 * lines 75-78, 124, 145-159 of TreeMap.tsx.
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

// Capture ECharts option props so we can invoke the formatter callbacks
const capturedOptions: unknown[] = []
vi.mock('echarts-for-react', () => ({
  default: ({ option }: { option: unknown; children?: ReactNode }) => {
    capturedOptions.push(option)
    return null
  },
}))

import { TreeMap, NestedTreeMap } from '../TreeMap'

type EChartsOption = {
  tooltip?: { formatter?: (params: { name: string; value: number }) => string }
  series?: Array<{
    label?: { formatter?: (params: { name: string; value: number }) => string }
  }>
}

function getLastOption(): EChartsOption {
  return capturedOptions[capturedOptions.length - 1] as EChartsOption
}

const SAMPLE_DATA = [
  { name: 'default', value: 45 },
  { name: 'kube-system', value: 30 },
  { name: 'a-very-long-namespace-name-exceeds-limit', value: 10 },
]

const NESTED_DATA = {
  name: 'root',
  value: 100,
  children: [
    { name: 'cluster-a', value: 60, children: [
      { name: 'default', value: 30 },
      { name: 'monitoring', value: 30 },
    ]},
    { name: 'cluster-b', value: 40 },
  ],
}

describe('TreeMap formatter callbacks', () => {
  it('label.formatter returns rich-text for short name', () => {
    capturedOptions.length = 0
    render(<TreeMap data={SAMPLE_DATA} />)
    const option = getLastOption()
    const formatter = option.series?.[0]?.label?.formatter
    expect(typeof formatter).toBe('function')
    const result = formatter!({ name: 'default', value: 45 })
    expect(result).toContain('default')
    expect(result).toContain('45')
    expect(result).toContain('{name|')
    expect(result).toContain('{value|')
  })

  it('label.formatter truncates names longer than 15 chars', () => {
    capturedOptions.length = 0
    render(<TreeMap data={SAMPLE_DATA} />)
    const formatter = getLastOption().series?.[0]?.label?.formatter!
    const longName = 'a-very-long-namespace-name-exceeds-limit'
    const result = formatter({ name: longName, value: 10 })
    expect(result).toContain('...')
    // Only first 12 chars shown
    expect(result).toContain(longName.slice(0, 12))
  })

  it('label.formatter uses custom formatValue', () => {
    capturedOptions.length = 0
    render(<TreeMap data={SAMPLE_DATA} formatValue={(v) => `${v}GB`} />)
    const formatter = getLastOption().series?.[0]?.label?.formatter!
    const result = formatter({ name: 'default', value: 45 })
    expect(result).toContain('45GB')
  })

  it('tooltip.formatter returns plain text', () => {
    capturedOptions.length = 0
    render(<TreeMap data={SAMPLE_DATA} />)
    const formatter = getLastOption().tooltip?.formatter
    expect(typeof formatter).toBe('function')
    const result = formatter!({ name: 'default', value: 45 })
    expect(result).toBe('default: 45')
  })

  it('tooltip.formatter uses custom formatValue', () => {
    capturedOptions.length = 0
    render(<TreeMap data={SAMPLE_DATA} formatValue={(v) => `${v}%`} />)
    const formatter = getLastOption().tooltip?.formatter!
    expect(formatter({ name: 'kube-system', value: 30 })).toBe('kube-system: 30%')
  })
})

describe('NestedTreeMap formatter callbacks', () => {
  it('tooltip.formatter returns name: value string', () => {
    capturedOptions.length = 0
    render(<NestedTreeMap data={NESTED_DATA} />)
    const formatter = getLastOption().tooltip?.formatter
    expect(typeof formatter).toBe('function')
    const result = formatter!({ name: 'cluster-a', value: 60 })
    expect(result).toBe('cluster-a: 60')
  })

  it('tooltip.formatter uses custom formatValue', () => {
    capturedOptions.length = 0
    render(<NestedTreeMap data={NESTED_DATA} formatValue={(v) => `${v}ms`} />)
    const formatter = getLastOption().tooltip?.formatter!
    expect(formatter({ name: 'default', value: 30 })).toBe('default: 30ms')
  })

  it('label.formatter returns rich-text for short name', () => {
    capturedOptions.length = 0
    render(<NestedTreeMap data={NESTED_DATA} />)
    const formatter = getLastOption().series?.[0]?.label?.formatter!
    expect(typeof formatter).toBe('function')
    const result = formatter({ name: 'monitoring', value: 30 })
    expect(result).toContain('monitoring')
    expect(result).toContain('{name|')
    expect(result).toContain('{value|')
  })

  it('label.formatter truncates long names', () => {
    capturedOptions.length = 0
    render(<NestedTreeMap data={NESTED_DATA} />)
    const formatter = getLastOption().series?.[0]?.label?.formatter!
    const result = formatter({ name: 'a-very-long-namespace-name', value: 5 })
    expect(result).toContain('...')
  })

  it('renders with no children (flat data)', () => {
    capturedOptions.length = 0
    const flat = { name: 'solo', value: 100 }
    render(<NestedTreeMap data={flat} />)
    // Should not crash — no children to color
    const option = getLastOption()
    expect(option).toBeTruthy()
  })

  it('assignColors recurses into nested children', () => {
    capturedOptions.length = 0
    const deep = {
      name: 'root',
      value: 100,
      children: [
        {
          name: 'parent',
          value: 80,
          children: [
            { name: 'child-a', value: 40 },
            { name: 'child-b', value: 40 },
          ],
        },
      ],
    }
    render(<NestedTreeMap data={deep} />)
    const option = getLastOption()
    expect(option).toBeTruthy()
  })
})
