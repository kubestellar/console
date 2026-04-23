import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import FedRAMPDashboard from './FedRAMPDashboard'

vi.mock('../../lib/unified/dashboard/UnifiedDashboard', () => ({
  UnifiedDashboard: () => null,
}))

const mockControls = [
  { id: 'AC-1', name: 'Access Control Policy', description: 'Define access policies.', family: 'AC', status: 'satisfied', responsible: 'Platform Team', implementation: 'RBAC and OPA' },
]
const mockPOAMs = [
  { id: 'POAM-001', control_id: 'SC-7', title: 'Boundary Protection Enhancement', description: 'Implement network segmentation.', milestone_status: 'open', scheduled_completion: '2026-06-30T00:00:00Z', risk_level: 'high', vendor_dependency: false },
]
const mockScore = { overall_score: 71, authorization_status: 'in_process', impact_level: 'moderate', controls_satisfied: 142, controls_partially_satisfied: 38, controls_planned: 20, controls_total: 200, poams_open: 12, poams_closed: 8, evaluated_at: new Date().toISOString() }

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn((url: string) => {
    if (url.includes('/controls')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockControls) })
    if (url.includes('/poams')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPOAMs) })
    if (url.includes('/score')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockScore) })
    return Promise.resolve({ ok: false })
  }),
}))

describe('FedRAMPDashboard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the dashboard title', async () => {
    render(<MemoryRouter><FedRAMPDashboard /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('FedRAMP Readiness')).toBeInTheDocument())
  })

  it('shows overall score', async () => {
    render(<MemoryRouter><FedRAMPDashboard /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('71%')).toBeInTheDocument())
  })

  it('renders a control', async () => {
    render(<MemoryRouter><FedRAMPDashboard /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Access Control Policy')).toBeInTheDocument())
  })

  it('shows satisfied count', async () => {
    render(<MemoryRouter><FedRAMPDashboard /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('142')).toBeInTheDocument())
  })
})
