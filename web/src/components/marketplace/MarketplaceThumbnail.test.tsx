import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/cncf-constants', () => ({
  CNCF_CATEGORY_GRADIENTS: {},
  CNCF_CATEGORY_ICONS: {},
}))

import { MarketplaceThumbnail } from './MarketplaceThumbnail'

describe('MarketplaceThumbnail Component', () => {
  it('exports MarketplaceThumbnail component', () => {
    expect(MarketplaceThumbnail).toBeDefined()
    expect(typeof MarketplaceThumbnail).toBe('function')
  })

  it('renders with required props', () => {
    const props = {
      id: 'test-1',
      type: 'dashboard' as const,
      title: 'Test Title',
    }

    expect(() => {
      MarketplaceThumbnail(props)
    }).not.toThrow()
  })
})
