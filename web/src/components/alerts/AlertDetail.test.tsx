import { describe, it, expect } from 'vitest'
import * as AlertDetailModule from './AlertDetail'

describe('AlertDetail Component', () => {
  it('exports AlertDetail component', () => {
    expect(AlertDetailModule.AlertDetail).toBeDefined()
    expect(typeof AlertDetailModule.AlertDetail).toBe('function')
  })
})
