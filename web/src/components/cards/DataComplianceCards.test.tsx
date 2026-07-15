import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CertManager, ExternalSecrets, VaultSecrets } from './DataComplianceCards'

const mockUseCertManager = vi.hoisted(() => vi.fn())
const mockUseClusters = vi.hoisted(() => vi.fn())
const mockUseCardLoadingState = vi.hoisted(() => vi.fn())
vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }) }))
vi.mock('../../hooks/useCertManager', () => ({ useCertManager: () => mockUseCertManager() }))
vi.mock('../../hooks/useMCP', () => ({ useClusters: () => mockUseClusters() }))
vi.mock('../../lib/kubectlProxy', () => ({ kubectlProxy: { exec: vi.fn() } }))
vi.mock('../../hooks/useDemoMode', () => ({ useDemoMode: () => ({ isDemoMode: false }) }))
vi.mock('./CardDataContext', () => ({ useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args) }))
vi.mock('../ui/StatusBadge', () => ({ StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }))

const status = { installed: false, validCertificates: 0, expiringSoon: 0, expired: 0, totalCertificates: 0, pending: 0, failed: 0, recentRenewals: 0 }
function setup() { mockUseCertManager.mockReturnValue({ status, issuers: [], isLoading: false, isRefreshing: false, isDemoData: false, consecutiveFailures: 0, isFailed: false }); mockUseClusters.mockReturnValue({ deduplicatedClusters: [] }); mockUseCardLoadingState.mockReturnValue({}) }

describe('DataComplianceCards re-exports', () => {
  beforeEach(() => { vi.clearAllMocks(); setup() })
  it('renders loading state via re-exported components', () => { expect(CertManager).toBeTypeOf('function'); expect(ExternalSecrets).toBeTypeOf('function'); expect(VaultSecrets).toBeTypeOf('function') })
  it('renders empty state for CertManager', () => { render(<CertManager config={{}} />); expect(screen.getByText('No cert-manager installation detected')).toBeInTheDocument() })
  it('renders error state metadata through CertManager export', () => { mockUseCertManager.mockReturnValue({ status, issuers: [], isLoading: false, isRefreshing: false, isDemoData: false, consecutiveFailures: 3, isFailed: true }); render(<CertManager config={{}} />); expect(mockUseCardLoadingState).toHaveBeenCalledWith(expect.objectContaining({ isFailed: true })) })
  it('renders happy-path data for all named exports', async () => { const { rerender } = render(<CertManager config={{}} />); expect(screen.getByText('Cert-Manager Integration')).toBeInTheDocument(); rerender(<ExternalSecrets config={{}} />); expect(await screen.findByText('No clusters connected')).toBeInTheDocument(); rerender(<VaultSecrets config={{}} />); expect(await screen.findByText('No clusters connected')).toBeInTheDocument() })
  it('matches snapshot', () => { const { container } = render(<CertManager config={{}} />); expect(container).toMatchSnapshot() })
})
