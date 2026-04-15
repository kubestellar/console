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

  it('applies aria-describedby to the trigger child, not the wrapper', () => {
    render(
      <Tooltip content="Helpful text">
        <button data-testid="trigger">Trigger</button>
      </Tooltip>,
    )
    // The aria-describedby now lives on the actual focusable child so
    // screen readers announce the description when the trigger is focused.
    const trigger = screen.getByTestId('trigger')
    const bubble = screen.getByRole('tooltip')
    expect(trigger.getAttribute('aria-describedby')).toBe(bubble.id)
    expect(bubble.textContent).toBe('Helpful text')

    // Wrapper should NOT carry aria-describedby any more.
    const wrapper = trigger.parentElement as HTMLElement
    expect(wrapper.getAttribute('aria-describedby')).toBeNull()
  })

  it('preserves existing aria-describedby on child by space-joining', () => {
    render(
      <Tooltip content="Help">
        <button data-testid="trigger" aria-describedby="existing-id">
          Trigger
        </button>
      </Tooltip>,
    )
    const trigger = screen.getByTestId('trigger')
    const bubble = screen.getByRole('tooltip')
    const describedBy = trigger.getAttribute('aria-describedby') ?? ''
    expect(describedBy).toContain('existing-id')
    expect(describedBy).toContain(bubble.id)
  })

  it('allows wrapping for long content', () => {
    render(
      <Tooltip content="A long sentence that should wrap across multiple lines and not overflow the viewport">
        <button>T</button>
      </Tooltip>,
    )
    const bubble = screen.getByRole('tooltip')
    expect(bubble.className).toMatch(/whitespace-normal/)
    expect(bubble.className).toMatch(/max-w-/)
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
