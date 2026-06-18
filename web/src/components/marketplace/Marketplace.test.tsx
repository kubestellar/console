import { describe, expect, it } from 'vitest'
import {
  Marketplace,
  MarketplaceCard,
  MarketplaceRow,
  TYPE_LABELS,
  VIEW_MODE_KEY,
} from './Marketplace'

describe('Marketplace module', () => {
  it('exports the main component and extracted helpers', () => {
    expect(Marketplace).toBeDefined()
    expect(typeof Marketplace).toBe('function')
    expect(MarketplaceCard).toBeDefined()
    expect(MarketplaceRow).toBeDefined()
    expect(TYPE_LABELS.dashboard.label).toBe('Dashboards')
    expect(VIEW_MODE_KEY).toBe('kc-marketplace-view-mode')
  })
})
