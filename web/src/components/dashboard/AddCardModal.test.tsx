import { describe, it, expect } from 'vitest'
import * as AddCardModalModule from './AddCardModal'

describe('AddCardModal Component', () => {
  it('exports AddCardModal component', () => {
    expect(AddCardModalModule.AddCardModal).toBeDefined()
    expect(typeof AddCardModalModule.AddCardModal).toBe('function')
  })
})
