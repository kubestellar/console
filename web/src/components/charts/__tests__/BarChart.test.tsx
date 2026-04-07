/**
 * Tests for BarChart and StackedBarChart components.
 *
 * Covers:
 * - Rendering with data, empty data, single item
 * - Prop variations: horizontal, showGrid, title, unit, color, custom colors
 * - StackedBarChart rendering with categories
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

import { BarChart, StackedBarChart } from '../BarChart'

const SAMPLE_DATA = [
  { name: 'Cluster A', value: 85 },
  { name: 'Cluster B', value: 62 },
  { name: 'Cluster C', value: 45 },
]

describe('BarChart', () => {
  it('renders without crashing with empty data', () => {
    const { container } = render(<BarChart data={[]} />)
    expect(container).toBeTruthy()
  })

  it('renders with sample data', () => {
    const { container } = render(<BarChart data={SAMPLE_DATA} />)
    expect(container.querySelector('.w-full')).toBeTruthy()
  })

  it('renders title when provided', () => {
    render(<BarChart data={SAMPLE_DATA} title="GPU Usage by Cluster" />)
    expect(screen.getByText('GPU Usage by Cluster')).toBeTruthy()
  })

  it('does not render title when not provided', () => {
    const { container } = render(<BarChart data={SAMPLE_DATA} />)
    expect(container.querySelector('h4')).toBeNull()
  })

  it('renders in horizontal mode', () => {
    const { container } = render(<BarChart data={SAMPLE_DATA} horizontal />)
    expect(container).toBeTruthy()
  })

  it('accepts custom color', () => {
    const { container } = render(<BarChart data={SAMPLE_DATA} color="#3b82f6" />)
    expect(container).toBeTruthy()
  })

  it('renders with per-item colors', () => {
    const coloredData = [
      { name: 'A', value: 10, color: '#ff0000' },
      { name: 'B', value: 20, color: '#00ff00' },
    ]
    const { container } = render(<BarChart data={coloredData} />)
    expect(container).toBeTruthy()
  })

  it('renders with custom height', () => {
    const { container } = render(<BarChart data={SAMPLE_DATA} height={400} />)
    expect(container).toBeTruthy()
  })

  it('renders with showGrid enabled', () => {
    const { container } = render(<BarChart data={SAMPLE_DATA} showGrid />)
    expect(container).toBeTruthy()
  })

  it('renders with unit prop', () => {
    const { container } = render(<BarChart data={SAMPLE_DATA} unit="%" />)
    expect(container).toBeTruthy()
  })

  it('renders with a single data point', () => {
    const { container } = render(<BarChart data={[{ name: 'Solo', value: 100 }]} />)
    expect(container).toBeTruthy()
  })
})

describe('StackedBarChart', () => {
  const stackedData = [
    { name: 'Jan', cpu: 40, memory: 30, gpu: 20 },
    { name: 'Feb', cpu: 50, memory: 35, gpu: 25 },
    { name: 'Mar', cpu: 45, memory: 40, gpu: 30 },
  ]

  const categories = [
    { dataKey: 'cpu', color: '#9333ea', name: 'CPU' },
    { dataKey: 'memory', color: '#3b82f6', name: 'Memory' },
    { dataKey: 'gpu', color: '#10b981', name: 'GPU' },
  ]

  it('renders without crashing', () => {
    const { container } = render(
      <StackedBarChart data={stackedData} categories={categories} />
    )
    expect(container).toBeTruthy()
  })

  it('renders title when provided', () => {
    render(
      <StackedBarChart data={stackedData} categories={categories} title="Resource Usage" />
    )
    expect(screen.getByText('Resource Usage')).toBeTruthy()
  })

  it('renders with custom xAxisKey', () => {
    const { container } = render(
      <StackedBarChart data={stackedData} categories={categories} xAxisKey="name" />
    )
    expect(container).toBeTruthy()
  })

  it('renders with custom height', () => {
    const { container } = render(
      <StackedBarChart data={stackedData} categories={categories} height={300} />
    )
    expect(container).toBeTruthy()
  })

  it('renders with empty data', () => {
    const { container } = render(
      <StackedBarChart data={[]} categories={categories} />
    )
    expect(container).toBeTruthy()
  })
})
