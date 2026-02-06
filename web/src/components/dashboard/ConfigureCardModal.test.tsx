import { describe, it, expect } from 'vitest'
import * as ConfigureCardModalModule from './ConfigureCardModal'

describe('ConfigureCardModal Component', () => {
  it('exports ConfigureCardModal component', () => {
    expect(ConfigureCardModalModule.ConfigureCardModal).toBeDefined()
    expect(typeof ConfigureCardModalModule.ConfigureCardModal).toBe('function')
  })
})
