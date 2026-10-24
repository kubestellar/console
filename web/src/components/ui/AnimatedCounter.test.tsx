import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnimatedCounter } from './AnimatedCounter'

// Mirrors the module's own constants (TRANSITION_DELAY_MS = 200, exit delay = 150)
// so timer advances below stay in lockstep with the component's internal timing.
const ANIMATION_EXIT_DELAY_MS = 150
const TRANSITION_DELAY_MS = 200

describe('AnimatedCounter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the initial value with no animation class', () => {
    render(<AnimatedCounter value={3} className="badge" />)
    const el = screen.getByText('3')
    expect(el.className).toContain('badge')
    expect(el.className).not.toContain('animate-roll-up')
    expect(el.className).not.toContain('animate-roll-down')
  })

  it('caps the displayed value at 99+', () => {
    render(<AnimatedCounter value={150} />)
    expect(screen.getByText('99+')).toBeTruthy()
  })

  it('animates upward and updates the displayed value after the exit delay', () => {
    const { rerender } = render(<AnimatedCounter value={1} />)
    rerender(<AnimatedCounter value={2} />)

    // Still showing the old value until the exit animation completes.
    expect(screen.getByText('1').className).toContain('animate-roll-up')

    act(() => {
      vi.advanceTimersByTime(ANIMATION_EXIT_DELAY_MS)
    })
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('2').className).toContain('animate-roll-up')

    act(() => {
      vi.advanceTimersByTime(TRANSITION_DELAY_MS)
    })
    expect(screen.getByText('2').className).not.toContain('animate-roll-up')
  })

  it('animates downward when the value decreases', () => {
    const { rerender } = render(<AnimatedCounter value={5} />)
    rerender(<AnimatedCounter value={2} />)

    act(() => {
      vi.advanceTimersByTime(ANIMATION_EXIT_DELAY_MS)
    })
    expect(screen.getByText('2').className).toContain('animate-roll-down')
  })

  it('clears pending timers on unmount without throwing', () => {
    const { rerender, unmount } = render(<AnimatedCounter value={1} />)
    rerender(<AnimatedCounter value={2} />)
    unmount()
    expect(() => vi.runAllTimers()).not.toThrow()
  })
})
