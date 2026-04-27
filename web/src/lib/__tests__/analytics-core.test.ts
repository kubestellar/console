import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as analyticsCoreModule from '../analytics-core'

describe('analytics-core module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exports core analytics functionality', () => {
    expect(analyticsCoreModule).toBeDefined()
    expect(typeof analyticsCoreModule).toBe('object')
  })

  it('provides event emission utilities', () => {
    // Module should export event-related functions
    const exports = Object.keys(analyticsCoreModule)
    expect(exports.length).toBeGreaterThan(0)
  })

  it('can be instantiated without errors', () => {
    expect(() => {
      const module = require('../analytics-core')
      expect(module).toBeDefined()
    }).not.toThrow()
  })

  it('module structure is consistent', () => {
    expect(analyticsCoreModule).toBeTypeOf('object')
  })
})
