import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React, { createRef } from 'react'

// ── Mock @tanstack/react-virtual ──────────────────────────────────────────────
// jsdom has no real scroll/layout, so useVirtualizer returns 0 items.
// We control the virtual items list via mockVirtualItems.

const mockMeasureElement = vi.fn()
const mockGetTotalSize = vi.fn(() => 600)
const mockGetVirtualItems = vi.fn()

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn((opts: { overscan?: number }) => {
    // Expose overscan so tests can assert on it
    ;(globalThis as Record<string, unknown>).__lastVirtualizerOpts = opts
    return {
      getTotalSize: mockGetTotalSize,
      getVirtualItems: mockGetVirtualItems,
      measureElement: mockMeasureElement,
    }
  }),
}))

import { VirtualizedList } from '../VirtualizedList'

function makeVirtualItem(index: number, start = index * 50) {
  return { index, key: `vk-${index}`, start, size: 50 }
}

describe('VirtualizedList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTotalSize.mockReturnValue(600)
    mockGetVirtualItems.mockReturnValue([])
    ;(globalThis as Record<string, unknown>).__lastVirtualizerOpts = undefined
  })

  // ── Rendering basics ────────────────────────────────────────────────────────

  it('renders outer scroll container', () => {
    const { container } = render(
      <VirtualizedList items={[]} estimateSize={() => 50} renderItem={() => null} />
    )
    const outer = container.firstChild as HTMLElement
    expect(outer).toBeInTheDocument()
    expect(outer.className).toContain('overflow-y-auto')
  })

  it('renders inner container with total height from virtualizer', () => {
    mockGetTotalSize.mockReturnValue(300)
    const { container } = render(
      <VirtualizedList items={[]} estimateSize={() => 50} renderItem={() => null} />
    )
    const inner = container.firstChild?.firstChild as HTMLElement
    expect(inner.style.height).toBe('300px')
  })

  it('renders nothing when items is empty', () => {
    mockGetVirtualItems.mockReturnValue([])
    const { container } = render(
      <VirtualizedList items={[]} estimateSize={() => 50} renderItem={() => null} />
    )
    const inner = container.firstChild?.firstChild as HTMLElement
    expect(inner.children).toHaveLength(0)
  })

  it('renders virtual items via renderItem', () => {
    const items = ['alpha', 'beta', 'gamma']
    mockGetVirtualItems.mockReturnValue([
      makeVirtualItem(0),
      makeVirtualItem(1),
      makeVirtualItem(2),
    ])
    render(
      <VirtualizedList
        items={items}
        estimateSize={() => 50}
        renderItem={(item) => <span>{item as string}</span>}
      />
    )
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('beta')).toBeInTheDocument()
    expect(screen.getByText('gamma')).toBeInTheDocument()
  })

  it('passes index to renderItem', () => {
    const items = ['x', 'y']
    mockGetVirtualItems.mockReturnValue([makeVirtualItem(0), makeVirtualItem(1)])
    const renderItem = vi.fn((item: unknown, idx: number) => (
      <span data-testid={`item-${idx}`}>{String(item)}</span>
    ))
    render(
      <VirtualizedList items={items} estimateSize={() => 50} renderItem={renderItem} />
    )
    expect(renderItem).toHaveBeenCalledWith('x', 0)
    expect(renderItem).toHaveBeenCalledWith('y', 1)
  })

  it('skips rendering when virtualItem.index has no matching item', () => {
    mockGetVirtualItems.mockReturnValue([makeVirtualItem(5)])
    const { container } = render(
      <VirtualizedList items={['only']} estimateSize={() => 50} renderItem={() => <span>item</span>} />
    )
    const inner = container.firstChild?.firstChild as HTMLElement
    expect(inner.children).toHaveLength(0)
  })

  // ── Item key resolution ─────────────────────────────────────────────────────

  it('uses getItemKey when provided', () => {
    const items = [{ id: 'abc' }, { id: 'def' }]
    mockGetVirtualItems.mockReturnValue([makeVirtualItem(0), makeVirtualItem(1)])
    const getItemKey = vi.fn((item: { id: string }) => item.id)
    render(
      <VirtualizedList
        items={items}
        estimateSize={() => 50}
        renderItem={(item) => <span>{(item as { id: string }).id}</span>}
        getItemKey={getItemKey}
      />
    )
    expect(getItemKey).toHaveBeenCalledWith({ id: 'abc' }, 0)
    expect(getItemKey).toHaveBeenCalledWith({ id: 'def' }, 1)
  })

  it('falls back to virtualItem.key when getItemKey is not provided', () => {
    const items = ['item0']
    mockGetVirtualItems.mockReturnValue([makeVirtualItem(0)])
    const { container } = render(
      <VirtualizedList items={items} estimateSize={() => 50} renderItem={() => <span>item</span>} />
    )
    const row = container.querySelector('[data-index="0"]') as HTMLElement
    expect(row).toBeInTheDocument()
  })

  // ── CSS classes and style props ─────────────────────────────────────────────

  it('applies className to outer container', () => {
    const { container } = render(
      <VirtualizedList
        items={[]}
        estimateSize={() => 50}
        renderItem={() => null}
        className="my-scroll-class"
      />
    )
    expect((container.firstChild as HTMLElement).className).toContain('my-scroll-class')
  })

  it('applies innerClassName to inner container', () => {
    const { container } = render(
      <VirtualizedList
        items={[]}
        estimateSize={() => 50}
        renderItem={() => null}
        innerClassName="my-inner"
      />
    )
    const inner = container.firstChild?.firstChild as HTMLElement
    expect(inner.className).toContain('my-inner')
  })

  it('applies style prop to outer container', () => {
    const { container } = render(
      <VirtualizedList
        items={[]}
        estimateSize={() => 50}
        renderItem={() => null}
        style={{ maxHeight: '400px' }}
      />
    )
    expect((container.firstChild as HTMLElement).style.maxHeight).toBe('400px')
  })

  // ── itemGap prop ────────────────────────────────────────────────────────────

  it('applies itemGap as paddingBottom on each row', () => {
    const items = ['a']
    mockGetVirtualItems.mockReturnValue([makeVirtualItem(0)])
    const { container } = render(
      <VirtualizedList
        items={items}
        estimateSize={() => 50}
        renderItem={() => <span>a</span>}
        itemGap={12}
      />
    )
    const row = container.querySelector('[data-index="0"]') as HTMLElement
    expect(row.style.paddingBottom).toBe('12px')
  })

  it('defaults itemGap to 0 (no paddingBottom)', () => {
    const items = ['a']
    mockGetVirtualItems.mockReturnValue([makeVirtualItem(0)])
    const { container } = render(
      <VirtualizedList
        items={items}
        estimateSize={() => 50}
        renderItem={() => <span>a</span>}
      />
    )
    const row = container.querySelector('[data-index="0"]') as HTMLElement
    expect(row.style.paddingBottom).toBe('0px')
  })

  // ── Transform / positioning ─────────────────────────────────────────────────

  it('applies translateY transform based on virtualItem.start', () => {
    const items = ['a', 'b']
    mockGetVirtualItems.mockReturnValue([makeVirtualItem(0, 0), makeVirtualItem(1, 60)])
    const { container } = render(
      <VirtualizedList items={items} estimateSize={() => 50} renderItem={() => <span />} />
    )
    const rows = container.querySelectorAll('[data-index]')
    expect((rows[0] as HTMLElement).style.transform).toBe('translateY(0px)')
    expect((rows[1] as HTMLElement).style.transform).toBe('translateY(60px)')
  })

  it('sets data-index attribute on each row', () => {
    const items = ['x', 'y', 'z']
    mockGetVirtualItems.mockReturnValue([
      makeVirtualItem(0),
      makeVirtualItem(1),
      makeVirtualItem(2),
    ])
    const { container } = render(
      <VirtualizedList items={items} estimateSize={() => 50} renderItem={() => <span />} />
    )
    expect(container.querySelector('[data-index="0"]')).toBeInTheDocument()
    expect(container.querySelector('[data-index="1"]')).toBeInTheDocument()
    expect(container.querySelector('[data-index="2"]')).toBeInTheDocument()
  })

  // ── overscan prop ───────────────────────────────────────────────────────────

  it('uses default overscan of 6 when not specified', () => {
    render(<VirtualizedList items={[]} estimateSize={() => 50} renderItem={() => null} />)
    const opts = (globalThis as Record<string, unknown>).__lastVirtualizerOpts as { overscan?: number }
    expect(opts?.overscan).toBe(6)
  })

  it('forwards custom overscan to useVirtualizer', () => {
    render(
      <VirtualizedList items={[]} estimateSize={() => 50} renderItem={() => null} overscan={12} />
    )
    const opts = (globalThis as Record<string, unknown>).__lastVirtualizerOpts as { overscan?: number }
    expect(opts?.overscan).toBe(12)
  })

  // ── scrollRef prop ──────────────────────────────────────────────────────────

  it('calls scrollRef callback with the scroll element node', () => {
    const scrollRef = vi.fn()
    render(
      <VirtualizedList
        items={[]}
        estimateSize={() => 50}
        renderItem={() => null}
        scrollRef={scrollRef}
      />
    )
    expect(scrollRef).toHaveBeenCalledWith(expect.any(HTMLDivElement))
  })

  it('assigns scroll element to scrollRef object ref', () => {
    const ref = createRef<HTMLDivElement>()
    render(
      <VirtualizedList
        items={[]}
        estimateSize={() => 50}
        renderItem={() => null}
        scrollRef={ref as React.MutableRefObject<HTMLDivElement | null>}
      />
    )
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })

  // ── estimateSize forwarded to virtualizer ───────────────────────────────────

  it('forwards estimateSize function to useVirtualizer', () => {
    const estimateSize = vi.fn(() => 80)
    render(<VirtualizedList items={[]} estimateSize={estimateSize} renderItem={() => null} />)
    const opts = (globalThis as Record<string, unknown>).__lastVirtualizerOpts as { estimateSize: () => number }
    expect(opts?.estimateSize).toBe(estimateSize)
  })
})
