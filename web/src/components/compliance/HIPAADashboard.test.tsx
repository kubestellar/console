import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { HIPAADashboardContent as HIPAADashboard } from './HIPAADashboard'

const mockSafeguards = [
  { id: '164.312(a)', section: '§164.312(a)(1)', name: 'Access Control', description: 'Test', status: 'pass', checks: [
    { id: 'ac-1', name: 'RBAC enforced', description: 'Test', status: 'pass', evidence: 'OK', remediation: '' },
  ]},
  { id: '164.312(b)', section: '§164.312(b)', name: 'Audit Controls', description: 'Test', status: 'partial', checks: [] },
  { id: '164.312(c)', section: '§164.312(c)(1)', name: 'Integrity Controls', description: 'Test', status: 'pass', checks: [] },
  { id: '164.312(d)', section: '§164.312(d)', name: 'Authentication', description: 'Test', status: 'partial', checks: [] },
  { id: '164.312(e)', section: '§164.312(e)(1)', name: 'Transmission Security', description: 'Test', status: 'fail', checks: [] },
]

const mockSummary = {
  overall_score: 60, safeguards_passed: 2, safeguards_failed: 1,
  safeguards_partial: 2, total_safeguards: 5, phi_namespaces: 4,
  compliant_namespaces: 2, data_flows: 6, encrypted_flows: 5,
  evaluated_at: '2026-04-23T10:00:00Z',
}

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn((url: string) => {
    const ok = (data: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
    if (url.includes('/safeguards')) return ok(mockSafeguards)
    if (url.includes('/phi-namespaces')) return ok([
      { name: 'ehr-api', cluster: 'prod-east', labels: ['hipaa-phi=true'], encrypted: true, audit_enabled: true, rbac_restricted: true, compliant: true },
    ])
    if (url.includes('/data-flows')) return ok([
      { source: 'ehr-api', destination: 'patient-records', protocol: 'gRPC', encrypted: true, mutual_tls: true },
    ])
    if (url.includes('/summary')) return ok(mockSummary)
    return Promise.reject(new Error('unknown'))
  }),
}))

beforeEach(() => { vi.clearAllMocks() })

describe('HIPAADashboard', () => {
  it('renders the dashboard title', async () => {
    render(<HIPAADashboard />)
    await waitFor(() => {
      expect(screen.getByText('HIPAA Security Rule Compliance')).toBeInTheDocument()
    })
  })

  it('shows overall score', async () => {
    render(<HIPAADashboard />)
    await waitFor(() => {
      expect(screen.getByText('60%')).toBeInTheDocument()
    })
  })

  it('displays safeguard count', async () => {
    render(<HIPAADashboard />)
    await waitFor(() => {
      expect(screen.getByText('2/5 safeguards passing')).toBeInTheDocument()
    })
  })

  it('renders all five safeguards', async () => {
    render(<HIPAADashboard />)
    await waitFor(() => {
      expect(screen.getByText(/Access Control/)).toBeInTheDocument()
      expect(screen.getByText(/Audit Controls/)).toBeInTheDocument()
      expect(screen.getByText(/Integrity Controls/)).toBeInTheDocument()
      expect(screen.getByText(/Authentication/)).toBeInTheDocument()
      expect(screen.getByText(/Transmission Security/)).toBeInTheDocument()
    })
  })
})
