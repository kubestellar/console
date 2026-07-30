import React from 'react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../hooks/useMarketplace', () => ({
  useMarketplace: () => ({ items: [] }),
}))

import { MarketplaceCard } from './MarketplaceCard'

describe('MarketplaceCard Component', () => {
  it('exports MarketplaceCard component', () => {
    expect(MarketplaceCard).toBeDefined()
    expect(typeof MarketplaceCard).toBe('function')
  })

  it('renders with required props', () => {
    const item = {
      id: 'test-1',
      name: 'Test Card',
      type: 'dashboard' as const,
      status: 'graduated' as const,
      description: 'Test description',
    }
    const onInstall = vi.fn()
    const onRemove = vi.fn()

    expect(() => {
      MarketplaceCard({ item, onInstall, onRemove, isInstalled: false })
    }).not.toThrow()
  })
})
