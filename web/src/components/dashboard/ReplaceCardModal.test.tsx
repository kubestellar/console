import { describe, it, expect } from 'vitest'
import * as ReplaceCardModalModule from './ReplaceCardModal'

describe('ReplaceCardModal Component', () => {
  it('exports ReplaceCardModal component', () => {
    expect(ReplaceCardModalModule.ReplaceCardModal).toBeDefined()
    expect(typeof ReplaceCardModalModule.ReplaceCardModal).toBe('function')
  })
})
