import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SigningStatusDashboard from './SigningStatusDashboard'
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

const mockedAuthFetch = vi.mocked(authFetch)

const mockImages = [
  {
    image: 'ghcr.io/example/signed:1.0.0',
    digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    workload: 'api',
    namespace: 'default',
    cluster: 'cluster-a',
    signed: true,
    verified: true,
    signer: 'sigstore',
    keyless: true,
    transparency_log: true,
    signed_at: '2026-04-01T10:00:00Z',
    failure_reason: null,
  },
  {
    image: 'ghcr.io/example/unsigned:2.0.0',
    digest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    workload: 'worker',
    namespace: 'jobs',
    cluster: 'cluster-b',
    signed: false,
    verified: false,
    signer: 'unknown',
    keyless: false,
    transparency_log: false,
    signed_at: null,
    failure_reason: 'missing signature',
  },
]

const mockPolicies = [
  {
    name: 'require-signed-images',
    cluster: 'cluster-a',
    mode: 'enforce',
    scope: 'all namespaces',
    rules: 3,
    violations: 1,
  },
]

const mockSummary = {
  total_images: 10,
  signed_images: 8,
  verified_images: 7,
  unsigned_images: 2,
  policy_violations: 1,
  clusters_covered: 2,
  evaluated_at: '2026-04-01T12:00:00Z',
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
    throw new Error(`Unexpected authFetch URL in SigningStatusDashboard test: ${url}`)
  })
}

describe('SigningStatusDashboard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders summary and image tab data after successful fetch', async () => {
    mockSuccessResponses()
    render(<SigningStatusDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Sigstore / Cosign Verification')).toBeInTheDocument()
    })

    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.getByText('Show unsigned / unverified only')).toBeInTheDocument()
    expect(screen.getByText('ghcr.io/example/signed:1.0.0')).toBeInTheDocument()
    expect(screen.getByText('ghcr.io/example/unsigned:2.0.0')).toBeInTheDocument()
    const calledUrls = mockedAuthFetch.mock.calls.map(([url]) => String(url))
    expect(calledUrls).toEqual(expect.arrayContaining([
      '/api/supply-chain/signing/images',
      '/api/supply-chain/signing/policies',
      '/api/supply-chain/signing/summary',
    ]))
  })

  it('filters image table when unsigned-only checkbox is enabled', async () => {
    mockSuccessResponses()
    const user = userEvent.setup()
    render(<SigningStatusDashboard />)

    await waitFor(() => {
      expect(screen.getByText('ghcr.io/example/signed:1.0.0')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('checkbox', { name: /show unsigned \/ unverified only/i }))
    expect(screen.queryByText('ghcr.io/example/signed:1.0.0')).not.toBeInTheDocument()
    expect(screen.getByText('ghcr.io/example/unsigned:2.0.0')).toBeInTheDocument()
  })

  it('shows policies tab content when policies tab is selected', async () => {
    mockSuccessResponses()
    const user = userEvent.setup()
    render(<SigningStatusDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Signing Policies')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Signing Policies' }))
    expect(screen.getByText('require-signed-images')).toBeInTheDocument()
    expect(screen.getByText('1 violation')).toBeInTheDocument()
  })

  it('shows error state when one endpoint fails', async () => {
    mockedAuthFetch.mockResolvedValue({ ok: false, json: async () => ({}) } as Response)
    render(<SigningStatusDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load signing data')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
