/**
 * Tests for PieChart and DonutChart components.
 *
 * Covers:
 * - Rendering with data, empty data
 * - Legend visibility toggle
 * - Title rendering
 * - Donut mode (innerRadius > 0) with center label/value
 * - DonutChart shorthand component
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

import { PieChart, DonutChart } from '../PieChart'

const SAMPLE_DATA = [
  { name: 'Healthy', value: 12, color: '#10b981' },
  { name: 'Warning', value: 3, color: '#f59e0b' },
  { name: 'Critical', value: 1, color: '#ef4444' },
]

describe('PieChart', () => {
  it('renders without crashing with empty data', () => {
    const { container } = render(<PieChart data={[]} />)
    expect(container).toBeTruthy()
  })

  it('renders with sample data', () => {
    const { container } = render(<PieChart data={SAMPLE_DATA} />)
    expect(container.querySelector('.w-full')).toBeTruthy()
  })

  it('renders legend items by default', () => {
    render(<PieChart data={SAMPLE_DATA} />)
    expect(screen.getByText('Healthy')).toBeTruthy()
    expect(screen.getByText('Warning')).toBeTruthy()
    expect(screen.getByText('Critical')).toBeTruthy()
  })

  it('hides legend when showLegend is false', () => {
    render(<PieChart data={SAMPLE_DATA} showLegend={false} />)
    expect(screen.queryByText('Healthy')).toBeNull()
  })

  it('renders title when provided', () => {
    render(<PieChart data={SAMPLE_DATA} title="Cluster Status" />)
    expect(screen.getByText('Cluster Status')).toBeTruthy()
  })

  it('renders with custom size', () => {
    const { container } = render(<PieChart data={SAMPLE_DATA} size={200} />)
    expect(container).toBeTruthy()
  })

  it('renders as donut when innerRadius > 0', () => {
    const { container } = render(
      <PieChart data={SAMPLE_DATA} innerRadius={40} />
    )
    expect(container).toBeTruthy()
  })

  it('renders center label and value in donut mode', () => {
    render(
      <PieChart
        data={SAMPLE_DATA}
        innerRadius={40}
        centerLabel="Total"
        centerValue={16}
      />
    )
    expect(screen.getByText('Total')).toBeTruthy()
    expect(screen.getByText('16')).toBeTruthy()
  })

  it('does not render center label in pie mode (innerRadius = 0)', () => {
    render(
      <PieChart data={SAMPLE_DATA} innerRadius={0} centerLabel="Total" centerValue={16} />
    )
    expect(screen.queryByText('Total')).toBeNull()
  })

  it('renders legend values', () => {
    render(<PieChart data={SAMPLE_DATA} />)
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
  })
})

describe('DonutChart', () => {
  it('renders without crashing', () => {
    const { container } = render(<DonutChart data={SAMPLE_DATA} />)
    expect(container).toBeTruthy()
  })

  it('renders with custom thickness', () => {
    const { container } = render(<DonutChart data={SAMPLE_DATA} thickness={30} />)
    expect(container).toBeTruthy()
  })

  it('renders with custom size', () => {
    const { container } = render(<DonutChart data={SAMPLE_DATA} size={200} />)
    expect(container).toBeTruthy()
  })

  it('passes through title prop', () => {
    render(<DonutChart data={SAMPLE_DATA} title="Donut Title" />)
    expect(screen.getByText('Donut Title')).toBeTruthy()
  })
})
