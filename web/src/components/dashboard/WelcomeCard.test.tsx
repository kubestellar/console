import { describe, it, expect } from 'vitest'
import { WelcomeCard } from './WelcomeCard'

describe('WelcomeCard Component', () => {
  it('exports WelcomeCard component', () => {
    expect(WelcomeCard).toBeDefined()
    expect(typeof WelcomeCard).toBe('function')
  })
})
