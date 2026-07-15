import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CertManager } from './DataComplianceCertManager'

const mockUseCertManager = vi.hoisted(() => vi.fn())
const mockUseCardLoadingState = vi.hoisted(() => vi.fn())
vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }) }))
vi.mock('../../hooks/useCertManager', () => ({ useCertManager: () => mockUseCertManager() }))
vi.mock('./CardDataContext', () => ({ useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args) }))
vi.mock('../ui/StatusBadge', () => ({ StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }))

const status = { installed: false, validCertificates: 0, expiringSoon: 0, expired: 0, totalCertificates: 0, pending: 0, failed: 0, recentRenewals: 0 }
function setup(overrides: Record<string, unknown> = {}) { mockUseCertManager.mockReturnValue({ status, issuers: [], isLoading: false, isRefreshing: false, isDemoData: false, consecutiveFailures: 0, isFailed: false, ...overrides }); mockUseCardLoadingState.mockReturnValue({}) }

describe('CertManager', () => {
  beforeEach(() => { vi.clearAllMocks(); setup() })
  it('renders loading skeleton/loading state', () => { setup({ isLoading: true }); const { container } = render(<CertManager config={{}} />); expect(container.querySelector('.animate-pulse')).toBeInTheDocument() })
  it('renders empty state when not installed', () => { render(<CertManager config={{}} />); expect(screen.getByText('No cert-manager installation detected')).toBeInTheDocument() })
  it('renders error state through card loading state', () => { setup({ isFailed: true, consecutiveFailures: 3 }); render(<CertManager config={{}} />); expect(mockUseCardLoadingState).toHaveBeenCalledWith(expect.objectContaining({ isFailed: true, consecutiveFailures: 3 })) })
  it('renders happy-path data', () => { setup({ status: { ...status, installed: true, validCertificates: 5, expiringSoon: 1, totalCertificates: 6, recentRenewals: 2 }, issuers: [{ id: 'i1', name: 'letsencrypt', kind: 'ClusterIssuer', status: 'ready', certificateCount: 6 }] }); render(<CertManager config={{}} />); expect(screen.getByText('letsencrypt')).toBeInTheDocument(); expect(screen.getByText('2 renewals/24h')).toBeInTheDocument() })
  it('matches snapshot', () => { setup({ status: { ...status, installed: true, validCertificates: 1, totalCertificates: 1 }, issuers: [{ id: 'i1', name: 'ca', kind: 'Issuer', status: 'ready', certificateCount: 1 }] }); const { container } = render(<CertManager config={{}} />); expect(container).toMatchSnapshot() })
})
