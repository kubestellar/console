import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ScoreRing, HIPAACard } from './EnterpriseComplianceCards'

const mockAuthFetch = vi.hoisted(() => vi.fn())
const mockSafeJson = vi.hoisted(() => vi.fn())
vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../../lib/api', () => ({ authFetch: (...args: unknown[]) => mockAuthFetch(...args), safeJson: (...args: unknown[]) => mockSafeJson(...args) }))
vi.mock('../../lib/cache', () => ({ useCache: () => ({ data: null, error: null }) }))
vi.mock('../shared/TechnicalAcronym', () => ({ TechnicalAcronym: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

describe('EnterpriseComplianceCards', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAuthFetch.mockResolvedValue({ ok: true }); mockSafeJson.mockResolvedValue(null) })
  it('renders loading skeleton/loading state', () => { render(<HIPAACard />); expect(screen.getByText('Loading…')).toBeInTheDocument() })
  it('renders empty state', async () => { render(<HIPAACard />); expect(await screen.findByText('No data')).toBeInTheDocument() })
  it('renders error state', async () => { mockAuthFetch.mockRejectedValue(new Error('network down')); render(<HIPAACard />); expect(await screen.findByText('network down')).toBeInTheDocument() })
  it('renders happy-path data', async () => { mockSafeJson.mockResolvedValue({ overall_score: 92, safeguards_passed: 18, safeguards_failed: 1, phi_namespaces: 3, encrypted_flows: 42 }); render(<HIPAACard />); expect(await screen.findByText('92%')).toBeInTheDocument(); expect(screen.getByText('Passed')).toBeInTheDocument() })
  it('renders SVG with correct score percentage and matches snapshot', () => { const { container } = render(<ScoreRing score={75} size={80} />); const progress = screen.getByTestId('score-ring-progress'); expect(progress).toHaveAttribute('stroke-dasharray'); expect(screen.getByText('75%')).toBeInTheDocument(); expect(container).toMatchSnapshot() })
})
