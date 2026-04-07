/**
 * Tests for TreeMap and NestedTreeMap components.
 *
 * Covers:
 * - Rendering with data, empty data
 * - Prop variations: title, colorScale, showLabels, formatValue, height
 * - NestedTreeMap with hierarchical data
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

import { TreeMap, NestedTreeMap } from '../TreeMap'

const SAMPLE_DATA = [
  { name: 'default', value: 45 },
  { name: 'kube-system', value: 30 },
  { name: 'monitoring', value: 20 },
  { name: 'llm-inference', value: 15 },
]

describe('TreeMap', () => {
  it('renders without crashing with empty data', () => {
    const { container } = render(<TreeMap data={[]} />)
    expect(container).toBeTruthy()
  })

  it('renders with sample data', () => {
    const { container } = render(<TreeMap data={SAMPLE_DATA} />)
    expect(container.querySelector('.w-full')).toBeTruthy()
  })

  it('renders title when provided', () => {
    render(<TreeMap data={SAMPLE_DATA} title="Namespace Usage" />)
    expect(screen.getByText('Namespace Usage')).toBeTruthy()
  })

  it('does not render title when not provided', () => {
    const { container } = render(<TreeMap data={SAMPLE_DATA} />)
    expect(container.querySelector('h4')).toBeNull()
  })

  it('renders with custom height', () => {
    const { container } = render(<TreeMap data={SAMPLE_DATA} height={300} />)
    expect(container).toBeTruthy()
  })

  it('renders with custom color scale', () => {
    const { container } = render(
      <TreeMap data={SAMPLE_DATA} colorScale={['#ff0000', '#00ff00', '#0000ff']} />
    )
    expect(container).toBeTruthy()
  })

  it('renders with labels hidden', () => {
    const { container } = render(<TreeMap data={SAMPLE_DATA} showLabels={false} />)
    expect(container).toBeTruthy()
  })

  it('renders with custom formatValue', () => {
    const { container } = render(
      <TreeMap data={SAMPLE_DATA} formatValue={(v) => `${v}GB`} />
    )
    expect(container).toBeTruthy()
  })

  it('renders with per-item custom colors', () => {
    const coloredData = [
      { name: 'A', value: 50, color: '#ff0000' },
      { name: 'B', value: 30, color: '#00ff00' },
    ]
    const { container } = render(<TreeMap data={coloredData} />)
    expect(container).toBeTruthy()
  })

  it('renders with a single data point', () => {
    const { container } = render(<TreeMap data={[{ name: 'Solo', value: 100 }]} />)
    expect(container).toBeTruthy()
  })
})

describe('NestedTreeMap', () => {
  const nestedData = {
    name: 'root',
    value: 100,
    children: [
      { name: 'cluster-a', value: 60, children: [
        { name: 'default', value: 30 },
        { name: 'monitoring', value: 30 },
      ]},
      { name: 'cluster-b', value: 40, children: [
        { name: 'default', value: 25 },
        { name: 'prod', value: 15 },
      ]},
    ],
  }

  it('renders without crashing', () => {
    const { container } = render(<NestedTreeMap data={nestedData} />)
    expect(container).toBeTruthy()
  })

  it('renders title when provided', () => {
    render(<NestedTreeMap data={nestedData} title="Cluster Hierarchy" />)
    expect(screen.getByText('Cluster Hierarchy')).toBeTruthy()
  })

  it('renders with custom height', () => {
    const { container } = render(<NestedTreeMap data={nestedData} height={400} />)
    expect(container).toBeTruthy()
  })

  it('renders with custom formatValue', () => {
    const { container } = render(
      <NestedTreeMap data={nestedData} formatValue={(v) => `${v}MB`} />
    )
    expect(container).toBeTruthy()
  })

  it('renders with data that has no children', () => {
    const flat = { name: 'root', value: 50 }
    const { container } = render(<NestedTreeMap data={flat} />)
    expect(container).toBeTruthy()
  })
})
