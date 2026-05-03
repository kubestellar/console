import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SigstoreDashboard, { SigstoreDashboardContent } from './SigstoreDashboard'
import { authFetch } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn(),
}))

vi.mock('../shared/DashboardHeader', () => ({
  DashboardHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock('../ui/RotatingTip', () => ({
  RotatingTip: () => <div data-testid="rotating-tip" />,
}))

vi.mock('../../lib/unified/dashboard/UnifiedDashboard', () => ({
  UnifiedDashboard: () => <div data-testid="unified-dashboard" />,
}))

vi.mock('../../config/dashboards/sigstore', () => ({
  sigstoreDashboardConfig: {},
}))

const mockedAuthFetch = vi.mocked(authFetch)

const mockSignatures = [
  {
    image: 'ghcr.io/example/app:1.0.0',
    digest: 'sha256:111',
    signed: true,
    signer: 'cosign',
    issuer: 'Fulcio',
    timestamp: '2026-04-01T10:00:00Z',
    transparency_log: true,
    status: 'verified',
  },
]

const mockVerifications = [
  {
    id: 'v-1',
    image: 'ghcr.io/example/app:1.0.0',
    policy: 'require-signature',
    result: 'pass',
    checked_at: '2026-04-01T11:00:00Z',
    cosign_version: 'v2.4.1',
    certificate_chain: 2,
    rekor_entry: true,
  },
]

const mockSummary = {
  total_images: 5,
  signed_images: 4,
  unsigned_images: 1,
  verified_signatures: 4,
  failed_verifications: 0,
  pending_verifications: 0,
  transparency_log_entries: 4,
  trust_roots: 2,
  policies_enforced: 3,
  last_verification: '2026-04-01T11:00:00Z',
}

function mockSuccessResponses() {
  mockedAuthFetch.mockImplementation((url: string) => {
    if (url.includes('/signatures')) {
      return Promise.resolve({ ok: true, json: async () => mockSignatures } as Response)
    }
    if (url.includes('/verifications')) {
      return Promise.resolve({ ok: true, json: async () => mockVerifications } as Response)
    }
    if (url.includes('/summary')) {
      return Promise.resolve({ ok: true, json: async () => mockSummary } as Response)
    }
    throw new Error(`Unexpected authFetch URL in SigstoreDashboard test: ${url}`)
  })
}

describe('SigstoreDashboard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders signatures tab and summary after successful fetch', async () => {
    mockSuccessResponses()
    render(<SigstoreDashboardContent />)

    await waitFor(() => {
      expect(screen.getByText('Sigstore Verification')).toBeInTheDocument()
    })

    expect(screen.getByText('Total Images')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText(/Signatures \(1\)/)).toBeInTheDocument()
    expect(screen.getByText('ghcr.io/example/app:1.0.0')).toBeInTheDocument()
  })

  it('switches to verifications tab and renders verification rows', async () => {
    mockSuccessResponses()
    const user = userEvent.setup()
    render(<SigstoreDashboardContent />)

    await waitFor(() => {
      expect(screen.getByText(/Verifications \(1\)/)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Verifications \(1\)/ }))
    expect(screen.getByText('require-signature')).toBeInTheDocument()
    expect(screen.getByText('2 certs')).toBeInTheDocument()
  })

  it('shows error banner when fetch fails', async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, json: async () => ({}) } as Response)
    render(<SigstoreDashboardContent />)

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch Sigstore data')).toBeInTheDocument()
    })
  })

  it('renders page component with unified dashboard wrapper', () => {
    render(<SigstoreDashboard />)
    expect(screen.getByTestId('unified-dashboard')).toBeInTheDocument()
  })
})
