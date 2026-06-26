/**
 * Tests for Sparkline and StatWithSparkline components.
 *
 * Covers:
 * - Rendering with data, empty data
 * - Prop variations: color, height, width, fill, showDot
 * - StatWithSparkline: label, value, trend, unit
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

import { Sparkline, StatWithSparkline } from '../Sparkline'

const SAMPLE_DATA = [10, 15, 12, 18, 22, 19, 25, 30, 28, 32]

describe('Sparkline', () => {
  it('renders without crashing with empty data', () => {
    const { container } = render(<Sparkline data={[]} />)
    expect(container).toBeTruthy()
  })

  it('renders with sample data', () => {
    const { container } = render(<Sparkline data={SAMPLE_DATA} />)
    expect(container).toBeTruthy()
  })

  it('renders with custom color', () => {
    const { container } = render(<Sparkline data={SAMPLE_DATA} color="#3b82f6" />)
    expect(container).toBeTruthy()
  })

  it('renders with custom height', () => {
    const { container } = render(<Sparkline data={SAMPLE_DATA} height={50} />)
    expect(container).toBeTruthy()
  })

  it('renders with custom width', () => {
    const { container } = render(<Sparkline data={SAMPLE_DATA} width={100} />)
    expect(container).toBeTruthy()
  })

  it('renders with fill enabled', () => {
    const { container } = render(<Sparkline data={SAMPLE_DATA} fill />)
    expect(container).toBeTruthy()
  })

  it('renders with showDot enabled', () => {
    const { container } = render(<Sparkline data={SAMPLE_DATA} showDot />)
    expect(container).toBeTruthy()
  })

  it('renders with single data point', () => {
    const { container } = render(<Sparkline data={[42]} />)
    expect(container).toBeTruthy()
  })
})

describe('StatWithSparkline', () => {
  it('renders label and value', () => {
    render(
      <StatWithSparkline label="CPU Usage" value="85%" data={SAMPLE_DATA} />
    )
    expect(screen.getByText('CPU Usage')).toBeTruthy()
    expect(screen.getByText('85%')).toBeTruthy()
  })

  it('renders positive trend indicator', () => {
    render(
      <StatWithSparkline label="Requests" value={1200} trend={12} data={SAMPLE_DATA} />
    )
    // Should show the percentage
    expect(screen.getByText(/12%/)).toBeTruthy()
  })

  it('renders negative trend indicator', () => {
    render(
      <StatWithSparkline label="Errors" value={5} trend={-8} data={SAMPLE_DATA} />
    )
    expect(screen.getByText(/8%/)).toBeTruthy()
  })

  it('renders without trend', () => {
    const { container } = render(
      <StatWithSparkline label="Pods" value={42} data={SAMPLE_DATA} />
    )
    expect(container).toBeTruthy()
    expect(screen.getByText('42')).toBeTruthy()
  })

  it('renders with unit', () => {
    render(
      <StatWithSparkline label="Memory" value={8} unit="GB" data={SAMPLE_DATA} />
    )
    expect(screen.getByText('GB')).toBeTruthy()
  })

  it('renders with custom color', () => {
    const { container } = render(
      <StatWithSparkline label="Test" value={1} data={SAMPLE_DATA} color="#ef4444" />
    )
    expect(container).toBeTruthy()
  })

  it('renders with numeric value', () => {
    render(
      <StatWithSparkline label="Count" value={9999} data={SAMPLE_DATA} />
    )
    expect(screen.getByText('9999')).toBeTruthy()
  })
})
