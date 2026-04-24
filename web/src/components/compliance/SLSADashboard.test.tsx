import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authFetch } from '../../lib/api'
import { SLSADashboardContent as SLSADashboard } from './SLSADashboard'

/* ── Mock authFetch at the top level ─────────────────────────────── */

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn(),
}))

const mockedAuthFetch = vi.mocked(authFetch)

/* ── Valid fixtures ──────────────────────────────────────────────── */

const mockAttestations = [
  { id: 'a-1', artifact: 'img:latest', builder: 'github-actions', slsa_level: 3, verified: true, build_type: 'container', source_repo: 'org/repo', timestamp: '2026-04-23T01:00:00Z', status: 'pass' },
]
const mockProvenance = [
  { id: 'p-1', artifact: 'img:latest', builder_id: 'gh-actions', build_level: 3, source_uri: 'https://github.com/org/repo', source_digest: 'sha256:abc', reproducible: true, hermetic: true, parameterless: false, timestamp: '2026-04-23T01:00:00Z' },
]
const mockSummary = {
  total_artifacts: 1, attested_artifacts: 1,
  level_1: 0, level_2: 0, level_3: 1, level_4: 0,
  verified_attestations: 1, failed_attestations: 0, pending_attestations: 0,
  source_integrity_pass: 1, source_integrity_fail: 0,
  reproducible_builds: 1, total_builds: 1,
}

/* ── Helpers ─────────────────────────────────────────────────────── */

/** Configure mockedAuthFetch to resolve each endpoint to the given payloads */
function setupAuthFetch(overrides: {
  attestations?: unknown
  provenance?: unknown
  summary?: unknown
} = {}) {
  mockedAuthFetch.mockImplementation((url: string) => {
    const data =
      url.includes('/attestations') ? (overrides.attestations ?? mockAttestations) :
      url.includes('/provenance')   ? (overrides.provenance ?? mockProvenance) :
      url.includes('/summary')      ? (overrides.summary ?? mockSummary) :
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

  it('renders without crashing when attestations endpoint returns a non-array (object)', async () => {
    setupAuthFetch({ attestations: { unexpected: 'object' } })
    render(<SLSADashboard />)
    await waitFor(() => expect(screen.getByText('SLSA Provenance')).toBeInTheDocument())
  })

  it('renders without crashing when provenance endpoint returns null', async () => {
    setupAuthFetch({ provenance: null })
    render(<SLSADashboard />)
    await waitFor(() => expect(screen.getByText('SLSA Provenance')).toBeInTheDocument())
  })

  it('renders without crashing when both array endpoints return non-array data', async () => {
    setupAuthFetch({ attestations: 'string-payload', provenance: 42 })
    render(<SLSADashboard />)
    await waitFor(() => expect(screen.getByText('SLSA Provenance')).toBeInTheDocument())
  })

  it('shows zero-count summary when array endpoints return non-array data', async () => {
    setupAuthFetch({
      attestations: {},
      provenance: null,
      summary: { ...mockSummary, total_artifacts: 0, attested_artifacts: 0 },
    })
    render(<SLSADashboard />)
    await waitFor(() => {
      expect(screen.getByText('Total Artifacts')).toBeInTheDocument()
    })
  })
})
