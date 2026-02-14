import { describe, it, expect } from 'vitest'
import * as WelcomeCardModule from './WelcomeCard'

describe('WelcomeCard Component', () => {
  it('exports WelcomeCard component', () => {
    expect(WelcomeCardModule.WelcomeCard).toBeDefined()
    expect(typeof WelcomeCardModule.WelcomeCard).toBe('function')
  })
})
