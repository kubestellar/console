import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import NISTDashboard from './NISTDashboard'

vi.mock('../../lib/unified/dashboard/UnifiedDashboard', () => ({
  UnifiedDashboard: () => null,
}))

const mockFamilies = [
  { id: 'AC', name: 'Access Control', description: 'Manage access.', pass_rate: 83, controls: [
    { id: 'AC-2', name: 'Account Management', description: 'Manage accounts.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'RBAC', remediation: '' },
  ]},
]
const mockMappings = [
  { control_id: 'AC-2', resources: ['ServiceAccount'], namespaces: ['kube-system'], clusters: ['prod-east'], automated: true, last_assessed: '2026-04-20T00:00:00Z' },
]
const mockSummary = { total_controls: 19, implemented_controls: 13, partial_controls: 4, planned_controls: 1, not_applicable: 1, overall_score: 83, baseline: 'moderate', evaluated_at: new Date().toISOString() }

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn((url: string) => {
    if (url.includes('/families')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockFamilies) })
    if (url.includes('/mappings')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockMappings) })
    if (url.includes('/summary')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSummary) })
    return Promise.resolve({ ok: false })
  }),
}))

describe('NISTDashboard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the dashboard title', async () => {
    render(<MemoryRouter><NISTDashboard /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('NIST 800-53 Control Mapping')).toBeInTheDocument())
  })

  it('shows overall score', async () => {
    render(<MemoryRouter><NISTDashboard /></MemoryRouter>)
    await waitFor(() => expect(screen.getAllByText('83%').length).toBeGreaterThanOrEqual(1))
  })

  it('renders control family', async () => {
    render(<MemoryRouter><NISTDashboard /></MemoryRouter>)
    await waitFor(() => expect(screen.getAllByText('AC — Access Control').length).toBeGreaterThanOrEqual(1))
  })

  it('shows implemented count', async () => {
    render(<MemoryRouter><NISTDashboard /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('13')).toBeInTheDocument())
  })
})
