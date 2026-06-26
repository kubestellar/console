import { describe, it, expect } from 'vitest'
import { ConfigureCardModal } from './ConfigureCardModal'

describe('ConfigureCardModal Component', () => {
  it('exports ConfigureCardModal component', () => {
    expect(ConfigureCardModal).toBeDefined()
    expect(typeof ConfigureCardModal).toBe('function')
  })
})
