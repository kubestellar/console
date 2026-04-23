import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SegregationOfDuties from './SegregationOfDuties'

vi.mock('../../lib/unified/dashboard/UnifiedDashboard', () => ({
  UnifiedDashboard: () => null,
}))

const mockSummary = {
  total_rules: 5, total_principals: 10, total_violations: 5,
  by_severity: { critical: 2, high: 2, medium: 1 },
  by_conflict_type: { 'deployer-approver': 1 },
  compliance_score: 60, clean_principals: 6, conflicted_principals: 4,
}
const mockRules = [
  { id: 'sod-deployer-approver', name: 'Deployer ≠ Approver', description: 'Deploy and approve must differ', role_a: 'deployer', role_b: 'approver', conflict_type: 'deployer-approver', severity: 'critical', regulation: 'SOX ITGC' },
]
const mockPrincipals = [
  { name: 'bob@acme.com', type: 'user', roles: ['deployer', 'approver'], clusters: ['prod-us-east'] },
  { name: 'eve@acme.com', type: 'user', roles: ['auditor', 'viewer'], clusters: ['prod-us-east'] },
]
const mockViolations = [
  { id: 'sod-001', rule_id: 'sod-deployer-approver', principal: 'bob@acme.com', principal_type: 'user', role_a: 'deployer', role_b: 'approver', clusters: ['prod-us-east'], severity: 'critical', description: 'bob has deployer + approver' },
]

function mockFetchSuccess() {
  vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
    const u = typeof url === 'string' ? url : url.toString()
    if (u.includes('/summary')) return Promise.resolve(new Response(JSON.stringify(mockSummary)))
    if (u.includes('/rules')) return Promise.resolve(new Response(JSON.stringify(mockRules)))
    if (u.includes('/principals')) return Promise.resolve(new Response(JSON.stringify(mockPrincipals)))
    if (u.includes('/violations')) return Promise.resolve(new Response(JSON.stringify(mockViolations)))
    return Promise.resolve(new Response('{}'))
  })
}

describe('SegregationOfDuties', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('renders header and compliance score', async () => {
    mockFetchSuccess()
    render(<MemoryRouter><SegregationOfDuties /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('Segregation of Duties')).toBeInTheDocument()
      expect(screen.getByText('Compliance Score')).toBeInTheDocument()
      expect(screen.getByText('60%')).toBeInTheDocument()
    })
  })

  it('renders violations', async () => {
    mockFetchSuccess()
    render(<MemoryRouter><SegregationOfDuties /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText(/bob@acme\.com/)).toBeInTheDocument()
      expect(screen.getByText('bob has deployer + approver')).toBeInTheDocument()
    })
  })

  it('shows error on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))
    render(<MemoryRouter><SegregationOfDuties /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })
})
