import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock hooks before importing the component
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
  }),
}))

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn(),
}))

// Import after mocks are set up
import ComplianceReports from './ComplianceReports'

describe('ComplianceReports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders header and generator card', () => {
    render(<ComplianceReports />)
    expect(screen.getByText('Compliance Reports')).toBeInTheDocument()
    expect(screen.getByText('Generate Report')).toBeInTheDocument()
  })

  it('renders framework picker with options', () => {
    render(<ComplianceReports />)
    expect(screen.getAllByText(/PCI-DSS/).length).toBeGreaterThan(0)
  })

  it('renders format buttons', () => {
    render(<ComplianceReports />)
    expect(screen.getByRole('button', { name: /PDF/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /JSON/ })).toBeInTheDocument()
  })

  it('renders generate button', () => {
    render(<ComplianceReports />)
    expect(screen.getByRole('button', { name: /Generate & Download Report/ })).toBeInTheDocument()
  })

  it('renders info section about report types', () => {
    render(<ComplianceReports />)
    expect(screen.getByText('PDF Reports')).toBeInTheDocument()
    expect(screen.getByText('JSON Reports')).toBeInTheDocument()
  })
})
