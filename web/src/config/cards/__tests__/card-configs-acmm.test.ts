/**
 * ACMM Card Config Tests
 *
 * Tests ACMM (Automated Compliance and Maturity Model) card configurations.
 */
import { describe, it, expect } from 'vitest'
import { acmmFeedbackLoopsConfig } from '../acmm-feedback-loops'
import { acmmLevelConfig } from '../acmm-level'
import { acmmRecommendationsConfig } from '../acmm-recommendations'

const acmmCards = [
  { name: 'acmmFeedbackLoops', config: acmmFeedbackLoopsConfig },
  { name: 'acmmLevel', config: acmmLevelConfig },
  { name: 'acmmRecommendations', config: acmmRecommendationsConfig },
]

describe('ACMM card configs', () => {
  it.each(acmmCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })

  it.each(acmmCards)('$name type contains acmm keyword', ({ config }) => {
    expect(config.type.toLowerCase().includes('acmm')).toBe(true)
  })

  it.each(acmmCards)('$name has category maturity', ({ config }) => {
    expect(config.category).toBe('maturity')
  })

  it.each(acmmCards)('$name has valid dimensions', ({ config }) => {
    expect(config.defaultWidth).toBeGreaterThan(0)
    expect(config.defaultHeight).toBeGreaterThan(0)
  })

  it.each(acmmCards)('$name has icon configuration', ({ config }) => {
    expect(config.icon).toBeTruthy()
    if (config.iconColor) {
      expect(config.iconColor).toBeTruthy()
    }
  })
})
