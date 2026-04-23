import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import DataResidency from './DataResidency'

/* ─── Mock data ─── */

const mockSummary = {
  total_rules: 5,
  total_clusters: 6,
  total_violations: 3,
  compliant: 3,
  non_compliant: 3,
  by_severity: { critical: 2, high: 1 },
  by_region: { us: 1, eu: 1, apac: 1 },
}

const mockRules = [
  { id: 'r1', classification: 'eu-personal-data', allowed_regions: ['eu', 'uk'], description: 'EU personal data (GDPR)', enforcement: 'deny' },
  { id: 'r2', classification: 'pci-cardholder', allowed_regions: ['us', 'eu', 'uk'], description: 'PCI DSS cardholder data', enforcement: 'warn' },
]

const mockClusters = [
  { cluster: 'prod-us-east', region: 'us', jurisdiction: 'United States' },
  { cluster: 'prod-eu-west', region: 'eu', jurisdiction: 'European Union' },
  { cluster: 'prod-apac', region: 'apac', jurisdiction: 'APAC' },
]

const mockViolations = [
  {
    id: 'v1', cluster: 'prod-us-east', cluster_region: 'us', namespace: 'customer-data',
    workload_name: 'eu-customer-sync', workload_kind: 'Deployment', classification: 'eu-personal-data',
    allowed_regions: ['eu', 'uk'], severity: 'critical', detected_at: '2026-04-22T10:00:00Z',
    message: 'EU personal data workload running in US region',
  },
  {
    id: 'v2', cluster: 'prod-apac', cluster_region: 'apac', namespace: 'payments',
    workload_name: 'payment-processor', workload_kind: 'StatefulSet', classification: 'pci-cardholder',
    allowed_regions: ['us', 'eu', 'uk'], severity: 'high', detected_at: '2026-04-22T10:05:00Z',
    message: 'PCI cardholder data workload running in APAC region',
  },
]

/* ─── Helpers ─── */

function mockFetchSuccess() {
  vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
    const u = typeof url === 'string' ? url : url.toString()
    if (u.includes('/summary')) return Promise.resolve(new Response(JSON.stringify(mockSummary)))
    if (u.includes('/rules')) return Promise.resolve(new Response(JSON.stringify(mockRules)))
    if (u.includes('/clusters')) return Promise.resolve(new Response(JSON.stringify(mockClusters)))
    if (u.includes('/violations')) return Promise.resolve(new Response(JSON.stringify(mockViolations)))
    return Promise.resolve(new Response('{}'))
  })
}

function mockFetchFailure() {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))
}

/* ─── Tests ─── */

describe('DataResidency', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('renders summary cards with correct values', async () => {
    mockFetchSuccess()
    render(<DataResidency />)
    await waitFor(() => {
      expect(screen.getByText('Data Residency Enforcement')).toBeInTheDocument()
      expect(screen.getByText('Rules')).toBeInTheDocument()
      expect(screen.getByText('Clusters')).toBeInTheDocument()
      expect(screen.getByText('Violations (2)')).toBeInTheDocument()
    })
  })

  it('renders cluster region cards', async () => {
    mockFetchSuccess()
    render(<DataResidency />)
    await waitFor(() => {
      expect(screen.getByText('prod-us-east')).toBeInTheDocument()
      expect(screen.getByText('prod-eu-west')).toBeInTheDocument()
      expect(screen.getByText('prod-apac')).toBeInTheDocument()
    })
  })

  it('renders residency rules', async () => {
    mockFetchSuccess()
    render(<DataResidency />)
    await waitFor(() => {
      expect(screen.getByText('eu-personal-data')).toBeInTheDocument()
      expect(screen.getByText('pci-cardholder')).toBeInTheDocument()
    })
  })

  it('renders violations with severity badges', async () => {
    mockFetchSuccess()
    render(<DataResidency />)
    await waitFor(() => {
      expect(screen.getByText('Deployment/eu-customer-sync')).toBeInTheDocument()
      expect(screen.getByText('critical')).toBeInTheDocument()
      expect(screen.getByText('StatefulSet/payment-processor')).toBeInTheDocument()
      expect(screen.getByText('high')).toBeInTheDocument()
    })
  })

  it('shows error state on fetch failure', async () => {
    mockFetchFailure()
    render(<DataResidency />)
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
      expect(screen.getByText('Retry')).toBeInTheDocument()
    })
  })
})
