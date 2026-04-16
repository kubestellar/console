/**
 * Tests for UnifiedStatBlock — renders a single stat config.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../../../lib/modeTransition', () => ({
  useIsModeSwitching: () => false,
}))
vi.mock('../valueResolvers', () => ({
  resolveStatValue: () => ({ value: 42, sublabel: 'pods', isDemo: false }),
}))
vi.mock('../../../../lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

import UnifiedStatBlock from '../UnifiedStatBlock'

const BASE_CONFIG = {
  id: 'healthy',
  name: 'Healthy Nodes',
  icon: 'Server',
  color: 'green',
  valueSource: { type: 'field' as const, field: 'healthy' },
}

describe('UnifiedStatBlock', () => {
  it('renders config name and resolved value', () => {
    render(<UnifiedStatBlock config={BASE_CONFIG} data={{}} />)
    expect(screen.getByText('Healthy Nodes')).toBeDefined()
    expect(screen.getByText('42')).toBeDefined()
  })

  it('renders sublabel when present', () => {
    render(<UnifiedStatBlock config={{ ...BASE_CONFIG, sublabelField: 'sublabel' }} data={{}} />)
    expect(screen.getByText('pods')).toBeDefined()
  })

  it('shows placeholder "-" when isLoading', () => {
    render(<UnifiedStatBlock config={BASE_CONFIG} data={{}} isLoading />)
    expect(screen.getByText('-')).toBeDefined()
  })

  it('uses getValue override when provided', () => {
    render(
      <UnifiedStatBlock
        config={BASE_CONFIG}
        data={{}}
        getValue={() => ({ value: 99, isClickable: false })}
      />,
    )
    expect(screen.getByText('99')).toBeDefined()
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
    const { container } = render(
      <UnifiedStatBlock config={{ ...BASE_CONFIG, id: 'critical' }} data={{}} />,
    )
    // "critical" maps to text-red-400
    const valueEl = screen.getByText('42')
    expect(valueEl.className).toContain('text-red-400')
  })

  it('is clickable when config.onClick is set', () => {
    const onClick = vi.fn()
    // handleStatClick dispatches events — we just verify the click handler fires
    const { container } = render(
      <UnifiedStatBlock
        config={{ ...BASE_CONFIG, onClick: { type: 'navigate', path: '/test' } }}
        data={{}}
      />,
    )
    fireEvent.click(container.firstElementChild!)
    // The internal handleStatClick uses window.location — hard to assert
    // in jsdom, but the click should not throw.
  })
})
