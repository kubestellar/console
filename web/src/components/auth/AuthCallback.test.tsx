import { describe, it, expect } from 'vitest'
import * as AuthCallbackModule from './AuthCallback'

describe('AuthCallback Component', () => {
  it('exports AuthCallback component', () => {
    expect(AuthCallbackModule.AuthCallback).toBeDefined()
    expect(typeof AuthCallbackModule.AuthCallback).toBe('function')
  })
})
