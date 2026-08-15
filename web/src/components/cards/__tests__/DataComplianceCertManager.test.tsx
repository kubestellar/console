import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CertManager } from '../DataComplianceCertManager'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
  useCardDemoState: () => ({ shouldUseDemoData: false, reason: null, showDemoBadge: false }),
}))

const mockUseCertManager = vi.fn()
vi.mock('../../../hooks/useCertManager', () => ({
  useCertManager: () => mockUseCertManager(),
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) =>
    <span data-testid="status-badge">{children}</span>,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function certManagerBase(overrides = {}) {
  return {
    status: {
      installed: true,
      validCertificates: 5,
      expiringSoon: 1,
      expired: 0,
      totalCertificates: 6,
      pending: 0,
      failed: 0,
      recentRenewals: 2,
    },
    issuers: [],
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    consecutiveFailures: 0,
    isFailed: false,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DataComplianceCertManager (CertManager)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false })
    mockUseCertManager.mockReturnValue(certManagerBase())
  })

  it('renders without crashing', () => {
    const { container } = render(<CertManager />)
    expect(container).toBeTruthy()
  })

  it('calls useCardLoadingState during render', () => {
    render(<CertManager />)
    expect(mockUseCardLoadingState).toHaveBeenCalled()
  })

  it('renders cert stats when installed', () => {
    render(<CertManager />)
    // valid cert count
    expect(screen.getByText('5')).toBeTruthy()
    // total certs
    expect(screen.getByText('6')).toBeTruthy()
  })

  it('shows not-installed notice when cert-manager is not detected', () => {
    mockUseCertManager.mockReturnValue(certManagerBase({
      status: { installed: false, validCertificates: 0, expiringSoon: 0, expired: 0, totalCertificates: 0, pending: 0, failed: 0, recentRenewals: 0 },
    }))
    render(<CertManager />)
    expect(screen.getByText('Cert-Manager Integration')).toBeTruthy()
    expect(screen.getByText('No cert-manager installation detected')).toBeTruthy()
  })

  it('shows loading skeleton when loading with no issuers', () => {
    mockUseCertManager.mockReturnValue(certManagerBase({
      isLoading: true,
      issuers: [],
      status: { installed: false, validCertificates: 0, expiringSoon: 0, expired: 0, totalCertificates: 0, pending: 0, failed: 0, recentRenewals: 0 },
    }))
    const { container } = render(<CertManager />)
    // Loading state renders animate-pulse divs
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('renders issuer list when issuers are present', () => {
    mockUseCertManager.mockReturnValue(certManagerBase({
      issuers: [
        { id: 'issuer-1', name: 'letsencrypt-prod', kind: 'ClusterIssuer', status: 'ready', certificateCount: 3 },
      ],
    }))
    render(<CertManager />)
    expect(screen.getByText('letsencrypt-prod')).toBeTruthy()
  })

  it('shows "No issuers found" when installed but no issuers', () => {
    mockUseCertManager.mockReturnValue(certManagerBase({ issuers: [] }))
    render(<CertManager />)
    expect(screen.getByText('No issuers found')).toBeTruthy()
  })

  it('shows pending/failed badge when counts are non-zero', () => {
    mockUseCertManager.mockReturnValue(certManagerBase({
      status: {
        installed: true, validCertificates: 3, expiringSoon: 0, expired: 0,
        totalCertificates: 5, pending: 2, failed: 1, recentRenewals: 0,
      },
    }))
    render(<CertManager />)
    const badges = screen.getAllByTestId('status-badge')
    expect(badges.some(b => b.textContent?.includes('pending'))).toBe(true)
    expect(badges.some(b => b.textContent?.includes('failed'))).toBe(true)
  })
})
