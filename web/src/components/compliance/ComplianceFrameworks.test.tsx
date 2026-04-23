import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

// Mock the shared cluster cache used by the lightweight useClusterNames hook (#9769).
// Use importOriginal so that re-exported constants (CLUSTER_POLL_INTERVAL_MS, etc.)
// remain available to transitive imports such as ClusterMetrics → cardRegistry.
vi.mock('../../hooks/mcp/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/mcp/shared')>()
  return {
    ...actual,
    clusterCache: {
      clusters: [
        { name: 'prod-east', reachable: true },
        { name: 'prod-west', reachable: true },
      ],
    },
    subscribeClusterData: () => () => {},
  }
})

import { ComplianceFrameworksContent as ComplianceFrameworks } from './ComplianceFrameworks'

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
    render(<ComplianceFrameworks />)
    expect(screen.getByText('Compliance Frameworks')).toBeDefined()
    expect(screen.getByText(/PCI-DSS 4.0, SOC 2 Type II/)).toBeDefined()
  })

  it('shows framework cards', () => {
    render(<ComplianceFrameworks />)
    expect(screen.getAllByText('PCI-DSS 4.0').length).toBeGreaterThan(0)
    expect(screen.getAllByText('SOC 2 Type II').length).toBeGreaterThan(0)
    expect(screen.getByText('8 controls')).toBeDefined()
    expect(screen.getByText('12 checks')).toBeDefined()
  })

  it('shows loading state', () => {
    mockFrameworksReturn.isLoading = true
    render(<ComplianceFrameworks />)
    expect(screen.getByText('Loading frameworks…')).toBeDefined()
  })

  it('shows error state', () => {
    mockFrameworksReturn.error = 'Connection failed'
    render(<ComplianceFrameworks />)
    expect(screen.getByText('Failed to load frameworks')).toBeDefined()
    expect(screen.getByText('Connection failed')).toBeDefined()
  })

  it('shows retry button on error', () => {
    mockFrameworksReturn.error = 'Timeout'
    render(<ComplianceFrameworks />)
    const retryBtn = screen.getByText('Retry')
    expect(retryBtn).toBeDefined()
    fireEvent.click(retryBtn)
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('shows evaluate bar with cluster selector', () => {
    render(<ComplianceFrameworks />)
    expect(screen.getByRole('button', { name: /Run Evaluation/i })).toBeDefined()
    const select = document.querySelector('select') as HTMLSelectElement
    expect(select).not.toBeNull()
    expect(select.value).toBe('prod-east')
  })

  it('calls evaluate on button click', () => {
    render(<ComplianceFrameworks />)
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

    render(<ComplianceFrameworks />)

    expect(screen.getByText('75%')).toBeDefined()
    expect(screen.getByText(/9 passed/)).toBeDefined()
    expect(screen.getByText(/2 failed/)).toBeDefined()
    expect(screen.getByText('pci-1: Network Segmentation')).toBeDefined()
    expect(screen.getByText('pci-3: Protect Stored Data')).toBeDefined()
  })

  it('shows evaluation error', () => {
    mockEvalReturn.error = 'Cluster unreachable'
    render(<ComplianceFrameworks />)
    expect(screen.getByText('Cluster unreachable')).toBeDefined()
  })

  it('shows empty state when no evaluation run', () => {
    render(<ComplianceFrameworks />)
    expect(screen.getByText(/Select a framework and cluster/)).toBeDefined()
  })

  it('shows evaluating state', () => {
    mockEvalReturn.isEvaluating = true
    render(<ComplianceFrameworks />)
    expect(screen.getByText('Evaluating…')).toBeDefined()
  })
})
