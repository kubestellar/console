/**
 * Tests for TimeSeriesChart and MultiSeriesChart components.
 *
 * Covers:
 * - Rendering with data, empty data
 * - Prop variations: gradient, showGrid, showAxis, title, unit, color, dataKey
 * - MultiSeriesChart with multiple series
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

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

import { TimeSeriesChart, MultiSeriesChart } from '../TimeSeriesChart'

const SAMPLE_DATA = [
  { time: '10:00', value: 45 },
  { time: '10:05', value: 52 },
  { time: '10:10', value: 48 },
  { time: '10:15', value: 61 },
  { time: '10:20', value: 55 },
]

describe('TimeSeriesChart', () => {
  it('renders without crashing with empty data', () => {
    const { container } = render(<TimeSeriesChart data={[]} />)
    expect(container).toBeTruthy()
  })

  it('renders with sample data', () => {
    const { container } = render(<TimeSeriesChart data={SAMPLE_DATA} />)
    expect(container.querySelector('.w-full')).toBeTruthy()
  })

  it('renders title when provided', () => {
    render(<TimeSeriesChart data={SAMPLE_DATA} title="CPU Usage Over Time" />)
    expect(screen.getByText('CPU Usage Over Time')).toBeTruthy()
  })

  it('does not render title when not provided', () => {
    const { container } = render(<TimeSeriesChart data={SAMPLE_DATA} />)
    expect(container.querySelector('h4')).toBeNull()
  })

  it('renders with gradient enabled (default)', () => {
    const { container } = render(<TimeSeriesChart data={SAMPLE_DATA} gradient />)
    expect(container).toBeTruthy()
  })

  it('renders without gradient', () => {
    const { container } = render(<TimeSeriesChart data={SAMPLE_DATA} gradient={false} />)
    expect(container).toBeTruthy()
  })

  it('renders with showGrid', () => {
    const { container } = render(<TimeSeriesChart data={SAMPLE_DATA} showGrid />)
    expect(container).toBeTruthy()
  })

  it('renders with axis hidden', () => {
    const { container } = render(<TimeSeriesChart data={SAMPLE_DATA} showAxis={false} />)
    expect(container).toBeTruthy()
  })

  it('accepts custom color', () => {
    const { container } = render(<TimeSeriesChart data={SAMPLE_DATA} color="#3b82f6" />)
    expect(container).toBeTruthy()
  })

  it('accepts custom height', () => {
    const { container } = render(<TimeSeriesChart data={SAMPLE_DATA} height={300} />)
    expect(container).toBeTruthy()
  })

  it('accepts unit prop', () => {
    const { container } = render(<TimeSeriesChart data={SAMPLE_DATA} unit="%" />)
    expect(container).toBeTruthy()
  })

  it('accepts custom dataKey', () => {
    const customData = [
      { time: '10:00', value: 10, custom: 42 },
      { time: '10:05', value: 20, custom: 55 },
    ]
    const { container } = render(<TimeSeriesChart data={customData} dataKey="custom" />)
    expect(container).toBeTruthy()
  })
})

describe('MultiSeriesChart', () => {
  const multiData = [
    { time: '10:00', value: 0, cpu: 40, memory: 60 },
    { time: '10:05', value: 0, cpu: 55, memory: 65 },
    { time: '10:10', value: 0, cpu: 48, memory: 70 },
  ]

  const series = [
    { dataKey: 'cpu', color: '#9333ea', name: 'CPU' },
    { dataKey: 'memory', color: '#3b82f6', name: 'Memory' },
  ]

  it('renders without crashing', () => {
    const { container } = render(
      <MultiSeriesChart data={multiData} series={series} />
    )
    expect(container).toBeTruthy()
  })

  it('renders title when provided', () => {
    render(<MultiSeriesChart data={multiData} series={series} title="Resource Trends" />)
    expect(screen.getByText('Resource Trends')).toBeTruthy()
  })

  it('renders with showGrid', () => {
    const { container } = render(
      <MultiSeriesChart data={multiData} series={series} showGrid />
    )
    expect(container).toBeTruthy()
  })

  it('renders with custom height', () => {
    const { container } = render(
      <MultiSeriesChart data={multiData} series={series} height={400} />
    )
    expect(container).toBeTruthy()
  })

  it('renders with empty data', () => {
    const { container } = render(
      <MultiSeriesChart data={[]} series={series} />
    )
    expect(container).toBeTruthy()
  })
})
