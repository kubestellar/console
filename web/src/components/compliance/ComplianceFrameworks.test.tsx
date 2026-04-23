import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

// ---------------------------------------------------------------------------
// Mock hooks before importing component
// ---------------------------------------------------------------------------
const mockRefetch = vi.fn()
const mockEvaluate = vi.fn()

let mockFrameworksReturn = {
  frameworks: [
    { id: 'pci-dss-4.0', name: 'PCI-DSS 4.0', version: '4.0', description: 'Payment card standard', category: 'financial', controls: 8, checks: 12 },
    { id: 'soc2-type2', name: 'SOC 2 Type II', version: '2017', description: 'Service org control', category: 'operational', controls: 4, checks: 8 },
  ],
  isLoading: false,
  error: null as string | null,
  refetch: mockRefetch,
}

let mockEvalReturn = {
  result: null as Record<string, unknown> | null,
  isEvaluating: false,
  error: null as string | null,
  evaluate: mockEvaluate,
}

vi.mock('../../hooks/useComplianceFrameworks', () => ({
  useComplianceFrameworks: () => mockFrameworksReturn,
  useFrameworkEvaluation: () => mockEvalReturn,
}))

vi.mock('../../lib/unified/dashboard/UnifiedDashboard', () => ({
  UnifiedDashboard: () => null,
}))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => ({
    clusters: [
      { name: 'prod-east', reachable: true },
      { name: 'prod-west', reachable: true },
    ],
    isLoading: false,
    refetch: vi.fn(),
    lastUpdated: null,
    isRefreshing: false,
    error: null,
  }),
}))

import ComplianceFrameworks from './ComplianceFrameworks'

describe('ComplianceFrameworks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrameworksReturn = {
      frameworks: [
        { id: 'pci-dss-4.0', name: 'PCI-DSS 4.0', version: '4.0', description: 'Payment card standard', category: 'financial', controls: 8, checks: 12 },
        { id: 'soc2-type2', name: 'SOC 2 Type II', version: '2017', description: 'Service org control', category: 'operational', controls: 4, checks: 8 },
      ],
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    }
    mockEvalReturn = {
      result: null,
      isEvaluating: false,
      error: null,
      evaluate: mockEvaluate,
    }
  })

  it('renders page header', () => {
    render(<MemoryRouter><ComplianceFrameworks /></MemoryRouter>)
    expect(screen.getByText('Compliance Frameworks')).toBeDefined()
    expect(screen.getByText(/PCI-DSS 4.0, SOC 2 Type II/)).toBeDefined()
  })

  it('shows framework cards', () => {
    render(<MemoryRouter><ComplianceFrameworks /></MemoryRouter>)
    expect(screen.getAllByText('PCI-DSS 4.0').length).toBeGreaterThan(0)
    expect(screen.getAllByText('SOC 2 Type II').length).toBeGreaterThan(0)
    expect(screen.getByText('8 controls')).toBeDefined()
    expect(screen.getByText('12 checks')).toBeDefined()
  })

  it('shows loading state', () => {
    mockFrameworksReturn.isLoading = true
    render(<MemoryRouter><ComplianceFrameworks /></MemoryRouter>)
    expect(screen.getByText('Loading frameworks…')).toBeDefined()
  })

  it('shows error state', () => {
    mockFrameworksReturn.error = 'Connection failed'
    render(<MemoryRouter><ComplianceFrameworks /></MemoryRouter>)
    expect(screen.getByText('Failed to load frameworks')).toBeDefined()
    expect(screen.getByText('Connection failed')).toBeDefined()
  })

  it('shows retry button on error', () => {
    mockFrameworksReturn.error = 'Timeout'
    render(<MemoryRouter><ComplianceFrameworks /></MemoryRouter>)
    const retryBtn = screen.getByText('Retry')
    expect(retryBtn).toBeDefined()
    fireEvent.click(retryBtn)
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('shows evaluate bar with cluster selector', () => {
    render(<MemoryRouter><ComplianceFrameworks /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /Run Evaluation/i })).toBeDefined()
    const select = document.querySelector('select') as HTMLSelectElement
    expect(select).not.toBeNull()
    expect(select.value).toBe('prod-east')
  })

  it('calls evaluate on button click', () => {
    render(<MemoryRouter><ComplianceFrameworks /></MemoryRouter>)
    const btn = screen.getByRole('button', { name: /Run Evaluation/i })
    fireEvent.click(btn)
    expect(mockEvaluate).toHaveBeenCalledWith('pci-dss-4.0', 'prod-east')
  })

  it('shows evaluation results', () => {
    mockEvalReturn.result = {
      framework_id: 'pci-dss-4.0',
      framework_name: 'PCI-DSS 4.0',
      cluster: 'prod-east',
      score: 75.0,
      passed: 9,
      failed: 2,
      partial: 1,
      skipped: 0,
      total_checks: 12,
      controls: [
        {
          id: 'pci-1',
          name: 'Network Segmentation',
          status: 'pass',
          checks: [
            { id: 'pci-1-1', name: 'Default deny', type: 'network_policy', status: 'pass', message: 'OK', remediation: '', severity: 'high' },
          ],
        },
        {
          id: 'pci-3',
          name: 'Protect Stored Data',
          status: 'fail',
          checks: [
            { id: 'pci-3-1', name: 'Encryption at rest', type: 'encryption_at_rest', status: 'fail', message: 'Not enabled', remediation: 'Enable encryption', severity: 'critical' },
          ],
        },
      ],
      evaluated_at: '2025-01-01T00:00:00Z',
    }

    render(<MemoryRouter><ComplianceFrameworks /></MemoryRouter>)

    expect(screen.getByText('75%')).toBeDefined()
    expect(screen.getByText(/9 passed/)).toBeDefined()
    expect(screen.getByText(/2 failed/)).toBeDefined()
    expect(screen.getByText('pci-1: Network Segmentation')).toBeDefined()
    expect(screen.getByText('pci-3: Protect Stored Data')).toBeDefined()
  })

  it('shows evaluation error', () => {
    mockEvalReturn.error = 'Cluster unreachable'
    render(<MemoryRouter><ComplianceFrameworks /></MemoryRouter>)
    expect(screen.getByText('Cluster unreachable')).toBeDefined()
  })

  it('shows empty state when no evaluation run', () => {
    render(<MemoryRouter><ComplianceFrameworks /></MemoryRouter>)
    expect(screen.getByText(/Select a framework and cluster/)).toBeDefined()
  })

  it('shows evaluating state', () => {
    mockEvalReturn.isEvaluating = true
    render(<MemoryRouter><ComplianceFrameworks /></MemoryRouter>)
    expect(screen.getByText('Evaluating…')).toBeDefined()
  })
})
