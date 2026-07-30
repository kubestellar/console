/**
 * Tests for useCardGridNavigation hook.
 *
 * Validates keyboard navigation across a card grid layout including
 * arrow key movement, Enter/Space expansion, and edge-case handling.
 */

import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCardGridNavigation } from '../useCardGridNavigation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCards(specs: { id: string; w: number }[]) {
  return specs.map(({ id, w }) => ({ id, position: { w, h: 1 } }))
}

/** Build a minimal KeyboardEvent-like object for the hook handler. */
function fakeKeyEvent(
  key: string,
  currentTarget: HTMLElement,
  target?: EventTarget,
) {
  return {
    key,
    currentTarget,
    target: target ?? currentTarget,
    preventDefault: vi.fn(),
  } as unknown as React.KeyboardEvent
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCardGridNavigation', () => {
  // ----- layout & refs ---------------------------------------------------

  it('returns registerCardRef and handleGridKeyDown', () => {
    const { result } = renderHook(() =>
      useCardGridNavigation({
        cards: makeCards([{ id: 'a', w: 4 }]),
        onExpandCard: vi.fn(),
      }),
    )

    expect(typeof result.current.registerCardRef).toBe('function')
    expect(typeof result.current.handleGridKeyDown).toBe('function')
  })

  it('registers and unregisters card refs', () => {
    const { result } = renderHook(() =>
      useCardGridNavigation({
        cards: makeCards([{ id: 'a', w: 4 }]),
        onExpandCard: vi.fn(),
      }),
    )

    const el = document.createElement('div')
    // Register
    result.current.registerCardRef('a', el)
    // Unregister (null)
    result.current.registerCardRef('a', null)
    // Should not throw even if already removed
    result.current.registerCardRef('a', null)
  })

  // ----- ArrowRight / ArrowLeft ------------------------------------------

  it('ArrowRight focuses the next card', () => {
    const cards = makeCards([
      { id: 'a', w: 4 },
      { id: 'b', w: 4 },
      { id: 'c', w: 4 },
    ])
    const { result } = renderHook(() =>
      useCardGridNavigation({ cards, onExpandCard: vi.fn() }),
    )

    // Create DOM elements and register
    const elA = document.createElement('div')
    const elB = document.createElement('div')
    const elC = document.createElement('div')
    elB.focus = vi.fn()
    elC.focus = vi.fn()

    result.current.registerCardRef('a', elA)
    result.current.registerCardRef('b', elB)
    result.current.registerCardRef('c', elC)

    const event = fakeKeyEvent('ArrowRight', elA)
    result.current.handleGridKeyDown(event)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(elB.focus).toHaveBeenCalled()
  })

  it('ArrowLeft focuses the previous card', () => {
    const cards = makeCards([
      { id: 'a', w: 4 },
      { id: 'b', w: 4 },
    ])
    const { result } = renderHook(() =>
      useCardGridNavigation({ cards, onExpandCard: vi.fn() }),
    )

    const elA = document.createElement('div')
    const elB = document.createElement('div')
    elA.focus = vi.fn()

    result.current.registerCardRef('a', elA)
    result.current.registerCardRef('b', elB)

    const event = fakeKeyEvent('ArrowLeft', elB)
    result.current.handleGridKeyDown(event)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(elA.focus).toHaveBeenCalled()
  })

  it('ArrowRight at last card does nothing', () => {
    const cards = makeCards([{ id: 'a', w: 4 }])
    const { result } = renderHook(() =>
      useCardGridNavigation({ cards, onExpandCard: vi.fn() }),
    )

    const elA = document.createElement('div')
    elA.focus = vi.fn()
    result.current.registerCardRef('a', elA)

    const event = fakeKeyEvent('ArrowRight', elA)
    result.current.handleGridKeyDown(event)

    // preventDefault is still called, but no focus change
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('ArrowLeft at first card does nothing', () => {
    const cards = makeCards([{ id: 'a', w: 4 }])
    const { result } = renderHook(() =>
      useCardGridNavigation({ cards, onExpandCard: vi.fn() }),
    )

    const elA = document.createElement('div')
    elA.focus = vi.fn()
    result.current.registerCardRef('a', elA)

    const event = fakeKeyEvent('ArrowLeft', elA)
    result.current.handleGridKeyDown(event)

    expect(event.preventDefault).toHaveBeenCalled()
  })

  // ----- ArrowDown / ArrowUp (multi-row) ---------------------------------

  it('ArrowDown moves to the nearest card on the row below', () => {
    // Row 0: [a(4)] [b(4)] [c(4)]   (fills 12 cols)
    // Row 1: [d(6)] [e(6)]
    const cards = makeCards([
      { id: 'a', w: 4 },
      { id: 'b', w: 4 },
      { id: 'c', w: 4 },
      { id: 'd', w: 6 },
      { id: 'e', w: 6 },
    ])
    const { result } = renderHook(() =>
      useCardGridNavigation({ cards, onExpandCard: vi.fn() }),
    )

    const els: Record<string, HTMLDivElement> = {}
    for (const card of cards) {
      els[card.id] = document.createElement('div')
      els[card.id].focus = vi.fn()
      result.current.registerCardRef(card.id, els[card.id])
    }

    // From 'a' (col 0) down → 'd' (col 0)
    const event = fakeKeyEvent('ArrowDown', els['a'])
    result.current.handleGridKeyDown(event)
    expect(els['d'].focus).toHaveBeenCalled()
  })

  it('ArrowUp moves to the nearest card on the row above', () => {
    const cards = makeCards([
      { id: 'a', w: 4 },
      { id: 'b', w: 4 },
      { id: 'c', w: 4 },
      { id: 'd', w: 6 },
      { id: 'e', w: 6 },
    ])
    const { result } = renderHook(() =>
      useCardGridNavigation({ cards, onExpandCard: vi.fn() }),
    )

    const els: Record<string, HTMLDivElement> = {}
    for (const card of cards) {
      els[card.id] = document.createElement('div')
      els[card.id].focus = vi.fn()
      result.current.registerCardRef(card.id, els[card.id])
    }

    // From 'e' (row 1, col 6) up → 'b' (row 0, col 4) is nearest (distance 2, ties won by first match)
    const event = fakeKeyEvent('ArrowUp', els['e'])
    result.current.handleGridKeyDown(event)
    expect(els['b'].focus).toHaveBeenCalled()
  })

  it('ArrowDown on the last row does nothing', () => {
    const cards = makeCards([
      { id: 'a', w: 12 },
      { id: 'b', w: 12 },
    ])
    const { result } = renderHook(() =>
      useCardGridNavigation({ cards, onExpandCard: vi.fn() }),
    )

    const elB = document.createElement('div')
    elB.focus = vi.fn()
    result.current.registerCardRef('a', document.createElement('div'))
    result.current.registerCardRef('b', elB)

    // 'b' is on the last row
    const event = fakeKeyEvent('ArrowDown', elB)
    result.current.handleGridKeyDown(event)
    // No crash, no focus change
  })

  it('ArrowUp on the first row does nothing', () => {
    const cards = makeCards([
      { id: 'a', w: 12 },
      { id: 'b', w: 12 },
    ])
    const { result } = renderHook(() =>
      useCardGridNavigation({ cards, onExpandCard: vi.fn() }),
    )

    const elA = document.createElement('div')
    result.current.registerCardRef('a', elA)
    result.current.registerCardRef('b', document.createElement('div'))

    const event = fakeKeyEvent('ArrowUp', elA)
    result.current.handleGridKeyDown(event)
  })

  // ----- Enter / Space ---------------------------------------------------

  it('Enter expands the focused card', () => {
    const onExpandCard = vi.fn()
    const cards = makeCards([{ id: 'a', w: 4 }])
    const { result } = renderHook(() =>
      useCardGridNavigation({ cards, onExpandCard }),
    )

    const elA = document.createElement('div')
    result.current.registerCardRef('a', elA)

    const event = fakeKeyEvent('Enter', elA)
    result.current.handleGridKeyDown(event)

    expect(onExpandCard).toHaveBeenCalledWith('a')
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('Space expands the focused card', () => {
    const onExpandCard = vi.fn()
    const cards = makeCards([{ id: 'a', w: 4 }])
    const { result } = renderHook(() =>
      useCardGridNavigation({ cards, onExpandCard }),
    )

    const elA = document.createElement('div')
    result.current.registerCardRef('a', elA)

    const event = fakeKeyEvent(' ', elA)
    result.current.handleGridKeyDown(event)

    expect(onExpandCard).toHaveBeenCalledWith('a')
  })

  it('Enter does NOT expand if target is a child element (e.g., button)', () => {
    const onExpandCard = vi.fn()
    const cards = makeCards([{ id: 'a', w: 4 }])
    const { result } = renderHook(() =>
      useCardGridNavigation({ cards, onExpandCard }),
    )

    const elA = document.createElement('div')
    const button = document.createElement('button')
    elA.appendChild(button)
    result.current.registerCardRef('a', elA)

    // target is the button, currentTarget is the card
    const event = fakeKeyEvent('Enter', elA, button)
    result.current.handleGridKeyDown(event)

    expect(onExpandCard).not.toHaveBeenCalled()
  })

  // ----- Input / dialog filtering ----------------------------------------

  it('ignores key events from input elements', () => {
    const onExpandCard = vi.fn()
    const cards = makeCards([{ id: 'a', w: 4 }])
    const { result } = renderHook(() =>
      useCardGridNavigation({ cards, onExpandCard }),
    )

    const elA = document.createElement('div')
    const input = document.createElement('input')
    result.current.registerCardRef('a', elA)

    const event = fakeKeyEvent('Enter', elA, input)
    result.current.handleGridKeyDown(event)

    expect(onExpandCard).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('ignores key events from textarea elements', () => {
    const cards = makeCards([{ id: 'a', w: 4 }])
    const { result } = renderHook(() =>
      useCardGridNavigation({ cards, onExpandCard: vi.fn() }),
    )

    const elA = document.createElement('div')
    const textarea = document.createElement('textarea')
    result.current.registerCardRef('a', elA)

    const event = fakeKeyEvent('ArrowRight', elA, textarea)
    result.current.handleGridKeyDown(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('ignores key events from within a dialog', () => {
    const cards = makeCards([{ id: 'a', w: 4 }])
    const { result } = renderHook(() =>
      useCardGridNavigation({ cards, onExpandCard: vi.fn() }),
    )

    const elA = document.createElement('div')
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const inner = document.createElement('span')
    dialog.appendChild(inner)
    document.body.appendChild(dialog)

    result.current.registerCardRef('a', elA)

    const event = fakeKeyEvent('ArrowRight', elA, inner)
    result.current.handleGridKeyDown(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    document.body.removeChild(dialog)
  })

  // ----- Unrecognized card / key -----------------------------------------

  it('does nothing when currentTarget is not a registered card', () => {
    const cards = makeCards([{ id: 'a', w: 4 }])
    const { result } = renderHook(() =>
      useCardGridNavigation({ cards, onExpandCard: vi.fn() }),
    )

    const unknownEl = document.createElement('div')
    const event = fakeKeyEvent('ArrowRight', unknownEl)
    result.current.handleGridKeyDown(event)

    // No crash, no preventDefault
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  // ----- Custom gridColumns ----------------------------------------------

  it('respects custom gridColumns for layout computation', () => {
    // With gridColumns=6, a card of w=4 + w=4 won't fit on one row
    // Row 0: [a(4)]  Row 1: [b(4)]
    const cards = makeCards([
      { id: 'a', w: 4 },
      { id: 'b', w: 4 },
    ])
    const { result } = renderHook(() =>
      useCardGridNavigation({ cards, onExpandCard: vi.fn(), gridColumns: 6 }),
    )

    const elA = document.createElement('div')
    const elB = document.createElement('div')
    elB.focus = vi.fn()
    result.current.registerCardRef('a', elA)
    result.current.registerCardRef('b', elB)

    // ArrowDown from a → b (different rows)
    const event = fakeKeyEvent('ArrowDown', elA)
    result.current.handleGridKeyDown(event)
    expect(elB.focus).toHaveBeenCalled()
  })

  // ----- Card width clamping ---------------------------------------------

  it('clamps card width to gridColumns when card width exceeds grid', () => {
    // A card of w=20 with gridColumns=12 should be clamped to 12
    const cards = makeCards([
      { id: 'a', w: 20 },
      { id: 'b', w: 4 },
    ])
    const { result } = renderHook(() =>
      useCardGridNavigation({ cards, onExpandCard: vi.fn() }),
    )

    const elA = document.createElement('div')
    const elB = document.createElement('div')
    elB.focus = vi.fn()
    result.current.registerCardRef('a', elA)
    result.current.registerCardRef('b', elB)

    // 'a' takes full row (12), 'b' is on the next row
    const event = fakeKeyEvent('ArrowDown', elA)
    result.current.handleGridKeyDown(event)
    expect(elB.focus).toHaveBeenCalled()
  })

  // ----- Empty cards array ------------------------------------------------

  it('handles empty cards array without crashing', () => {
    const { result } = renderHook(() =>
      useCardGridNavigation({ cards: [], onExpandCard: vi.fn() }),
    )

    const el = document.createElement('div')
    const event = fakeKeyEvent('ArrowRight', el)
    result.current.handleGridKeyDown(event)
    // No crash
  })
})
