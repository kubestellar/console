/**
 * Card Configuration Registry Tests
 *
 * Validates the card config registry functions and that all registered
 * card configs have valid structures.
 */
import { describe, it, expect } from 'vitest'
import {
  CARD_CONFIGS,
  getCardConfig,
  hasUnifiedConfig,
  getUnifiedCardTypes,
  getCardProjectTags,
  CARD_PROJECT_TAGS,
} from '../index'

/** Minimum number of card configs we expect */
const MIN_CARD_COUNT = 140

describe('Card Config Registry', () => {
  it('has a substantial number of registered cards', () => {
    const types = getUnifiedCardTypes()
    expect(types.length).toBeGreaterThanOrEqual(MIN_CARD_COUNT)
  })

  it('getCardConfig returns config for known types', () => {
    expect(getCardConfig('active_alerts')).toBeDefined()
    expect(getCardConfig('pod_issues')).toBeDefined()
    expect(getCardConfig('node_status')).toBeDefined()
  })

  it('getCardConfig returns undefined for unknown types', () => {
    expect(getCardConfig('nonexistent_card_type')).toBeUndefined()
  })

  it('hasUnifiedConfig returns true for registered cards', () => {
    expect(hasUnifiedConfig('active_alerts')).toBe(true)
    expect(hasUnifiedConfig('cluster_health')).toBe(true)
  })

  it('hasUnifiedConfig returns false for unknown cards', () => {
    expect(hasUnifiedConfig('does_not_exist')).toBe(false)
  })

  it('getUnifiedCardTypes returns string array', () => {
    const types = getUnifiedCardTypes()
    types.forEach(t => {
      expect(typeof t).toBe('string')
      expect(t.length).toBeGreaterThan(0)
    })
  })

  it('getCardProjectTags returns tags from config or fallback', () => {
    // benchmark_hero is in CARD_PROJECT_TAGS, not CARD_CONFIGS
    const tags = getCardProjectTags('benchmark_hero')
    expect(tags).toBeDefined()
    expect(Array.isArray(tags)).toBe(true)
  })

  it('getCardProjectTags returns undefined for universal cards', () => {
    // active_alerts has no projects field and is not in CARD_PROJECT_TAGS
    const config = getCardConfig('active_alerts')
    if (!config?.projects && !CARD_PROJECT_TAGS['active_alerts']) {
      expect(getCardProjectTags('active_alerts')).toBeUndefined()
    }
  })
})

describe('All card configs have valid structure', () => {
  const entries = Object.entries(CARD_CONFIGS)

  it.each(entries)('%s has required type field', (_key, config) => {
    expect(config.type).toBeTruthy()
    expect(typeof config.type).toBe('string')
  })

  it.each(entries)('%s has required title field', (_key, config) => {
    expect(config.title).toBeTruthy()
    expect(typeof config.title).toBe('string')
  })

  it.each(entries)('%s has required category field', (_key, config) => {
    expect(config.category).toBeTruthy()
    expect(typeof config.category).toBe('string')
  })

  it.each(entries)('%s has a dataSource', (_key, config) => {
    expect(config.dataSource).toBeDefined()
    expect(config.dataSource.type).toBeTruthy()
  })

  it.each(entries)('%s has a content config', (_key, config) => {
    expect(config.content).toBeDefined()
    expect(config.content.type).toBeTruthy()
  })
})

describe('Card config type matches registry key', () => {
  it('each card config type matches its registry key', () => {
    Object.entries(CARD_CONFIGS).forEach(([key, config]) => {
      expect(config.type).toBe(key)
    })
  })
})

describe('No duplicate card types in registry', () => {
  it('all card types are unique', () => {
    const types = Object.values(CARD_CONFIGS).map(c => c.type)
    const unique = new Set(types)
    expect(unique.size).toBe(types.length)
  })
})

describe('Card config dimensions are reasonable', () => {
  const entries = Object.entries(CARD_CONFIGS)

  it.each(entries)('%s has valid default dimensions', (_key, config) => {
    if (config.defaultWidth !== undefined) {
      expect(config.defaultWidth).toBeGreaterThanOrEqual(3)
      expect(config.defaultWidth).toBeLessThanOrEqual(12)
    }
    if (config.defaultHeight !== undefined) {
      expect(config.defaultHeight).toBeGreaterThan(0)
      expect(config.defaultHeight).toBeLessThanOrEqual(10)
    }
  })
})
