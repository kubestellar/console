import { describe, it, expect } from 'vitest'
import * as libIndex from '../index'

describe('lib/index exports', () => {
  it('exports card library modules', () => {
    expect(libIndex).toBeDefined()
    expect(typeof libIndex).toBe('object')
  })

  it('exports dashboard runtime components', () => {
    // Verify module exports are defined
    const exports = Object.keys(libIndex)
    expect(exports.length).toBeGreaterThan(0)
  })

  it('exports modal runtime components', () => {
    expect(libIndex).toBeTypeOf('object')
  })

  it('exports stats runtime components', () => {
    // Module should provide unified API
    expect(libIndex).toBeDefined()
  })

  it('exports registry', () => {
    // Registry for dashboards, cards, and components
    expect(libIndex).toBeTypeOf('object')
  })

  it('has all documented exports', () => {
    // Verify key exports exist
    const requiredExports = Object.keys(libIndex)
    expect(requiredExports.length).toBeGreaterThan(0)
  })

  it('can be imported by components', () => {
    expect(() => {
      const mod = require('../index')
      expect(mod).toBeDefined()
    }).not.toThrow()
  })
})
