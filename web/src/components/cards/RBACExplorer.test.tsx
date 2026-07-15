import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RBACExplorer } from './RBACExplorer'

const mockUseRBACFindings = vi.hoisted(() => vi.fn())
const mockUseCardLoadingState = vi.hoisted(() => vi.fn())
vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }) }))
vi.mock('../../hooks/useRBACFindings', () => ({ useRBACFindings: () => mockUseRBACFindings() }))
vi.mock('./CardDataContext', () => ({ useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args) }))
vi.mock('@tanstack/react-virtual', () => ({ useVirtualizer: () => ({ getVirtualItems: () => [{ index: 0, start: 0 }], getTotalSize: () => 72, scrollToOffset: vi.fn(), measureElement: vi.fn() }) }))
vi.mock('../../lib/cards/CardComponents', () => ({
  CardSkeleton: () => <div data-testid="card-skeleton" />,
  CardSearchInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <input data-testid="search-input" value={value} onChange={e => onChange(e.target.value)} />,
  CardPaginationFooter: () => null,
}))
vi.mock('../ui/StatusBadge', () => ({ StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }))

function setup(overrides: Record<string, unknown> = {}, loadingState: Record<string, unknown> = {}) {
  mockUseRBACFindings.mockReturnValue({ findings: [], isLoading: false, isRefreshing: false, consecutiveFailures: 0, error: null, isDemoData: false, refetch: vi.fn(), ...overrides })
  mockUseCardLoadingState.mockReturnValue({ showSkeleton: false, showEmptyState: false, ...loadingState })
}

describe('RBACExplorer', () => {
  beforeEach(() => { vi.clearAllMocks(); setup() })
  it('renders loading skeleton/loading state', () => { setup({ isLoading: true }, { showSkeleton: true }); render(<RBACExplorer />); expect(screen.getByTestId('card-skeleton')).toBeInTheDocument() })
  it('renders empty state', () => { setup({}, { showEmptyState: true }); render(<RBACExplorer />); expect(screen.getByText('common:rbac.noFindings')).toBeInTheDocument() })
  it('renders error state', () => { setup({ error: 'boom' }); render(<RBACExplorer />); expect(screen.getByText('common:rbac.failedToLoad')).toBeInTheDocument(); expect(screen.getByText('boom')).toBeInTheDocument() })
  it('renders happy-path data', () => { setup({ findings: [{ id: '1', risk: 'critical', subject: 'cluster-admin', subjectKind: 'User', description: 'over privileged', binding: 'clusterrolebinding/admin', cluster: 'prod' }] }); render(<RBACExplorer />); expect(screen.getByText('cluster-admin')).toBeInTheDocument(); expect(screen.getByText('critical: 1')).toBeInTheDocument() })
  it('matches snapshot', () => { setup({ findings: [{ id: '1', risk: 'high', subject: 'system:sa', subjectKind: 'ServiceAccount', description: 'wildcard', binding: 'binding', cluster: 'prod' }] }); const { container } = render(<RBACExplorer />); expect(container).toMatchSnapshot() })
})
