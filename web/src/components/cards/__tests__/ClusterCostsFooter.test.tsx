import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { ClusterCostsFooter } from '../ClusterCostsFooter'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

vi.mock('../../lib/utils/sanitizeUrl', () => ({
  sanitizeUrl: (url: string) => url,
}))

const mockPricing = {
  name: 'AWS',
  cpu: 0.048,
  memory: 0.006,
  gpu: 2.5,
  pricingUrl: 'https://aws.amazon.com/ec2/pricing/',
}

const defaultProps = {
  pricingMode: 'uniform' as const,
  pricing: mockPricing,
  uniqueProviders: ['aws' as const],
  providerBreakdown: { aws: 1200 },
  totalItems: 3,
}

describe('ClusterCostsFooter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders without crashing', () => {
    render(<ClusterCostsFooter {...defaultProps} />)
    expect(document.body).toBeTruthy()
  })

  it('renders with per-cluster pricing mode', () => {
    render(<ClusterCostsFooter {...defaultProps} pricingMode="per-cluster" />)
    expect(document.body).toBeTruthy()
  })

  it('renders with zero total items', () => {
    render(<ClusterCostsFooter {...defaultProps} totalItems={0} />)
    expect(document.body).toBeTruthy()
  })
})
