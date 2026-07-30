/**
 * Unit tests for lib/cards/cardCollapse.ts
 *
 * Covers:
 * - useCardCollapse: initial state, toggle, persist, expand/collapse shorthands
 * - useCardCollapse: subscriber sync between multiple instances for same cardId (#6072)
 * - useCardCollapse: subscriber cleanup on unmount
 * - useCardCollapseAll: collapseAll, expandAll, toggleCard, isCardCollapsed
 * - Cross-hook sync: useCardCollapseAll writes notify useCardCollapse subscribers
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCardCollapse, useCardCollapseAll } from '../cardCollapse'

const COLLAPSED_KEY = 'kubestellar-collapsed-cards'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

// ============================================================================
// useCardCollapse — basic state management
// ============================================================================

describe('useCardCollapse', () => {
  it('starts expanded by default', () => {
    const { result } = renderHook(() => useCardCollapse('card-1'))
    expect(result.current.isCollapsed).toBe(false)
  })

  it('starts collapsed when defaultCollapsed is true', () => {
    const { result } = renderHook(() => useCardCollapse('card-1', true))
    expect(result.current.isCollapsed).toBe(true)
  })

  it('reads initial collapsed state from localStorage', () => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(['card-persisted']))
    const { result } = renderHook(() => useCardCollapse('card-persisted'))
    expect(result.current.isCollapsed).toBe(true)
  })

  it('localStorage takes precedence over defaultCollapsed=false', () => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(['card-ls']))
    const { result } = renderHook(() => useCardCollapse('card-ls', false))
    expect(result.current.isCollapsed).toBe(true)
  })

  it('toggleCollapsed flips state from expanded to collapsed', () => {
    const { result } = renderHook(() => useCardCollapse('card-toggle'))
    act(() => { result.current.toggleCollapsed() })
    expect(result.current.isCollapsed).toBe(true)
  })

  it('toggleCollapsed flips state from collapsed to expanded', () => {
    const { result } = renderHook(() => useCardCollapse('card-toggle-back', true))
    act(() => { result.current.toggleCollapsed() })
    expect(result.current.isCollapsed).toBe(false)
  })

  it('setCollapsed(true) persists cardId to localStorage', () => {
    const { result } = renderHook(() => useCardCollapse('card-save'))
    act(() => { result.current.setCollapsed(true) })
    const stored = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]
    expect(stored).toContain('card-save')
  })

  it('setCollapsed(false) removes cardId from localStorage', () => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(['card-rm']))
    const { result } = renderHook(() => useCardCollapse('card-rm'))
    act(() => { result.current.setCollapsed(false) })
    const stored = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]
    expect(stored).not.toContain('card-rm')
  })

  it('expand() shorthand sets isCollapsed to false', () => {
    const { result } = renderHook(() => useCardCollapse('card-exp', true))
    act(() => { result.current.expand() })
    expect(result.current.isCollapsed).toBe(false)
  })

  it('collapse() shorthand sets isCollapsed to true', () => {
    const { result } = renderHook(() => useCardCollapse('card-coll'))
    act(() => { result.current.collapse() })
    expect(result.current.isCollapsed).toBe(true)
  })

  it('handles corrupted localStorage gracefully (falls back to default)', () => {
    localStorage.setItem(COLLAPSED_KEY, '{not-valid-json')
    const { result } = renderHook(() => useCardCollapse('card-corrupt'))
    expect(result.current.isCollapsed).toBe(false)
  })

  it('does not affect other cards when saving', () => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(['other-card']))
    const { result } = renderHook(() => useCardCollapse('my-card'))
    act(() => { result.current.setCollapsed(true) })
    const stored = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]
    expect(stored).toContain('other-card')
    expect(stored).toContain('my-card')
  })
})

// ============================================================================
// useCardCollapse — subscriber sync (#6072)
//
// When two useCardCollapse instances share the same cardId (e.g. SortableCard
// and CardWrapper both rendering the same card), toggling one must update the
// other without requiring a page reload.
// ============================================================================

describe('useCardCollapse subscriber sync (#6072)', () => {
  it('second instance for same cardId syncs when first toggles', () => {
    const { result: a } = renderHook(() => useCardCollapse('shared-card'))
    const { result: b } = renderHook(() => useCardCollapse('shared-card'))

    expect(a.current.isCollapsed).toBe(false)
    expect(b.current.isCollapsed).toBe(false)

    act(() => { a.current.toggleCollapsed() })

    expect(a.current.isCollapsed).toBe(true)
    expect(b.current.isCollapsed).toBe(true)
  })

  it('first instance syncs when second toggles', () => {
    const { result: a } = renderHook(() => useCardCollapse('shared-card-2'))
    const { result: b } = renderHook(() => useCardCollapse('shared-card-2'))

    act(() => { b.current.collapse() })

    expect(a.current.isCollapsed).toBe(true)
    expect(b.current.isCollapsed).toBe(true)
  })

  it('instances for different cardIds do not interfere', () => {
    const { result: a } = renderHook(() => useCardCollapse('card-x'))
    const { result: b } = renderHook(() => useCardCollapse('card-y'))

    act(() => { a.current.collapse() })

    expect(a.current.isCollapsed).toBe(true)
    expect(b.current.isCollapsed).toBe(false)
  })

  it('three instances for same cardId all stay in sync', () => {
    const { result: a } = renderHook(() => useCardCollapse('triple-card'))
    const { result: b } = renderHook(() => useCardCollapse('triple-card'))
    const { result: c } = renderHook(() => useCardCollapse('triple-card'))

    act(() => { b.current.collapse() })

    expect(a.current.isCollapsed).toBe(true)
    expect(b.current.isCollapsed).toBe(true)
    expect(c.current.isCollapsed).toBe(true)

    act(() => { c.current.expand() })

    expect(a.current.isCollapsed).toBe(false)
    expect(b.current.isCollapsed).toBe(false)
    expect(c.current.isCollapsed).toBe(false)
  })

  it('unmounted instance no longer receives sync updates', () => {
    const { result: a } = renderHook(() => useCardCollapse('unmount-card'))
    const { result: b, unmount } = renderHook(() => useCardCollapse('unmount-card'))

    // Confirm both start expanded
    expect(a.current.isCollapsed).toBe(false)
    expect(b.current.isCollapsed).toBe(false)

    // Unmount b — it should stop receiving updates
    unmount()

    // Toggle a — b's result should not have updated (hook is gone)
    act(() => { a.current.collapse() })

    // a reflects the change
    expect(a.current.isCollapsed).toBe(true)
    // b's result.current is still the last rendered value — it is fine
    // that it still reflects false here; the key assertion is that no error
    // is thrown (unsubscribed listener is not called).
    expect(b.current.isCollapsed).toBe(false)
  })
})

// ============================================================================
// useCardCollapse ↔ useCardCollapseAll cross-hook sync
//
// When useCardCollapseAll calls collapseAll/expandAll/toggleCard it writes to
// localStorage and fires notifyCollapseSubscribers, so any live
// useCardCollapse instances for those cards must update.
// ============================================================================

describe('useCardCollapse ↔ useCardCollapseAll cross-hook sync', () => {
  const ids = ['sync-a', 'sync-b', 'sync-c']

  it('useCardCollapse updates when useCardCollapseAll.collapseAll fires', () => {
    const { result: single } = renderHook(() => useCardCollapse('sync-a'))
    const { result: all } = renderHook(() => useCardCollapseAll(ids))

    expect(single.current.isCollapsed).toBe(false)

    act(() => { all.current.collapseAll() })

    expect(single.current.isCollapsed).toBe(true)
  })

  it('useCardCollapse updates when useCardCollapseAll.expandAll fires', () => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(ids))
    const { result: single } = renderHook(() => useCardCollapse('sync-b'))
    const { result: all } = renderHook(() => useCardCollapseAll(ids))

    expect(single.current.isCollapsed).toBe(true)

    act(() => { all.current.expandAll() })

    expect(single.current.isCollapsed).toBe(false)
  })

  it('useCardCollapse updates when useCardCollapseAll.toggleCard fires', () => {
    const { result: single } = renderHook(() => useCardCollapse('sync-c'))
    const { result: all } = renderHook(() => useCardCollapseAll(ids))

    act(() => { all.current.toggleCard('sync-c') })

    expect(single.current.isCollapsed).toBe(true)
  })
})

// ============================================================================
// useCardCollapseAll — bulk management
// ============================================================================

describe('useCardCollapseAll', () => {
  const cards = ['bulk-a', 'bulk-b', 'bulk-c']

  it('starts with all cards expanded', () => {
    const { result } = renderHook(() => useCardCollapseAll(cards))
    expect(result.current.allExpanded).toBe(true)
    expect(result.current.allCollapsed).toBe(false)
    expect(result.current.collapsedCount).toBe(0)
  })

  it('reads pre-collapsed cards from localStorage', () => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(['bulk-a', 'bulk-b']))
    const { result } = renderHook(() => useCardCollapseAll(cards))
    expect(result.current.collapsedCount).toBe(2)
    expect(result.current.allCollapsed).toBe(false)
  })

  it('collapseAll collapses all cards and sets allCollapsed', () => {
    const { result } = renderHook(() => useCardCollapseAll(cards))
    act(() => { result.current.collapseAll() })
    expect(result.current.allCollapsed).toBe(true)
    expect(result.current.allExpanded).toBe(false)
    expect(result.current.collapsedCount).toBe(3)
  })

  it('expandAll expands all cards and sets allExpanded', () => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(cards))
    const { result } = renderHook(() => useCardCollapseAll(cards))
    act(() => { result.current.expandAll() })
    expect(result.current.allExpanded).toBe(true)
    expect(result.current.collapsedCount).toBe(0)
  })

  it('toggleCard collapses an expanded card', () => {
    const { result } = renderHook(() => useCardCollapseAll(cards))
    act(() => { result.current.toggleCard('bulk-b') })
    expect(result.current.isCardCollapsed('bulk-b')).toBe(true)
    expect(result.current.isCardCollapsed('bulk-a')).toBe(false)
    expect(result.current.collapsedCount).toBe(1)
  })

  it('toggleCard expands a collapsed card', () => {
    const { result } = renderHook(() => useCardCollapseAll(cards))
    act(() => { result.current.toggleCard('bulk-a') })
    act(() => { result.current.toggleCard('bulk-a') })
    expect(result.current.isCardCollapsed('bulk-a')).toBe(false)
  })

  it('collapseAll persists to localStorage', () => {
    const { result } = renderHook(() => useCardCollapseAll(cards))
    act(() => { result.current.collapseAll() })
    const stored = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]
    expect(stored).toEqual(expect.arrayContaining(cards))
  })

  it('expandAll does not remove cards outside provided ids', () => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...cards, 'outside-card']))
    const { result } = renderHook(() => useCardCollapseAll(cards))
    act(() => { result.current.expandAll() })
    const stored = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]
    expect(stored).toContain('outside-card')
    expect(stored).not.toContain('bulk-a')
  })

  it('isCardCollapsed returns false for an unknown card', () => {
    const { result } = renderHook(() => useCardCollapseAll(cards))
    expect(result.current.isCardCollapsed('not-in-list')).toBe(false)
  })
})
