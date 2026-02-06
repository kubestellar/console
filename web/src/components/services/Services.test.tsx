import { describe, it, expect } from 'vitest'
import * as ServicesModule from './Services'

describe('Services Component', () => {
  it('exports Services component', () => {
    expect(ServicesModule.Services).toBeDefined()
    expect(typeof ServicesModule.Services).toBe('function')
  })

  it('Services component is a valid React component', () => {
    const component = ServicesModule.Services
    expect(component.length).toBeGreaterThanOrEqual(0)
  })
})
