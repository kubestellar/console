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

const mockImages = [
  {
    image: 'ghcr.io/example/app:1.0.0',
    digest: 'sha256:111',
    signed: true,
    verified: true,
    signer: 'cosign',
    keyless: true,
    transparency_log: true,
    signed_at: '2026-04-01T10:00:00Z',
  },
]

const mockPolicies = [
  {
    name: 'require-signature',
    cluster: 'prod-east',
    mode: 'enforce',
    scope: 'default',
    rules: 2,
    violations: 0,
  },
]

const mockSummary = {
  total_images: 5,
  signed_images: 4,
  verified_images: 4,
  unsigned_images: 1,
  policy_violations: 0,
  clusters_covered: 2,
  evaluated_at: '2026-04-01T11:00:00Z',
}

function mockSuccessResponses() {
  mockedAuthFetch.mockImplementation((url: string) => {
    if (url.includes('/images')) {
      return Promise.resolve({ ok: true, json: async () => mockImages } as Response)
    }
    if (url.includes('/policies')) {
      return Promise.resolve({ ok: true, json: async () => mockPolicies } as Response)
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
    expect(screen.getByText('Sigstore keyless')).toBeInTheDocument()
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
    expect(screen.getByText('default')).toBeInTheDocument()
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
