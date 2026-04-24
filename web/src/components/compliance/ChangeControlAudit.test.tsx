import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ChangeControlAuditContent as ChangeControlAudit } from './ChangeControlAudit'

const mockSummary = {
  total_changes: 8, approved_changes: 4, unapproved_changes: 3, emergency_changes: 1,
  policy_violations: 5, risk_score: 55,
  by_cluster: { 'prod-us-east': 4 }, by_type: { deployment: 3 }, by_actor: { 'ci-bot': 3 },
}
const mockChanges = [
  { id: 'chg-001', timestamp: '2026-04-23T08:00:00Z', cluster: 'prod-us-east', namespace: 'payments', resource_kind: 'Deployment', resource_name: 'payment-api', change_type: 'deployment', actor: 'ci-bot@acme.com', approval_status: 'approved', approved_by: 'jane@acme.com', ticket_ref: 'CHG-4521', description: 'Scaled replicas', risk_score: 15 },
  { id: 'chg-002', timestamp: '2026-04-23T07:30:00Z', cluster: 'prod-us-east', namespace: 'payments', resource_kind: 'ConfigMap', resource_name: 'payment-config', change_type: 'configmap', actor: 'john@acme.com', approval_status: 'unapproved', description: 'Updated rate limits without approval', risk_score: 65 },
]
const mockViolations = [
  { id: 'cv-001', change_id: 'chg-002', policy: 'sox-prod-approval', severity: 'critical', description: 'Unapproved prod change', detected_at: '2026-04-23T07:31:00Z', acknowledged: false },
]
const mockPolicies = [
  { id: 'sox-prod-approval', name: 'SOX Production Approval', description: 'All production changes must be approved', scope: 'production', requires_approval: true, requires_ticket: true, severity: 'critical' },
]

function mockFetchSuccess() {
  vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
    const u = typeof url === 'string' ? url : url.toString()
    if (u.includes('/summary')) return Promise.resolve(new Response(JSON.stringify(mockSummary)))
    if (u.includes('/changes')) return Promise.resolve(new Response(JSON.stringify(mockChanges)))
    if (u.includes('/violations')) return Promise.resolve(new Response(JSON.stringify(mockViolations)))
    if (u.includes('/policies')) return Promise.resolve(new Response(JSON.stringify(mockPolicies)))
    return Promise.resolve(new Response('{}'))
  })
}

describe('ChangeControlAudit', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('renders header and summary cards', async () => {
    mockFetchSuccess()
    render(<ChangeControlAudit />)
    await waitFor(() => {
      expect(screen.getByText('Change Control Audit Trail')).toBeInTheDocument()
      expect(screen.getByText('Total Changes')).toBeInTheDocument()
      expect(screen.getByText('Risk Score')).toBeInTheDocument()
    })
  })

  it('renders change records', async () => {
    mockFetchSuccess()
    render(<ChangeControlAudit />)
    await waitFor(() => {
      expect(screen.getByText('Deployment/payment-api')).toBeInTheDocument()
      expect(screen.getByText('ConfigMap/payment-config')).toBeInTheDocument()
    })
  })

  it('shows risk score value', async () => {
    mockFetchSuccess()
    render(<ChangeControlAudit />)
    await waitFor(() => {
      expect(screen.getByText('55')).toBeInTheDocument()
    })
  })

  it('shows error state on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))
    render(<ChangeControlAudit />)
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  /* ── Array.isArray guard tests (PR #9794 regression coverage) ─── */

  it('renders without crashing when /changes returns a non-array object', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const u = typeof url === 'string' ? url : url.toString()
      if (u.includes('/summary')) return Promise.resolve(new Response(JSON.stringify(mockSummary)))
      if (u.includes('/changes')) return Promise.resolve(new Response(JSON.stringify({ unexpected: 'object' })))
      if (u.includes('/violations')) return Promise.resolve(new Response(JSON.stringify(mockViolations)))
      if (u.includes('/policies')) return Promise.resolve(new Response(JSON.stringify(mockPolicies)))
      return Promise.resolve(new Response('{}'))
    })
    render(<ChangeControlAudit />)
    await waitFor(() => {
      expect(screen.getByText('Change Control Audit Trail')).toBeInTheDocument()
      expect(screen.getByText('Total Changes')).toBeInTheDocument()
    })
  })

  it('renders without crashing when /violations returns null', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const u = typeof url === 'string' ? url : url.toString()
      if (u.includes('/summary')) return Promise.resolve(new Response(JSON.stringify(mockSummary)))
      if (u.includes('/changes')) return Promise.resolve(new Response(JSON.stringify(mockChanges)))
      if (u.includes('/violations')) return Promise.resolve(new Response(JSON.stringify(null)))
      if (u.includes('/policies')) return Promise.resolve(new Response(JSON.stringify(mockPolicies)))
      return Promise.resolve(new Response('{}'))
    })
    render(<ChangeControlAudit />)
    await waitFor(() => {
      expect(screen.getByText('Change Control Audit Trail')).toBeInTheDocument()
    })
  })

  it('renders without crashing when all array endpoints return non-array data', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const u = typeof url === 'string' ? url : url.toString()
      if (u.includes('/summary')) return Promise.resolve(new Response(JSON.stringify(mockSummary)))
      if (u.includes('/changes')) return Promise.resolve(new Response(JSON.stringify('string-payload')))
      if (u.includes('/violations')) return Promise.resolve(new Response(JSON.stringify(42)))
      if (u.includes('/policies')) return Promise.resolve(new Response(JSON.stringify(null)))
      return Promise.resolve(new Response('{}'))
    })
    render(<ChangeControlAudit />)
    await waitFor(() => {
      expect(screen.getByText('Change Control Audit Trail')).toBeInTheDocument()
    })
  })
})
