import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { STIGDashboardContent as STIGDashboard } from './STIGDashboard'

const mockBenchmarks = [
  { id: 'K8S-STIG-V1', title: 'Kubernetes STIG', version: '1.0', release: 'R1', status: 'non-compliant', profile: 'MAC-1', total_rules: 120, findings_count: 14 },
]
const mockFindings = [
  { id: 'F-001', rule_id: 'SV-242383', title: 'API Server must use TLS', severity: 'CAT I', status: 'open', benchmark_id: 'K8S-STIG-V1', host: 'node-1', comments: '' },
]
const mockSummary = { compliance_score: 76, total_findings: 120, open: 14, cat_i_open: 3, cat_ii_open: 8, cat_iii_open: 3, evaluated_at: new Date().toISOString() }

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn((url: string) => {
    if (url.includes('/benchmarks')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockBenchmarks) })
    if (url.includes('/findings')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockFindings) })
    if (url.includes('/summary')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSummary) })
    return Promise.resolve({ ok: false })
  }),
}))

describe('STIGDashboard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the dashboard title', async () => {
    render(<STIGDashboard />)
    await waitFor(() => expect(screen.getByText('DISA STIG Compliance')).toBeInTheDocument())
  })

  it('shows compliance score', async () => {
    render(<STIGDashboard />)
    await waitFor(() => expect(screen.getByText('76%')).toBeInTheDocument())
  })

  it('renders a finding rule', async () => {
    render(<STIGDashboard />)
    await waitFor(() => expect(screen.getByText('SV-242383')).toBeInTheDocument())
  })

  it('shows open count', async () => {
    render(<STIGDashboard />)
    await waitFor(() => expect(screen.getByText('14')).toBeInTheDocument())
  })
})
