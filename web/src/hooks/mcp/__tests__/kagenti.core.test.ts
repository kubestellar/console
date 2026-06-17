import { describe, it, expect } from 'vitest'
import { useKagentiAgents, useKagentiBuilds, useKagentiCards, useKagentiTools } from '../kagenti'

describe('kagenti core', () => {
  it('exports core kagenti hooks', () => {
    expect(typeof useKagentiAgents).toBe('function')
    expect(typeof useKagentiBuilds).toBe('function')
    expect(typeof useKagentiCards).toBe('function')
    expect(typeof useKagentiTools).toBe('function')
  })
})
