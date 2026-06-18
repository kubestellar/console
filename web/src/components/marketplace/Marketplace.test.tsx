import { describe, it, expect } from 'vitest'
import { Marketplace } from './Marketplace'
import { MarketplaceControls } from './MarketplaceControls'
import { MarketplaceContent } from './MarketplaceContent'

describe('Marketplace Component', () => {
  it('exports Marketplace component', () => {
    expect(Marketplace).toBeDefined()
    expect(typeof Marketplace).toBe('function')
  })

  it('exports MarketplaceControls component', () => {
    expect(MarketplaceControls).toBeDefined()
    expect(typeof MarketplaceControls).toBe('function')
  })

  it('exports MarketplaceContent component', () => {
    expect(MarketplaceContent).toBeDefined()
    expect(typeof MarketplaceContent).toBe('function')
  })
})
