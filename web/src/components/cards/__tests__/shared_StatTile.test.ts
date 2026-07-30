import { describe, it, expect } from 'vitest'
import { StatTile } from '../shared/StatTile'

describe('StatTile', () => {
  it('exports a function component', () => {
    expect(typeof StatTile).toBe('function')
  })

  it('has the expected function name', () => {
    expect(StatTile.name).toBe('StatTile')
  })
})
