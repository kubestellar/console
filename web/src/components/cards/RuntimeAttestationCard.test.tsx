import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import RuntimeAttestationCard from './RuntimeAttestationCard'

const mockUseCachedAttestation = vi.hoisted(() => vi.fn())
const mockUseCardLoadingState = vi.hoisted(() => vi.fn())
vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }) }))
vi.mock('../../hooks/useCachedAttestation', () => ({ useCachedAttestation: () => mockUseCachedAttestation(), SCORE_THRESHOLD_HIGH: 80, SCORE_THRESHOLD_MEDIUM: 60 }))
vi.mock('../../hooks/useDrillDown', () => ({ useDrillDown: () => ({ open: vi.fn() }) }))
vi.mock('./CardDataContext', () => ({ useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args) }))
vi.mock('../ui/Skeleton', () => ({ Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} /> }))
vi.mock('../drilldown/views/AttestationDrillDown', () => ({ AttestationDrillDown: () => null }))

function setup(overrides: Record<string, unknown> = {}) { mockUseCachedAttestation.mockReturnValue({ data: { clusters: [] }, isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0, lastRefresh: null, ...overrides }); mockUseCardLoadingState.mockReturnValue({}) }

describe('RuntimeAttestationCard', () => {
  beforeEach(() => { vi.clearAllMocks(); setup() })
  it('renders loading skeleton/loading state', () => { setup({ isLoading: true }); render(<RuntimeAttestationCard />); expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(5) })
  it('renders empty state', () => { render(<RuntimeAttestationCard />); expect(screen.getByText('runtimeAttestation.noData')).toBeInTheDocument() })
  it('renders error state through card loading state', () => { setup({ isFailed: true, consecutiveFailures: 3 }); render(<RuntimeAttestationCard />); expect(mockUseCardLoadingState).toHaveBeenCalledWith(expect.objectContaining({ isFailed: true, consecutiveFailures: 3 })) })
  it('renders happy-path data', () => { setup({ data: { clusters: [{ cluster: 'prod', overallScore: 90 }, { cluster: 'dev', overallScore: 50 }] } }); render(<RuntimeAttestationCard />); expect(screen.getByText('prod')).toBeInTheDocument(); expect(screen.getByText('70/100')).toBeInTheDocument() })
  it('matches snapshot', () => { setup({ data: { clusters: [{ cluster: 'prod', overallScore: 90 }] } }); const { container } = render(<RuntimeAttestationCard />); expect(container).toMatchSnapshot() })
})
