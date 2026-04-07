/**
 * Tests for RadarChart and MultiRadarChart components.
 *
 * Covers:
 * - Rendering with data, empty data
 * - Prop variations: color, fillOpacity, size, showGrid, showAxis, title, dataKey
 * - MultiRadarChart with multiple series
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

import { RadarChart, MultiRadarChart } from '../RadarChart'

const SAMPLE_DATA = [
  { name: 'CPU', value: 85 },
  { name: 'Memory', value: 72 },
  { name: 'Disk', value: 60 },
  { name: 'Network', value: 90 },
  { name: 'GPU', value: 45 },
]

describe('RadarChart', () => {
  it('renders without crashing with empty data', () => {
    const { container } = render(<RadarChart data={[]} />)
    expect(container).toBeTruthy()
  })

  it('renders with sample data', () => {
    const { container } = render(<RadarChart data={SAMPLE_DATA} />)
    expect(container.querySelector('.w-full')).toBeTruthy()
  })

  it('renders title when provided', () => {
    render(<RadarChart data={SAMPLE_DATA} title="Resource Overview" />)
    expect(screen.getByText('Resource Overview')).toBeTruthy()
  })

  it('does not render title when not provided', () => {
    const { container } = render(<RadarChart data={SAMPLE_DATA} />)
    expect(container.querySelector('h4')).toBeNull()
  })

  it('renders with custom color', () => {
    const { container } = render(<RadarChart data={SAMPLE_DATA} color="#3b82f6" />)
    expect(container).toBeTruthy()
  })

  it('renders with custom fillOpacity', () => {
    const { container } = render(<RadarChart data={SAMPLE_DATA} fillOpacity={0.5} />)
    expect(container).toBeTruthy()
  })

  it('renders with custom size', () => {
    const { container } = render(<RadarChart data={SAMPLE_DATA} size={300} />)
    expect(container).toBeTruthy()
  })

  it('renders with showGrid disabled', () => {
    const { container } = render(<RadarChart data={SAMPLE_DATA} showGrid={false} />)
    expect(container).toBeTruthy()
  })

  it('renders with showAxis disabled', () => {
    const { container } = render(<RadarChart data={SAMPLE_DATA} showAxis={false} />)
    expect(container).toBeTruthy()
  })

  it('renders with custom dataKey', () => {
    const customData = [
      { name: 'A', value: 0, score: 80 },
      { name: 'B', value: 0, score: 60 },
      { name: 'C', value: 0, score: 90 },
    ]
    const { container } = render(<RadarChart data={customData} dataKey="score" />)
    expect(container).toBeTruthy()
  })

  it('renders with fullMark values', () => {
    const dataWithMarks = [
      { name: 'CPU', value: 85, fullMark: 100 },
      { name: 'Memory', value: 72, fullMark: 128 },
      { name: 'Disk', value: 200, fullMark: 500 },
    ]
    const { container } = render(<RadarChart data={dataWithMarks} />)
    expect(container).toBeTruthy()
  })
})

describe('MultiRadarChart', () => {
  const multiData = [
    { name: 'CPU', value: 0, prod: 85, staging: 60 },
    { name: 'Memory', value: 0, prod: 72, staging: 55 },
    { name: 'Disk', value: 0, prod: 60, staging: 40 },
    { name: 'Network', value: 0, prod: 90, staging: 70 },
  ]

  const series = [
    { dataKey: 'prod', color: '#9333ea', name: 'Production' },
    { dataKey: 'staging', color: '#3b82f6', name: 'Staging' },
  ]

  it('renders without crashing', () => {
    const { container } = render(
      <MultiRadarChart data={multiData} series={series} />
    )
    expect(container).toBeTruthy()
  })

  it('renders title when provided', () => {
    render(
      <MultiRadarChart data={multiData} series={series} title="Environment Comparison" />
    )
    expect(screen.getByText('Environment Comparison')).toBeTruthy()
  })

  it('renders with custom size', () => {
    const { container } = render(
      <MultiRadarChart data={multiData} series={series} size={300} />
    )
    expect(container).toBeTruthy()
  })

  it('renders with showGrid disabled', () => {
    const { container } = render(
      <MultiRadarChart data={multiData} series={series} showGrid={false} />
    )
    expect(container).toBeTruthy()
  })

  it('renders with legend hidden', () => {
    const { container } = render(
      <MultiRadarChart data={multiData} series={series} showLegend={false} />
    )
    expect(container).toBeTruthy()
  })

  it('renders with empty data', () => {
    const { container } = render(
      <MultiRadarChart data={[]} series={series} />
    )
    expect(container).toBeTruthy()
  })
})
