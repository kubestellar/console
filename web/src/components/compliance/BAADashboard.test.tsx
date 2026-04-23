import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BAADashboardContent as BAADashboard } from './BAADashboard'

const ok = (data: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) })

const mockSummary = {
  total_agreements: 6, active_agreements: 3, expiring_soon: 1,
  expired: 1, pending: 1, covered_clusters: 5, uncovered_clusters: 1,
  active_alerts: 2, evaluated_at: '2026-04-23T10:00:00Z',
}

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn((url: string) => {
    if (url.includes('/agreements')) return ok([
      { id: 'baa-001', provider: 'AWS', provider_type: 'cloud', baa_signed_date: '2025-06-15', baa_expiry_date: '2027-06-15', covered_clusters: ['prod-east'], contact_name: 'AWS', contact_email: 'aws@example.com', status: 'active', notes: 'Test' },
    ])
    if (url.includes('/alerts')) return ok([
      { agreement_id: 'baa-003', provider: 'Datadog', expiry_date: '2026-05-15', days_left: 22, severity: 'critical' },
    ])
    if (url.includes('/summary')) return ok(mockSummary)
    return Promise.reject(new Error('unknown'))
  }),
}))

beforeEach(() => { vi.clearAllMocks() })

describe('BAADashboard', () => {
  it('renders the dashboard title', async () => {
    render(<BAADashboard />)
    await waitFor(() => {
      expect(screen.getByText('Business Associate Agreements')).toBeInTheDocument()
    })
  })

  it('shows total agreements', async () => {
    render(<BAADashboard />)
    await waitFor(() => {
      expect(screen.getByText('6')).toBeInTheDocument()
    })
  })

  it('shows alert banner', async () => {
    render(<BAADashboard />)
    await waitFor(() => {
      expect(screen.getByText(/BAA Alert/)).toBeInTheDocument()
    })
  })

  it('displays provider name', async () => {
    render(<BAADashboard />)
    await waitFor(() => {
      expect(screen.getByText('AWS')).toBeInTheDocument()
    })
  })
})
