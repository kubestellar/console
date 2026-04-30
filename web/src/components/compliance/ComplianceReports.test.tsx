import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock hooks before importing the component

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))
vi.mock('../../lib/unified/dashboard/UnifiedDashboard', () => ({
  UnifiedDashboard: () => null,
}))

vi.mock('../../hooks/useComplianceFrameworks', () => ({
  useComplianceFrameworks: () => ({
    frameworks: [
      { id: 'pci-dss-4.0', name: 'PCI-DSS', version: '4.0', description: 'Payment Card Industry', controls: 8, checks: 12 },
      { id: 'soc2-type2', name: 'SOC 2 Type II', version: '2024', description: 'Service Organization', controls: 4, checks: 8 },
    ],
    isLoading: false,
    error: null as string | null,
    refetch: vi.fn(),
  }),
}))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => ({
    clusters: [
      { name: 'prod-cluster' },
      { name: 'staging-cluster' },
    ],
    deduplicatedClusters: [
      { name: 'prod-cluster' },
      { name: 'staging-cluster' },
    ],
  }),
}))

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn(),
}))

// Import after mocks are set up
import { ComplianceReportsContent as ComplianceReports } from './ComplianceReports'

describe('ComplianceReports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders header and generator card', () => {
    render(<MemoryRouter><ComplianceReports /></MemoryRouter>)
    expect(screen.getByText('Compliance Reports')).toBeInTheDocument()
    expect(screen.getByText('Generate Report')).toBeInTheDocument()
  })

  it('renders framework picker with options', () => {
    render(<MemoryRouter><ComplianceReports /></MemoryRouter>)
    expect(screen.getAllByText(/PCI-DSS/).length).toBeGreaterThan(0)
  })

  it('renders format buttons', () => {
    render(<MemoryRouter><ComplianceReports /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /PDF/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /JSON/ })).toBeInTheDocument()
  })

  it('renders generate button', () => {
    render(<MemoryRouter><ComplianceReports /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /Generate & Download Report/ })).toBeInTheDocument()
  })

  it('renders info section about report types', () => {
    render(<MemoryRouter><ComplianceReports /></MemoryRouter>)
    expect(screen.getByText('PDF Reports')).toBeInTheDocument()
    expect(screen.getByText('JSON Reports')).toBeInTheDocument()
  })
})
