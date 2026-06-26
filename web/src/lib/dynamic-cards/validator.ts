import type { DynamicCardDefinition } from './types'
import type { StatsDefinition } from '../stats/types'

/**
 * Schema validation for dynamic card and stats definitions.
 *
 * These validators are the last line of defense before a definition
 * is registered (from localStorage, user file import, URL param, etc.).
 * They enforce length/type/format limits so a malicious or corrupt
 * payload cannot slip into the sandbox compiler or the stats runtime.
 *
 * Philosophy: fail closed. Any field that doesn't match the expected
 * shape causes the whole definition to be rejected.
 */

// Maximum TSX/JS source bytes for a Tier 2 card. Large enough for hand-written
// cards and moderately complex AI-generated ones, small enough to keep parse
// time bounded and prevent "JSON bomb" style payloads in localStorage.
export const MAX_CARD_SOURCE_BYTES = 50_000

// Maximum compiled JS bytes. Compiled code is slightly larger than source
// after JSX expansion, so we allow some headroom.
export const MAX_CARD_COMPILED_BYTES = 100_000

// Maximum length for human-readable names/titles/descriptions.
export const MAX_CARD_NAME_LENGTH = 100
export const MAX_CARD_DESCRIPTION_LENGTH = 500

// Maximum length for icon names, color classes, and other short identifiers.
export const MAX_SHORT_FIELD_LENGTH = 64

// Maximum length for stats type string.
export const MAX_STATS_TYPE_LENGTH = 100

// Maximum number of stat blocks per stats definition.
export const MAX_STATS_BLOCKS = 50

// Slug regex for card ids: letters, digits, hyphen, underscore.
// Length 1-64. No whitespace, no path separators, no dots.
const CARD_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/

// Stats type regex: same rules as card id.
const STATS_TYPE_REGEX = /^[A-Za-z0-9_-]{1,100}$/

// Allowed top-level keys on a DynamicCardDefinition.
// Any extra key causes strict rejection (defense against prototype / polluted
// payloads that try to sneak extra properties into the registry).
const ALLOWED_CARD_KEYS = new Set<string>([
  'id',
  'title',
  'tier',
  'description',
  'icon',
  'iconColor',
  'defaultWidth',
  'createdAt',
  'updatedAt',
  'cardDefinition',
  'sourceCode',
  'compiledCode',
  'compileError',
  'metadata',
])

// Allowed top-level keys on a StatsDefinition for persistence.
const ALLOWED_STATS_KEYS = new Set<string>([
  'type',
  'title',
  'blocks',
  'defaultCollapsed',
  'grid',
])

/** Result of a validation pass. */
export interface ValidationResult<T> {
  /** True when the input passed all checks. */
  valid: boolean
  /** The (narrowed) value — only defined when valid. */
  value?: T
  /** Human-readable error message when invalid. */
  error?: string
}

/** Compute the UTF-8 byte length of a string without pulling in Buffer. */
function byteLength(s: string): number {
  // TextEncoder is available in all modern browsers and in jsdom.
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(s).length
  }
  // Fallback: conservative upper bound.
  return s.length * 4
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isBoundedString(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max
}

function isOptionalBoundedString(v: unknown, max: number): boolean {
  return v === undefined || (typeof v === 'string' && v.length <= max)
}

/**
 * Validate a DynamicCardDefinition from an untrusted source.
 * Returns a ValidationResult with an error message on failure.
 */
