import { describe, it, expect } from 'vitest'
import {
  validateDynamicCardDefinition,
  validateStatsDefinition,
  MAX_CARD_SOURCE_BYTES,
  MAX_CARD_NAME_LENGTH,
} from '../validator'

// One byte over the source-size limit — used to exercise the oversize branch.
const OVERSIZE_BYTES = MAX_CARD_SOURCE_BYTES + 1

describe('validateDynamicCardDefinition', () => {
  const VALID_TIER1 = {
    id: 'my-card',
    title: 'My Card',
    tier: 'tier1',
  }

  const VALID_TIER2 = {
    id: 'my-card-2',
    title: 'My Card 2',
    tier: 'tier2',
    sourceCode: 'module.exports.default = function () { return null }',
  }

  it('accepts a minimal valid tier1 definition', () => {
    const result = validateDynamicCardDefinition(VALID_TIER1)
    expect(result.valid).toBe(true)
    expect(result.value).toBeDefined()
  })

  it('accepts a minimal valid tier2 definition', () => {
    const result = validateDynamicCardDefinition(VALID_TIER2)
    expect(result.valid).toBe(true)
  })

  it('rejects non-object input', () => {
    expect(validateDynamicCardDefinition(null).valid).toBe(false)
    expect(validateDynamicCardDefinition('string').valid).toBe(false)
    expect(validateDynamicCardDefinition(42).valid).toBe(false)
    expect(validateDynamicCardDefinition([]).valid).toBe(false)
  })

  it('rejects definitions missing id', () => {
    const result = validateDynamicCardDefinition({ title: 'X', tier: 'tier1' })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/id/)
  })

  it('rejects ids with invalid characters', () => {
    const result = validateDynamicCardDefinition({
      id: 'bad id with spaces',
      title: 'X',
      tier: 'tier1',
    })
    expect(result.valid).toBe(false)
  })

  it('rejects ids longer than 64 chars', () => {
    const LONG_ID_LENGTH = 65
    const result = validateDynamicCardDefinition({
      id: 'a'.repeat(LONG_ID_LENGTH),
      title: 'X',
      tier: 'tier1',
    })
    expect(result.valid).toBe(false)
  })

  it('rejects oversized titles', () => {
    const result = validateDynamicCardDefinition({
      id: 'ok',
      title: 'a'.repeat(MAX_CARD_NAME_LENGTH + 1),
      tier: 'tier1',
    })
    expect(result.valid).toBe(false)
  })

  it('rejects unknown tier values', () => {
    const result = validateDynamicCardDefinition({
      id: 'ok',
      title: 'X',
      tier: 'tier3',
    })
    expect(result.valid).toBe(false)
  })

  it('rejects tier2 definitions without sourceCode', () => {
    const result = validateDynamicCardDefinition({
      id: 'ok',
      title: 'X',
      tier: 'tier2',
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/sourceCode/)
  })

  it('rejects sourceCode exceeding the size limit', () => {
    const result = validateDynamicCardDefinition({
      id: 'ok',
      title: 'X',
      tier: 'tier2',
      sourceCode: 'a'.repeat(OVERSIZE_BYTES),
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/exceeds/)
  })

  it('rejects unknown top-level keys (strict)', () => {
    const result = validateDynamicCardDefinition({
      ...VALID_TIER1,
      rogueField: 1,
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Unknown field/)
  })

  it('rejects defaultWidth outside 1..12', () => {
    const OUT_OF_RANGE = 99
    const result = validateDynamicCardDefinition({
      ...VALID_TIER1,
      defaultWidth: OUT_OF_RANGE,
    })
    expect(result.valid).toBe(false)
  })

  it('accepts optional timestamp strings', () => {
    const result = validateDynamicCardDefinition({
      ...VALID_TIER1,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    })
    expect(result.valid).toBe(true)
  })
})

describe('validateStatsDefinition', () => {
  const VALID = {
    type: 'my-stats',
    blocks: [{ id: 'a', label: 'A' }],
  }

  it('accepts a minimal valid definition', () => {
    const result = validateStatsDefinition(VALID)
    expect(result.valid).toBe(true)
  })

  it('rejects non-object input', () => {
    expect(validateStatsDefinition(null).valid).toBe(false)
    expect(validateStatsDefinition([]).valid).toBe(false)
  })

  it('rejects invalid type identifiers', () => {
    const result = validateStatsDefinition({
      type: 'bad type!',
      blocks: [],
    })
    expect(result.valid).toBe(false)
  })

  it('rejects missing blocks array', () => {
    const result = validateStatsDefinition({ type: 'x' })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/blocks/)
  })

  it('rejects blocks without id', () => {
    const result = validateStatsDefinition({
      type: 'x',
      blocks: [{ label: 'A' }],
    })
    expect(result.valid).toBe(false)
  })

  it('rejects unknown top-level keys', () => {
    const result = validateStatsDefinition({ ...VALID, extra: 1 })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Unknown field/)
  })
})
