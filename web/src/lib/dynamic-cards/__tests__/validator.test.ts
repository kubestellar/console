import { describe, it, expect } from 'vitest'
import {
  validateDynamicCardDefinition,
  validateStatsDefinition,
  MAX_CARD_SOURCE_BYTES,
  MAX_CARD_COMPILED_BYTES,
  MAX_CARD_NAME_LENGTH,
  MAX_CARD_DESCRIPTION_LENGTH,
  MAX_SHORT_FIELD_LENGTH,
  MAX_STATS_BLOCKS,
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

  it('rejects oversized description', () => {
    const result = validateDynamicCardDefinition({
      ...VALID_TIER1,
      description: 'x'.repeat(MAX_CARD_DESCRIPTION_LENGTH + 1),
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/description/)
  })

  it('rejects numeric description', () => {
    const result = validateDynamicCardDefinition({
      ...VALID_TIER1,
      description: 123,
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/description/)
  })

  it('rejects oversized icon', () => {
    const result = validateDynamicCardDefinition({
      ...VALID_TIER1,
      icon: 'x'.repeat(MAX_SHORT_FIELD_LENGTH + 1),
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/icon/)
  })

  it('rejects oversized iconColor', () => {
    const result = validateDynamicCardDefinition({
      ...VALID_TIER1,
      iconColor: 'x'.repeat(MAX_SHORT_FIELD_LENGTH + 1),
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/iconColor/)
  })

  it('rejects non-integer defaultWidth', () => {
    const FRACTIONAL = 3.5
    const result = validateDynamicCardDefinition({
      ...VALID_TIER1,
      defaultWidth: FRACTIONAL,
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/defaultWidth/)
  })

  it('rejects defaultWidth of 0', () => {
    const result = validateDynamicCardDefinition({
      ...VALID_TIER1,
      defaultWidth: 0,
    })
    expect(result.valid).toBe(false)
  })

  it('accepts defaultWidth of 1', () => {
    const result = validateDynamicCardDefinition({
      ...VALID_TIER1,
      defaultWidth: 1,
    })
    expect(result.valid).toBe(true)
  })

  it('rejects numeric createdAt', () => {
    const result = validateDynamicCardDefinition({
      ...VALID_TIER1,
      createdAt: 12345,
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/createdAt/)
  })

  it('rejects oversized createdAt', () => {
    const TIMESTAMP_MAX = 40
    const result = validateDynamicCardDefinition({
      ...VALID_TIER1,
      createdAt: 'x'.repeat(TIMESTAMP_MAX + 1),
    })
    expect(result.valid).toBe(false)
  })

  it('rejects numeric updatedAt', () => {
    const result = validateDynamicCardDefinition({
      ...VALID_TIER1,
      updatedAt: 99999,
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/updatedAt/)
  })

  it('rejects non-string compiledCode on tier2', () => {
    const result = validateDynamicCardDefinition({
      ...VALID_TIER2,
      compiledCode: 42,
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/compiledCode/)
  })

  it('rejects oversized compiledCode on tier2', () => {
    const result = validateDynamicCardDefinition({
      ...VALID_TIER2,
      compiledCode: 'x'.repeat(MAX_CARD_COMPILED_BYTES + 1),
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/compiledCode.*exceeds/)
  })

  it('rejects non-object cardDefinition on tier1', () => {
    const result = validateDynamicCardDefinition({
      ...VALID_TIER1,
      cardDefinition: 'not-an-object',
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/cardDefinition/)
  })

  it('rejects array cardDefinition on tier1', () => {
    const result = validateDynamicCardDefinition({
      ...VALID_TIER1,
      cardDefinition: [1, 2],
    })
    expect(result.valid).toBe(false)
  })

  it('rejects oversized compileError', () => {
    const result = validateDynamicCardDefinition({
      ...VALID_TIER2,
      compileError: 'x'.repeat(MAX_CARD_DESCRIPTION_LENGTH + 1),
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/compileError/)
  })

  it('rejects non-object metadata', () => {
    const result = validateDynamicCardDefinition({
      ...VALID_TIER1,
      metadata: 'string',
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/metadata/)
  })

  it('accepts valid metadata object', () => {
    const result = validateDynamicCardDefinition({
      ...VALID_TIER1,
      metadata: { author: 'test' },
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

  it('rejects oversized title', () => {
    const result = validateStatsDefinition({
      ...VALID,
      title: 'x'.repeat(MAX_CARD_NAME_LENGTH + 1),
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/title/)
  })

  it('rejects too many blocks', () => {
    const blocks = Array.from({ length: MAX_STATS_BLOCKS + 1 }, (_, i) => ({
      id: `b${i}`,
      label: `Block ${i}`,
    }))
    const result = validateStatsDefinition({ type: 'x', blocks })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/blocks length/)
  })

  it('rejects non-object blocks', () => {
    const result = validateStatsDefinition({
      type: 'x',
      blocks: ['not-an-object'],
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/block must be a plain object/)
  })

  it('rejects block with non-string label', () => {
    const result = validateStatsDefinition({
      type: 'x',
      blocks: [{ id: 'a', label: 42 }],
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/block\.label/)
  })

  it('rejects non-boolean defaultCollapsed', () => {
    const result = validateStatsDefinition({
      ...VALID,
      defaultCollapsed: 'yes',
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/defaultCollapsed/)
  })

  it('rejects non-object grid', () => {
    const result = validateStatsDefinition({
      ...VALID,
      grid: 'not-object',
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/grid/)
  })

  it('accepts optional fields', () => {
    const result = validateStatsDefinition({
      ...VALID,
      title: 'Stats Title',
      defaultCollapsed: true,
      grid: { columns: 2 },
    })
    expect(result.valid).toBe(true)
  })
})