export function validateDynamicCardDefinition(
  input: unknown,
): ValidationResult<DynamicCardDefinition> {
  if (!isPlainObject(input)) {
    return { valid: false, error: 'Definition must be a plain object' }
  }

  // Strict: reject unknown top-level keys.
  for (const key of Object.keys(input)) {
    if (!ALLOWED_CARD_KEYS.has(key)) {
      return { valid: false, error: `Unknown field: ${key}` }
    }
  }

  // id
  if (typeof input.id !== 'string' || !CARD_ID_REGEX.test(input.id)) {
    return { valid: false, error: 'id must match ^[A-Za-z0-9_-]{1,64}$' }
  }

  // title
  if (!isBoundedString(input.title, MAX_CARD_NAME_LENGTH)) {
    return {
      valid: false,
      error: `title must be a non-empty string ≤${MAX_CARD_NAME_LENGTH} chars`,
    }
  }

  // tier
  if (input.tier !== 'tier1' && input.tier !== 'tier2') {
    return { valid: false, error: "tier must be 'tier1' or 'tier2'" }
  }

  // description (optional)
  if (!isOptionalBoundedString(input.description, MAX_CARD_DESCRIPTION_LENGTH)) {
    return {
      valid: false,
      error: `description must be a string ≤${MAX_CARD_DESCRIPTION_LENGTH} chars`,
    }
  }

  // icon / iconColor (optional short strings)
  if (!isOptionalBoundedString(input.icon, MAX_SHORT_FIELD_LENGTH)) {
    return { valid: false, error: 'icon too long or wrong type' }
  }
  if (!isOptionalBoundedString(input.iconColor, MAX_SHORT_FIELD_LENGTH)) {
    return { valid: false, error: 'iconColor too long or wrong type' }
  }

  // defaultWidth (optional small integer 1..12)
  if (input.defaultWidth !== undefined) {
    const w = input.defaultWidth
    if (typeof w !== 'number' || !Number.isInteger(w) || w < 1 || w > 12) {
      return { valid: false, error: 'defaultWidth must be an integer 1..12' }
    }
  }

  // createdAt / updatedAt — optional for backward compatibility with
  // definitions that predate strict validation. When present, must be a
  // bounded string. Length 10..40 covers "2024-01-01" through full ISO.
  const TIMESTAMP_MAX = 40
  if (
    input.createdAt !== undefined &&
    (typeof input.createdAt !== 'string' || input.createdAt.length > TIMESTAMP_MAX)
  ) {
    return { valid: false, error: 'createdAt must be a timestamp string' }
  }
  if (
    input.updatedAt !== undefined &&
    (typeof input.updatedAt !== 'string' || input.updatedAt.length > TIMESTAMP_MAX)
  ) {
    return { valid: false, error: 'updatedAt must be a timestamp string' }
  }

  // Tier 2: sourceCode required (and optional compiledCode)
  if (input.tier === 'tier2') {
    if (typeof input.sourceCode !== 'string' || input.sourceCode.length === 0) {
      return { valid: false, error: 'tier2 card requires sourceCode string' }
    }
    if (byteLength(input.sourceCode) > MAX_CARD_SOURCE_BYTES) {
      return {
        valid: false,
        error: `sourceCode exceeds ${MAX_CARD_SOURCE_BYTES} bytes`,
      }
    }
    if (input.compiledCode !== undefined) {
      if (typeof input.compiledCode !== 'string') {
        return { valid: false, error: 'compiledCode must be a string' }
      }
      if (byteLength(input.compiledCode) > MAX_CARD_COMPILED_BYTES) {
        return {
          valid: false,
          error: `compiledCode exceeds ${MAX_CARD_COMPILED_BYTES} bytes`,
        }
      }
    }
  } else {
    // Tier 1: cardDefinition should be an object when present.
    if (input.cardDefinition !== undefined && !isPlainObject(input.cardDefinition)) {
      return { valid: false, error: 'cardDefinition must be an object' }
    }
  }

  // compileError (optional string, short)
  if (!isOptionalBoundedString(input.compileError, MAX_CARD_DESCRIPTION_LENGTH)) {
    return { valid: false, error: 'compileError too long or wrong type' }
  }

  // metadata (optional plain object)
  if (input.metadata !== undefined && !isPlainObject(input.metadata)) {
    return { valid: false, error: 'metadata must be a plain object' }
  }

  return { valid: true, value: input as unknown as DynamicCardDefinition }
}

/**
 * Validate a StatsDefinition from an untrusted source.
 * Returns a ValidationResult with an error message on failure.
 */
export function validateStatsDefinition(
  input: unknown,
): ValidationResult<StatsDefinition> {
  if (!isPlainObject(input)) {
    return { valid: false, error: 'Definition must be a plain object' }
  }

  for (const key of Object.keys(input)) {
    if (!ALLOWED_STATS_KEYS.has(key)) {
      return { valid: false, error: `Unknown field: ${key}` }
    }
  }

  if (typeof input.type !== 'string' || !STATS_TYPE_REGEX.test(input.type)) {
    return {
      valid: false,
      error: `type must match ^[A-Za-z0-9_-]{1,${MAX_STATS_TYPE_LENGTH}}$`,
    }
  }

  if (!isOptionalBoundedString(input.title, MAX_CARD_NAME_LENGTH)) {
    return { valid: false, error: 'title too long or wrong type' }
  }

  if (!Array.isArray(input.blocks)) {
    return { valid: false, error: 'blocks must be an array' }
  }
  if (input.blocks.length > MAX_STATS_BLOCKS) {
    return {
      valid: false,
      error: `blocks length exceeds ${MAX_STATS_BLOCKS}`,
    }
  }
  for (const block of input.blocks) {
    if (!isPlainObject(block)) {
      return { valid: false, error: 'each block must be a plain object' }
    }
    if (typeof block.id !== 'string' || block.id.length === 0) {
      return { valid: false, error: 'block.id must be a non-empty string' }
    }
    if (typeof block.label !== 'string') {
      return { valid: false, error: 'block.label must be a string' }
    }
  }

  if (
    input.defaultCollapsed !== undefined &&
    typeof input.defaultCollapsed !== 'boolean'
  ) {
    return { valid: false, error: 'defaultCollapsed must be a boolean' }
  }

  if (input.grid !== undefined && !isPlainObject(input.grid)) {
    return { valid: false, error: 'grid must be a plain object' }
  }

  return { valid: true, value: input as unknown as StatsDefinition }
}
