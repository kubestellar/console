import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { ClusterCostsRatesPanel } from '../ClusterCostsRatesPanel'
import { ClusterCostsRow } from '../ClusterCostsRow'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

vi.mock('../../lib/utils/sanitizeUrl', () => ({
  sanitizeUrl: (url: string) => url,
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('../ui/CloudProviderIcon', () => ({
  CloudProviderIcon: () => <span data-testid="cloud-provider-icon" />,
}))

const mockPricing = {
  name: 'AWS',
  cpu: 0.048,
  memory: 0.006,
  gpu: 2.5,
  pricingUrl: 'https://aws.amazon.com/ec2/pricing/',
}

// ── ClusterCostsRatesPanel tests ─────────────────────────────────────────────

describe('ClusterCostsRatesPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when showRatesInfo is false', () => {
    const { container } = render(
      <ClusterCostsRatesPanel
        showRatesInfo={false}
        pricingMode="uniform"
        pricing={mockPricing}
        selectedProvider="aws"
        cpuCost={10}
        memoryCost={5}
        gpuCost={0}
        providerBreakdown={{ aws: 15 }}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders panel when showRatesInfo is true', () => {
    const { container } = render(
      <ClusterCostsRatesPanel
        showRatesInfo={true}
        pricingMode="uniform"
        pricing={mockPricing}
        selectedProvider="aws"
        cpuCost={10}
        memoryCost={5}
        gpuCost={0}
        providerBreakdown={{ aws: 15 }}
      />
    )
    expect(container.firstChild).toBeTruthy()
  })

  it('renders in per-cluster mode', () => {
    render(
      <ClusterCostsRatesPanel
        showRatesInfo={true}
        pricingMode="per-cluster"
        pricing={mockPricing}
        selectedProvider="aws"
        cpuCost={10}
        memoryCost={5}
        gpuCost={0}
        providerBreakdown={{ aws: 10, gcp: 5 }}
      />
    )
    expect(document.body).toBeTruthy()
  })
})

// ── ClusterCostsRow tests ─────────────────────────────────────────────────────

const mockCluster = {
  name: 'prod-cluster',
  provider: 'aws' as const,
  monthly: 400,
  cpu: 10,
  memory: 20,
  gpu: 0,
  nodeCount: 3,
}

describe('ClusterCostsRow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders cluster name', () => {
    const { getByText } = render(
      <ClusterCostsRow
        cluster={mockCluster}
        totalMonthly={1200}
        pricingMode="uniform"
        isOverridden={false}
        isDemoData={false}
        onDrillDown={vi.fn()}
        onCycleProvider={vi.fn()}
        onClearOverride={vi.fn()}
      />
    )
    expect(getByText('prod-cluster')).toBeInTheDocument()
  })

  it('renders with overridden provider', () => {
    render(
      <ClusterCostsRow
        cluster={mockCluster}
        totalMonthly={1200}
        pricingMode="per-cluster"
        isOverridden={true}
        isDemoData={false}
        onDrillDown={vi.fn()}
        onCycleProvider={vi.fn()}
        onClearOverride={vi.fn()}
      />
    )
    expect(document.body).toBeTruthy()
  })

  it('calls onDrillDown when row is clicked', () => {
    const onDrillDown = vi.fn()
    const { container } = render(
      <ClusterCostsRow
        cluster={mockCluster}
        totalMonthly={1200}
        pricingMode="uniform"
        isOverridden={false}
        onDrillDown={onDrillDown}
        onCycleProvider={vi.fn()}
        onClearOverride={vi.fn()}
      />
    )
    const row = container.firstChild as HTMLElement
    row?.click()
    expect(onDrillDown).toHaveBeenCalledWith(mockCluster)
  })
})
