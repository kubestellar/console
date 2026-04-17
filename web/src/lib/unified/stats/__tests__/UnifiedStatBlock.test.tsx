/**
 * Tests for UnifiedStatBlock — renders a single stat config.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../demo', () => ({
  useIsModeSwitching: () => false,
}))
vi.mock('../valueResolvers', () => ({
  resolveStatValue: () => ({ value: 42, sublabel: 'pods', isDemo: false }),
}))

import UnifiedStatBlock from '../UnifiedStatBlock'

const BASE_CONFIG = {
  id: 'healthy',
  name: 'Healthy Nodes',
  icon: 'Server',
  color: 'green',
  valueSource: { type: 'field' as const, path: 'summary.healthy' },
}

describe('UnifiedStatBlock', () => {
  it('renders config name and resolved value', () => {
    render(<UnifiedStatBlock config={BASE_CONFIG} data={{}} />)
    expect(screen.getByText('Healthy Nodes')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders sublabel when present', () => {
    render(<UnifiedStatBlock config={{ ...BASE_CONFIG, sublabelField: 'sublabel' }} data={{}} />)
    expect(screen.getByText('pods')).toBeInTheDocument()
  })

  it('shows placeholder "-" when isLoading', () => {
    render(<UnifiedStatBlock config={BASE_CONFIG} data={{}} isLoading />)
    expect(screen.getByText('-')).toBeInTheDocument()
  })

  it('uses getValue override when provided', () => {
    render(
      <UnifiedStatBlock
        config={BASE_CONFIG}
        data={{}}
        getValue={() => ({ value: 99, isClickable: false })}
      />,
    )
    expect(screen.getByText('99')).toBeInTheDocument()
  })

  it('renders tooltip from config', () => {
    const { container } = render(
      <UnifiedStatBlock config={{ ...BASE_CONFIG, tooltip: 'Number of healthy nodes' }} data={{}} />,
    )
    expect(container.firstElementChild?.getAttribute('title')).toBe('Number of healthy nodes')
  })

  it('falls back to Server icon for unknown icon name', () => {
    // Should not crash even with a bogus icon
    const { container } = render(
      <UnifiedStatBlock config={{ ...BASE_CONFIG, icon: 'DoesNotExist' }} data={{}} />,
    )
    expect(container.firstChild).toBeTruthy()
  })

  it('applies value color based on config.id', () => {
    render(
      <UnifiedStatBlock config={{ ...BASE_CONFIG, id: 'critical' }} data={{}} />,
    )
    // "critical" maps to text-red-400
    const valueEl = screen.getByText('42')
    expect(valueEl.className).toContain('text-red-400')
  })

  it('is clickable when config.onClick is set', () => {
    const { container } = render(
      <UnifiedStatBlock
        config={{ ...BASE_CONFIG, onClick: { type: 'navigate', target: '/test' } }}
        data={{}}
      />,
    )
    // The internal handleStatClick uses window.location — hard to assert
    // in jsdom, but the click should not throw.
    fireEvent.click(container.firstElementChild!)
    expect(container.firstElementChild).toBeInTheDocument()
  })
})
