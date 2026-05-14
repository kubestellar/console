import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FedRAMPDashboardContent as FedRAMPDashboard } from './FedRAMPDashboard'
import { authFetch } from '../../lib/api'

const mockControls = [
  { id: 'AC-1', name: 'Access Control Policy', description: 'Define access policies.', family: 'AC', status: 'satisfied', responsible: 'Platform Team', implementation: 'RBAC and OPA' },
]
const mockPOAMs = [
  { id: 'POAM-001', control_id: 'SC-7', title: 'Boundary Protection Enhancement', description: 'Implement network segmentation.', milestone_status: 'open', scheduled_completion: '2026-06-30T00:00:00Z', risk_level: 'high', vendor_dependency: false },
]
const mockScore = { overall_score: 71, authorization_status: 'in_process', impact_level: 'moderate', controls_satisfied: 142, controls_partially_satisfied: 38, controls_planned: 20, controls_total: 200, poams_open: 12, poams_closed: 8, evaluated_at: new Date().toISOString() }


vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))
vi.mock('../../lib/api', () => ({
  authFetch: vi.fn(),
}))

const mockAuthFetch = vi.mocked(authFetch)

function mockFedRAMPFetches(score = mockScore) {
  mockAuthFetch.mockImplementation((url: string) => {
    if (url.includes('/controls')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockControls) })
    if (url.includes('/poams')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPOAMs) })
    if (url.includes('/score')) return Promise.resolve({ ok: true, json: () => Promise.resolve(score) })
    return Promise.resolve({ ok: false })
  })
}

describe('FedRAMPDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFedRAMPFetches()
  })

  it('renders the dashboard title', async () => {
    render(<FedRAMPDashboard />)
    await waitFor(() => expect(screen.getByText('FedRAMP Readiness')).toBeInTheDocument())
  })

  it('shows overall score', async () => {
    render(<FedRAMPDashboard />)
    await waitFor(() => expect(screen.getByText('71%')).toBeInTheDocument())
  })

  it('renders a control', async () => {
    render(<FedRAMPDashboard />)
    await waitFor(() => expect(screen.getByText('Access Control Policy')).toBeInTheDocument())
  })

  it('shows satisfied count', async () => {
    render(<FedRAMPDashboard />)
    await waitFor(() => expect(screen.getByText('142')).toBeInTheDocument())
  })

  it('applies in_process authorization status style (orange)', async () => {
    render(<FedRAMPDashboard />)
    // in_process (from fixture) should display as "in process" with orange styling
    await waitFor(() => {
      const el = screen.getByText('in process')
      expect(el.className).toContain('text-orange')
    })
  })

  it('falls back to Unknown when authorization_status is missing', async () => {
    mockFedRAMPFetches({ ...mockScore, authorization_status: undefined })

    render(<FedRAMPDashboard />)

    await waitFor(() => expect(screen.getByText('Unknown')).toBeInTheDocument())
  })
})
