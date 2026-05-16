import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authFetch } from '../../lib/api'
import { SLSADashboardContent as SLSADashboard } from './SLSADashboard'

/* ── Mock authFetch at the top level ─────────────────────────────── */


vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))
vi.mock('../../lib/api', () => ({
  authFetch: vi.fn(),
}))

const mockedAuthFetch = vi.mocked(authFetch)

/* ── Valid fixtures ──────────────────────────────────────────────── */

const mockWorkloads = [
  {
    workload: 'api-server',
    image: 'img:latest',
    slsa_level: 3,
    build_system: 'github-actions',
    builder_id: 'gh-actions',
    source_uri: 'https://github.com/org/repo',
    attestation_present: true,
    attestation_verified: true,
    evaluated_at: '2026-04-23T01:00:00Z',
    requirements: [{ met: true }, { met: true }],
  },
]
const mockSummary = {
  total_workloads: 1,
  level_distribution: { '1': 0, '2': 0, '3': 1, '4': 0 },
  attested_workloads: 1,
  verified_workloads: 1,
}

/* ── Helpers ─────────────────────────────────────────────────────── */

/** Configure mockedAuthFetch to resolve each endpoint to the given payloads */
function setupAuthFetch(overrides: {
  workloads?: unknown
  summary?: unknown
} = {}) {
  mockedAuthFetch.mockImplementation((url: string) => {
    const data =
      url.includes('/workloads') ? (overrides.workloads ?? mockWorkloads) :
      url.includes('/summary')   ? (overrides.summary ?? mockSummary) :
      {}
    return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response)
  })
}

/* ── Tests ───────────────────────────────────────────────────────── */

describe('SLSADashboard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the dashboard header with valid array data', async () => {
    setupAuthFetch()
    render(<SLSADashboard />)
    await waitFor(() => expect(screen.getByText('SLSA Provenance')).toBeInTheDocument())
  })

  it('renders without crashing when workloads endpoint returns a non-array (object)', async () => {
    setupAuthFetch({ workloads: { unexpected: 'object' } })
    render(<SLSADashboard />)
    await waitFor(() => expect(screen.getByText('SLSA Provenance')).toBeInTheDocument())
  })

  it('renders without crashing when workloads endpoint returns null', async () => {
    setupAuthFetch({ workloads: null })
    render(<SLSADashboard />)
    await waitFor(() => expect(screen.getByText('SLSA Provenance')).toBeInTheDocument())
  })

  it('renders without crashing when workloads endpoint returns a scalar payload', async () => {
    setupAuthFetch({ workloads: 'string-payload' })
    render(<SLSADashboard />)
    await waitFor(() => expect(screen.getByText('SLSA Provenance')).toBeInTheDocument())
  })

  it('shows zero-count summary when workload endpoint returns non-array data', async () => {
    setupAuthFetch({
      workloads: {},
      summary: { ...mockSummary, total_workloads: 0, attested_workloads: 0, verified_workloads: 0 },
    })
    render(<SLSADashboard />)
    await waitFor(() => {
      expect(screen.getByText('Total Artifacts')).toBeInTheDocument()
    })
  })
})
