import { describe, it, expect } from 'vitest'
import * as LoginModule from './Login'

describe('Login Component', () => {
  it('exports Login component', () => {
    expect(LoginModule.Login).toBeDefined()
    expect(typeof LoginModule.Login).toBe('function')
  })
})
