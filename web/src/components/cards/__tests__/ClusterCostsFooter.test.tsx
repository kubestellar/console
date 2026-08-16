import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClusterCostsFooter } from '../ClusterCostsFooter'
import { CLOUD_PRICING, type CloudPricing } from '../ClusterCosts.constants'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'count' in opts ? `${key}:${opts.count}` : key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../../../lib/utils/sanitizeUrl', () => ({
  sanitizeUrl: (url: string) => url,
}))

const pricing: CloudPricing = CLOUD_PRICING.aws

describe('ClusterCostsFooter', () => {
  it('shows the uniform-pricing summary and pricing links', () => {
    render(
      <ClusterCostsFooter
        pricingMode="uniform"
        pricing={pricing}
        uniqueProviders={[]}
        providerBreakdown={{}}
        totalItems={4}
      />,
    )

    expect(screen.getByText('cards:clusterCosts.basedOnRates')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'cards:clusterCosts.finOpsFoundation' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'cards:clusterCosts.k8sResourceMgmtLink' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'cards:clusterCosts.openCostSpecLink' })).toBeInTheDocument()
    expect(screen.getByText('cards:clusterCosts.clusterCount:4')).toBeInTheDocument()
    expect(screen.getByTitle('cards:clusterCosts.viewOfficialPricing')).toBeInTheDocument()
  })

  it('shows mixed-pricing provider badges', () => {
    render(
      <ClusterCostsFooter
        pricingMode="per-cluster"
        pricing={pricing}
        uniqueProviders={['aws', 'gcp']}
        providerBreakdown={{ aws: 2, gcp: 1 }}
        totalItems={3}
      />,
    )

    expect(screen.getByText('cards:clusterCosts.mixedPricing')).toBeInTheDocument()
    expect(screen.getByText('AWS (2)')).toBeInTheDocument()
    expect(screen.getByText('GCP (1)')).toBeInTheDocument()
    expect(screen.getByText('cards:clusterCosts.clusterCount:3')).toBeInTheDocument()
  })
})
