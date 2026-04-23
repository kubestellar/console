import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AirGapDashboard from './AirGapDashboard'

vi.mock('../../lib/unified/dashboard/UnifiedDashboard', () => ({
  UnifiedDashboard: () => null,
}))

const mockRequirements = [
  { id: 'AG-001', name: 'Local Registry Mirror', description: 'Private registry required', category: 'registry', status: 'ready', details: 'Harbor v2.9 configured' },
]
const mockClusters = [
  { id: 'c-1', name: 'prod-east', readiness_score: 92, status: 'ready', requirements_met: 11, requirements_total: 12, last_checked: new Date().toISOString() },
]
const mockSummary = { total_requirements: 12, ready: 9, not_ready: 1, partial: 2, overall_readiness: 85, evaluated_at: new Date().toISOString() }

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn((url: string) => {
    if (url.includes('/requirements')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockRequirements) })
    if (url.includes('/clusters')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockClusters) })
    if (url.includes('/summary')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSummary) })
    return Promise.resolve({ ok: false })
  }),
}))

describe('AirGapDashboard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the dashboard title', async () => {
    render(<MemoryRouter><AirGapDashboard /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Air-Gap Readiness')).toBeInTheDocument())
  })

  it('shows overall readiness', async () => {
    render(<MemoryRouter><AirGapDashboard /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('85%')).toBeInTheDocument())
  })

  it('renders a requirement', async () => {
    render(<MemoryRouter><AirGapDashboard /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Local Registry Mirror')).toBeInTheDocument())
  })

  it('shows ready count', async () => {
    render(<MemoryRouter><AirGapDashboard /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('9')).toBeInTheDocument())
  })
})
