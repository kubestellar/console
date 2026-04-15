import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Tooltip } from '../Tooltip'

describe('Tooltip', () => {
  it('renders children', () => {
    render(
      <Tooltip content="Helpful text">
        <button>Trigger</button>
      </Tooltip>,
    )
    expect(screen.getByRole('button', { name: 'Trigger' })).toBeTruthy()
  })

  it('applies aria-describedby on the wrapper and matches the tooltip id', () => {
    render(
      <Tooltip content="Helpful text">
        <button>Trigger</button>
      </Tooltip>,
    )
    // The wrapper <span> carries aria-describedby pointing at the tooltip bubble.
    const trigger = screen.getByRole('button', { name: 'Trigger' })
    const wrapper = trigger.parentElement as HTMLElement
    const describedBy = wrapper.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()

    const tooltipBubble = screen.getByRole('tooltip')
    expect(tooltipBubble.id).toBe(describedBy)
    expect(tooltipBubble.textContent).toBe('Helpful text')
  })

  it('skips the wrapper when disabled=true', () => {
    render(
      <Tooltip content="Helpful text" disabled>
        <button>Trigger</button>
      </Tooltip>,
    )
    // No tooltip bubble should be rendered.
    expect(screen.queryByRole('tooltip')).toBeNull()
    // The button should be present without an aria-describedby wrapper.
    const trigger = screen.getByRole('button', { name: 'Trigger' })
    const parent = trigger.parentElement as HTMLElement
    // Either no wrapper, or the wrapper lacks aria-describedby (not added by Tooltip).
    expect(parent?.getAttribute('aria-describedby')).toBeNull()
  })

  it('skips the wrapper when content is empty', () => {
    render(
      <Tooltip content="">
        <button>Trigger</button>
      </Tooltip>,
    )
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('renders on all four sides with the correct position classes', () => {
    const sides = ['top', 'bottom', 'left', 'right'] as const
    const expected: Record<(typeof sides)[number], string> = {
      top: 'bottom-full',
      bottom: 'top-full',
      left: 'right-full',
      right: 'left-full',
    }

    for (const side of sides) {
      const { unmount } = render(
        <Tooltip content={`on ${side}`} side={side}>
          <button>{`btn-${side}`}</button>
        </Tooltip>,
      )
      const bubble = screen.getByRole('tooltip')
      expect(bubble.className).toContain(expected[side])
      unmount()
    }
  })
})
