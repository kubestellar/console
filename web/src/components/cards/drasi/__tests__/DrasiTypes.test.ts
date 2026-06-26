import { describe, it, expect } from 'vitest'
import { nodeRectEqual, nodeMapEqual, rectsEqual } from '../DrasiTypes'
import type { NodeRect, MeasuredRects } from '../DrasiTypes'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeRect = (overrides: Partial<NodeRect> = {}): NodeRect => ({
  left: 10,
  right: 110,
  top: 20,
  bottom: 80,
  centerY: 50,
  ...overrides,
})

const makeMeasured = (overrides: Partial<MeasuredRects> = {}): MeasuredRects => ({
  sources: { s1: makeRect() },
  queries: { q1: makeRect({ left: 200 }) },
  reactions: { r1: makeRect({ left: 400 }) },
  container: { width: 800, height: 600 },
  ...overrides,
})

// ---------------------------------------------------------------------------
// nodeRectEqual
// ---------------------------------------------------------------------------

describe('nodeRectEqual', () => {
  it('returns true for identical object references', () => {
    const r = makeRect()
    expect(nodeRectEqual(r, r)).toBe(true)
  })

  it('returns true for two undefined values', () => {
    expect(nodeRectEqual(undefined, undefined)).toBe(true)
  })

  it('returns false when one side is undefined', () => {
    expect(nodeRectEqual(makeRect(), undefined)).toBe(false)
    expect(nodeRectEqual(undefined, makeRect())).toBe(false)
  })

  it('returns true for two equal rects with same values', () => {
    const a = makeRect()
    const b = makeRect()
    expect(nodeRectEqual(a, b)).toBe(true)
  })

  it('returns false when left differs', () => {
    expect(nodeRectEqual(makeRect({ left: 1 }), makeRect({ left: 2 }))).toBe(false)
  })

  it('returns false when right differs', () => {
    expect(nodeRectEqual(makeRect({ right: 100 }), makeRect({ right: 200 }))).toBe(false)
  })

  it('returns false when top differs', () => {
    expect(nodeRectEqual(makeRect({ top: 5 }), makeRect({ top: 10 }))).toBe(false)
  })

  it('returns false when bottom differs', () => {
    expect(nodeRectEqual(makeRect({ bottom: 70 }), makeRect({ bottom: 90 }))).toBe(false)
  })

  it('returns false when centerY differs', () => {
    expect(nodeRectEqual(makeRect({ centerY: 40 }), makeRect({ centerY: 60 }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// nodeMapEqual
// ---------------------------------------------------------------------------

describe('nodeMapEqual', () => {
  it('returns true for two empty maps', () => {
    expect(nodeMapEqual({}, {})).toBe(true)
  })

  it('returns true for two equal single-entry maps', () => {
    const a = { s1: makeRect() }
    const b = { s1: makeRect() }
    expect(nodeMapEqual(a, b)).toBe(true)
  })

  it('returns false when key sets differ (different size)', () => {
    expect(nodeMapEqual({ s1: makeRect() }, {})).toBe(false)
  })

  it('returns false when a key is present in a but not b', () => {
    expect(nodeMapEqual({ s1: makeRect() }, { s2: makeRect() })).toBe(false)
  })

  it('returns false when a rect value differs for the same key', () => {
    const a = { s1: makeRect({ left: 1 }) }
    const b = { s1: makeRect({ left: 2 }) }
    expect(nodeMapEqual(a, b)).toBe(false)
  })

  it('returns true for multi-key maps with equal values', () => {
    const map = { s1: makeRect(), s2: makeRect({ left: 50 }) }
    expect(nodeMapEqual(map, { ...map })).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// rectsEqual
// ---------------------------------------------------------------------------

describe('rectsEqual', () => {
  it('returns true for two equal MeasuredRects', () => {
    const a = makeMeasured()
    const b = makeMeasured()
    expect(rectsEqual(a, b)).toBe(true)
  })

  it('returns false when container width differs', () => {
    const a = makeMeasured()
    const b = makeMeasured({ container: { width: 900, height: 600 } })
    expect(rectsEqual(a, b)).toBe(false)
  })

  it('returns false when container height differs', () => {
    const a = makeMeasured()
    const b = makeMeasured({ container: { width: 800, height: 700 } })
    expect(rectsEqual(a, b)).toBe(false)
  })

  it('returns false when sources differ', () => {
    const a = makeMeasured()
    const b = makeMeasured({ sources: { s1: makeRect({ left: 99 }) } })
    expect(rectsEqual(a, b)).toBe(false)
  })

  it('returns false when queries differ', () => {
    const a = makeMeasured()
    const b = makeMeasured({ queries: { q1: makeRect({ right: 999 }) } })
    expect(rectsEqual(a, b)).toBe(false)
  })

  it('returns false when reactions differ', () => {
    const a = makeMeasured()
    const b = makeMeasured({ reactions: {} })
    expect(rectsEqual(a, b)).toBe(false)
  })

  it('returns true for empty node maps with equal containers', () => {
    const a: MeasuredRects = { sources: {}, queries: {}, reactions: {}, container: { width: 100, height: 100 } }
    const b: MeasuredRects = { sources: {}, queries: {}, reactions: {}, container: { width: 100, height: 100 } }
    expect(rectsEqual(a, b)).toBe(true)
  })
})
