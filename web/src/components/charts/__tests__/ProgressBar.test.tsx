/**
 * Branch-coverage tests for ProgressBar.tsx.
 *
 * Covers ProgressBar (default, striped, gradient variants + thresholds +
 * label/showValue branches), SegmentedProgressBar (legend, title, max
 * auto-sum), and CircularProgress (label, size).
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

vi.mock('../../../lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

import { ProgressBar, SegmentedProgressBar, CircularProgress } from '../ProgressBar'

describe('ProgressBar', () => {
  it('renders default variant with percentage text', () => {
    render(<ProgressBar value={50} max={100} />)
    expect(screen.getByText('50%')).toBeDefined()
  })

  it('hides percentage when showValue=false', () => {
    const { container } = render(<ProgressBar value={50} max={100} showValue={false} />)
    expect(container.textContent).not.toContain('50%')
  })

  it('hides header row when label empty and showValue=false', () => {
    const { container } = render(<ProgressBar value={40} showValue={false} />)
    expect(container.querySelector('.mb-1')).toBeNull()
  })

  it('renders label text', () => {
    render(<ProgressBar value={25} max={100} label="CPU" />)
    expect(screen.getByText('CPU')).toBeDefined()
  })

  it('uses thresholds: green below warning', () => {
    const { container } = render(
      <ProgressBar value={10} max={100} thresholds={{ warning: 60, critical: 80 }} />,
    )
    const bar = container.querySelector('[style*="background"]')
    expect(bar?.getAttribute('style')).toContain('#22c55e')
  })

  it('uses thresholds: yellow at warning', () => {
    const { container } = render(
      <ProgressBar value={70} max={100} thresholds={{ warning: 60, critical: 80 }} />,
    )
    const bar = container.querySelector('[style*="background"]')
    expect(bar?.getAttribute('style')).toContain('#eab308')
  })

  it('uses thresholds: red at critical', () => {
    const { container } = render(
      <ProgressBar value={90} max={100} thresholds={{ warning: 60, critical: 80 }} />,
    )
    const bar = container.querySelector('[style*="background"]')
    expect(bar?.getAttribute('style')).toContain('#ef4444')
  })

  it('uses explicit color over thresholds', () => {
    const { container } = render(
      <ProgressBar value={90} max={100} color="#abcdef" thresholds={{ warning: 60, critical: 80 }} />,
    )
    const bar = container.querySelector('[style*="background"]')
    expect(bar?.getAttribute('style')).toContain('#abcdef')
  })

  it('clamps to 100% when value > max', () => {
    render(<ProgressBar value={200} max={100} />)
    expect(screen.getByText('100%')).toBeDefined()
  })

  it('handles max=0 without NaN', () => {
    render(<ProgressBar value={50} max={0} />)
    expect(screen.getByText('0%')).toBeDefined()
  })

  it('renders striped variant', () => {
    const { container } = render(<ProgressBar value={50} max={100} variant="striped" />)
    const bar = container.querySelector('[style*="background"]')
    expect(bar?.getAttribute('style')).toContain('1rem 1rem')
  })

  it('renders gradient variant', () => {
    const { container } = render(<ProgressBar value={50} max={100} variant="gradient" />)
    const bar = container.querySelector('[style*="background"]')
    expect(bar?.getAttribute('style')).toContain('linear-gradient')
  })

  it('accepts size sm/md/lg', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const { container } = render(<ProgressBar value={50} size={size} />)
      expect(container.firstChild).toBeTruthy()
    }
  })
})

describe('SegmentedProgressBar', () => {
  const segments = [
    { value: 30, color: '#ef4444', label: 'Critical' },
    { value: 20, color: '#eab308', label: 'Warning' },
    { value: 50, color: '#22c55e', label: 'Healthy' },
  ]

  it('renders all segments', () => {
    const { container } = render(<SegmentedProgressBar segments={segments} />)
    const bars = container.querySelectorAll('[style*="width"]')
    expect(bars.length).toBeGreaterThanOrEqual(3)
  })

  it('renders legend when showLegend=true', () => {
    render(<SegmentedProgressBar segments={segments} showLegend />)
    expect(screen.getByText('Critical')).toBeDefined()
    expect(screen.getByText('Healthy')).toBeDefined()
  })

  it('renders title', () => {
    render(<SegmentedProgressBar segments={segments} title="Resource Usage" />)
    expect(screen.getByText('Resource Usage')).toBeDefined()
  })

  it('uses explicit max when provided', () => {
    const { container } = render(
      <SegmentedProgressBar segments={[{ value: 25, color: '#aaa' }]} max={100} />,
    )
    const bar = container.querySelector('[style*="25%"]')
    expect(bar).toBeTruthy()
  })

  it('hides legend when showLegend=false', () => {
    const { container } = render(<SegmentedProgressBar segments={segments} showLegend={false} />)
    expect(container.textContent).not.toContain('Critical')
  })

  it('falls back to generated segment labels', () => {
    render(<SegmentedProgressBar segments={[{ value: 10, color: '#aaa' }]} />)
    expect(screen.getByText('Segment 1')).toBeDefined()
  })

  it('handles empty segments by using fallback total', () => {
    const { container } = render(<SegmentedProgressBar segments={[]} />)
    expect(container.querySelectorAll('[style*="width"]').length).toBe(0)
  })
})

describe('CircularProgress', () => {
  it('renders percentage text in the center', () => {
    render(<CircularProgress value={75} max={100} />)
    expect(screen.getByText('75%')).toBeDefined()
  })

  it('renders label when provided', () => {
    render(<CircularProgress value={60} max={100} label="Memory" />)
    expect(screen.getByText('Memory')).toBeDefined()
  })

  it('accepts all size variants', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const { container } = render(<CircularProgress value={50} size={size} />)
      expect(container.querySelector('svg')).toBeTruthy()
    }
  })

  it('hides center percentage when showValue=false', () => {
    const { container } = render(<CircularProgress value={75} showValue={false} />)
    expect(container.textContent).not.toContain('75%')
  })

  it('uses formatValue when provided', () => {
    render(<CircularProgress value={15} formatValue={(pct) => `${Math.round(pct)} points`} />)
    expect(screen.getByText('15 points')).toBeDefined()
  })

  it('applies threshold-derived stroke color', () => {
    const { container } = render(
      <CircularProgress value={95} thresholds={{ warning: 60, critical: 90 }} />,
    )
    const circles = container.querySelectorAll('circle')
    expect(circles[1].getAttribute('stroke')).toBe('#ef4444')
  })
})
