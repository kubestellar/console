import { describe, it, expect } from 'vitest'
import { MiniDashboard } from './MiniDashboard'

describe('MiniDashboard Component', () => {
  it('exports MiniDashboard component', () => {
    expect(MiniDashboard).toBeDefined()
    expect(typeof MiniDashboard).toBe('function')
  })
})
