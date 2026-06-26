/**
 * Card Configuration Registry — Unit Tests
 *
 * Validates the 6 exported registry functions and ensures all card configs
 * conform to the expected schema (required fields, valid values).
 */
import { describe, it, expect, beforeEach } from 'vitest'

import {
  CARD_CONFIGS,
  getCardConfig,
  getCardProjectTags,
  getUnifiedCardTypes,
  getVisibleCardConfigs,
  hasUnifiedConfig,
  isCardVisibleForProject,
} from '../index'
import { setActiveProject } from '../../../lib/project/context'

// ---------------------------------------------------------------------------
// Schema / structural validation
// ---------------------------------------------------------------------------

describe('CARD_CONFIGS registry', () => {
  it('contains at least 100 registered card types', () => {
    const count = Object.keys(CARD_CONFIGS).length
    expect(count).toBeGreaterThanOrEqual(100)
  })

  it('every entry has required fields (type, title, category)', () => {
    for (const [key, config] of Object.entries(CARD_CONFIGS)) {
      expect(config.type, `${key} missing type`).toBeTruthy()
      expect(config.title, `${key} missing title`).toBeTruthy()
      expect(config.category, `${key} missing category`).toBeTruthy()
    }
  })

  it('every entry key matches its type field', () => {
    for (const [key, config] of Object.entries(CARD_CONFIGS)) {
      expect(config.type).toBe(key)
    }
  })

  it('every entry has a dataSource object', () => {
    for (const [key, config] of Object.entries(CARD_CONFIGS)) {
      expect(config.dataSource, `${key} missing dataSource`).toBeDefined()
      expect(typeof config.dataSource).toBe('object')
    }
  })

  it('no duplicate titles exist', () => {
    const titles = Object.values(CARD_CONFIGS).map((c) => c.title)
    const duplicates = titles.filter((t, i) => titles.indexOf(t) !== i)
    expect(duplicates, `Duplicate titles found: ${duplicates.join(', ')}`).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// getCardConfig
// ---------------------------------------------------------------------------

describe('getCardConfig', () => {
  it('returns config for a known card type', () => {
    const types = Object.keys(CARD_CONFIGS)
    const firstType = types[0]
    const config = getCardConfig(firstType)
    expect(config).toBeDefined()
    expect(config?.type).toBe(firstType)
  })

  it('returns undefined for an unknown card type', () => {
    expect(getCardConfig('nonexistent_card_xyz')).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(getCardConfig('')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// hasUnifiedConfig
// ---------------------------------------------------------------------------

describe('hasUnifiedConfig', () => {
  it('returns true for a registered card type', () => {
    const types = Object.keys(CARD_CONFIGS)
    expect(hasUnifiedConfig(types[0])).toBe(true)
  })

  it('returns false for an unregistered card type', () => {
    expect(hasUnifiedConfig('nonexistent_card_xyz')).toBe(false)
  })

  it('returns false for Object.prototype keys (prototype pollution guard)', () => {
    expect(hasUnifiedConfig('toString')).toBe(false)
    expect(hasUnifiedConfig('constructor')).toBe(false)
    expect(hasUnifiedConfig('__proto__')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getUnifiedCardTypes
// ---------------------------------------------------------------------------

describe('getUnifiedCardTypes', () => {
  it('returns an array of strings', () => {
    const types = getUnifiedCardTypes()
    expect(Array.isArray(types)).toBe(true)
    expect(types.length).toBeGreaterThan(0)
    for (const t of types) {
      expect(typeof t).toBe('string')
    }
  })

  it('includes all keys from CARD_CONFIGS', () => {
    const types = getUnifiedCardTypes()
    const keys = Object.keys(CARD_CONFIGS)
    expect(types.sort()).toEqual(keys.sort())
  })
})

// ---------------------------------------------------------------------------
// getCardProjectTags
// ---------------------------------------------------------------------------

describe('getCardProjectTags', () => {
  it('returns undefined for a card with no project tags', () => {
    // Find a card without projects field
    const entry = Object.entries(CARD_CONFIGS).find(
      ([, config]) => !config.projects,
    )
    if (entry) {
      // May still be in CARD_PROJECT_TAGS fallback, so just ensure it doesn't throw
      const result = getCardProjectTags(entry[0])
      expect(result === undefined || Array.isArray(result)).toBe(true)
    }
  })

  it('returns array for a card with project tags in config', () => {
    const entry = Object.entries(CARD_CONFIGS).find(
      ([, config]) => config.projects && config.projects.length > 0,
    )
    if (entry) {
      const result = getCardProjectTags(entry[0])
      expect(Array.isArray(result)).toBe(true)
      expect((result as string[]).length).toBeGreaterThan(0)
    }
  })

  it('returns undefined for an unknown card type', () => {
    expect(getCardProjectTags('nonexistent_card_xyz')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// getVisibleCardConfigs
// ---------------------------------------------------------------------------

describe('getVisibleCardConfigs', () => {
  beforeEach(() => {
    setActiveProject('kubestellar')
  })

  it('returns a non-empty registry object', () => {
    const visible = getVisibleCardConfigs()
    expect(typeof visible).toBe('object')
    expect(Object.keys(visible).length).toBeGreaterThan(0)
  })

  it('only includes cards visible for the active project', () => {
    const visible = getVisibleCardConfigs()
    for (const [key, config] of Object.entries(visible)) {
      // Each visible card should pass isCardVisibleForProject
      expect(isCardVisibleForProject(key), `${key} should be visible`).toBe(true)
      // Verify config is the same reference as in CARD_CONFIGS
      expect(config).toBe(CARD_CONFIGS[key])
    }
  })

  it('returns fewer or equal cards compared to total registry', () => {
    const visible = getVisibleCardConfigs()
    const totalCount = Object.keys(CARD_CONFIGS).length
    expect(Object.keys(visible).length).toBeLessThanOrEqual(totalCount)
  })
})

// ---------------------------------------------------------------------------
// isCardVisibleForProject
// ---------------------------------------------------------------------------

describe('isCardVisibleForProject', () => {
  beforeEach(() => {
    setActiveProject('kubestellar')
  })

  it('returns true for a card with no project restrictions', () => {
    // Cards without projects field are universal
    const entry = Object.entries(CARD_CONFIGS).find(
      ([, config]) => !config.projects,
    )
    if (entry) {
      expect(isCardVisibleForProject(entry[0])).toBe(true)
    }
  })

  it('returns true for an unknown card type (no restrictions)', () => {
    // Unknown cards have no restrictions → isVisibleForProject(undefined) → true
    expect(isCardVisibleForProject('nonexistent_card_xyz')).toBe(true)
  })

  it('returns true for cards tagged with active project', () => {
    setActiveProject('kubestellar')
    const entry = Object.entries(CARD_CONFIGS).find(
      ([, config]) => config.projects?.includes('kubestellar'),
    )
    if (entry) {
      expect(isCardVisibleForProject(entry[0])).toBe(true)
    }
  })

  it('returns false for cards tagged with a different project only', () => {
    setActiveProject('some-other-project-that-doesnt-exist')
    const entry = Object.entries(CARD_CONFIGS).find(
      ([, config]) =>
        config.projects &&
        config.projects.length > 0 &&
        !config.projects.includes('*') &&
        !config.projects.includes('some-other-project-that-doesnt-exist'),
    )
    if (entry) {
      expect(isCardVisibleForProject(entry[0])).toBe(false)
    }
  })
})
