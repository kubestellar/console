import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdmissionWebhooks } from './AdmissionWebhooks'
import type { WebhookData } from '../../hooks/useAdmissionWebhooks'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, optsOrFallback?: Record<string, unknown> | string, extraOpts?: Record<string, unknown>) => {
      const options = typeof optsOrFallback === 'object' ? optsOrFallback : extraOpts
      const fallback = typeof optsOrFallback === 'string' ? optsOrFallback : undefined
      if (options && typeof options === 'object' && 'count' in options) return `${options.count}`
      if (fallback) return fallback
      const parts = key.split('.')
      return parts[parts.length - 1]
    },
  }),
}))

const mockUseAdmissionWebhooks = vi.fn()
vi.mock('../../hooks/useAdmissionWebhooks', () => ({
  useAdmissionWebhooks: () => mockUseAdmissionWebhooks(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (opts: Record<string, unknown>) => mockUseCardLoadingState(opts),
  useReportCardDataState: () => {},
}))

vi.mock('../../lib/cards/CardComponents', () => ({
  CardSkeleton: ({ rows }: { rows?: number }) => (
    <div data-testid="card-skeleton" data-rows={rows} />
  ),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWebhook(overrides: Partial<WebhookData> = {}): WebhookData {
  return {
    name: 'kyverno-resource-validating',
    type: 'validating',
    failurePolicy: 'Fail',
    matchPolicy: 'Equivalent',
    rules: 5,
    cluster: 'prod-cluster',
    ...overrides,
  }
}

function setupMocks(opts: {
  webhooks?: WebhookData[]
  isLoading?: boolean
  isRefreshing?: boolean
  isDemoData?: boolean
  isFailed?: boolean
  consecutiveFailures?: number
  lastRefresh?: number | null
  showSkeleton?: boolean
  showEmptyState?: boolean
} = {}) {
  mockUseAdmissionWebhooks.mockReturnValue({
    webhooks: opts.webhooks ?? [],
    isLoading: opts.isLoading ?? false,
    isRefreshing: opts.isRefreshing ?? false,
    isDemoData: opts.isDemoData ?? false,
    isFailed: opts.isFailed ?? false,
    consecutiveFailures: opts.consecutiveFailures ?? 0,
    lastRefresh: opts.lastRefresh ?? null,
    refetch: vi.fn(),
  })

  mockUseCardLoadingState.mockReturnValue({
    showSkeleton: opts.showSkeleton ?? false,
    showEmptyState: opts.showEmptyState ?? false,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdmissionWebhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---- Loading / skeleton ----

  describe('loading state', () => {
    it('renders skeleton when showSkeleton is true', () => {
      setupMocks({ isLoading: true, showSkeleton: true })
      render(<AdmissionWebhooks />)
      expect(screen.getByTestId('card-skeleton')).toBeInTheDocument()
    })

    it('passes isLoading and hasData correctly to useCardLoadingState', () => {
      setupMocks({ isLoading: true, webhooks: [] })
      render(<AdmissionWebhooks />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isLoading: true, hasAnyData: false }),
      )
    })

    it('does not show skeleton when webhooks exist even if isLoading is true', () => {
      setupMocks({ isLoading: true, webhooks: [makeWebhook()], showSkeleton: false })
      render(<AdmissionWebhooks />)
      expect(screen.queryByTestId('card-skeleton')).not.toBeInTheDocument()
    })
  })

  // ---- Empty state ----

  describe('empty state', () => {
    it('renders empty state message when showEmptyState is true', () => {
      setupMocks({ showEmptyState: true })
      render(<AdmissionWebhooks />)
      expect(screen.getByText('No admission webhooks found')).toBeInTheDocument()
      expect(screen.getByText('Webhooks will appear here when configured')).toBeInTheDocument()
    })
  })

  // ---- Webhook rendering ----

  describe('webhook list rendering', () => {
    const webhooks: WebhookData[] = [
      makeWebhook({ name: 'gatekeeper-validating', type: 'validating', cluster: 'prod', rules: 3 }),
      makeWebhook({ name: 'istio-sidecar-injector', type: 'mutating', cluster: 'staging', failurePolicy: 'Ignore', rules: 1 }),
    ]

    it('renders webhook names', () => {
      setupMocks({ webhooks })
      render(<AdmissionWebhooks />)
      expect(screen.getByText('gatekeeper-validating')).toBeInTheDocument()
      expect(screen.getByText('istio-sidecar-injector')).toBeInTheDocument()
    })

    it('shows cluster name for each webhook', () => {
      setupMocks({ webhooks })
      render(<AdmissionWebhooks />)
      expect(screen.getByText(/prod/)).toBeInTheDocument()
      expect(screen.getByText(/staging/)).toBeInTheDocument()
    })

    it('shows V badge for validating and M badge for mutating', () => {
      setupMocks({ webhooks })
      render(<AdmissionWebhooks />)
      expect(screen.getByText('V')).toBeInTheDocument()
      expect(screen.getByText('M')).toBeInTheDocument()
    })

    it('renders failurePolicy badge for each webhook', () => {
      setupMocks({ webhooks })
      render(<AdmissionWebhooks />)
      expect(screen.getByText('Fail')).toBeInTheDocument()
      expect(screen.getByText('Ignore')).toBeInTheDocument()
    })

    it('passes isDemoData to useCardLoadingState', () => {
      setupMocks({ webhooks, isDemoData: true })
      render(<AdmissionWebhooks />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true }),
      )
    })
  })

  // ---- Tab filtering ----

  describe('tab filtering', () => {
    const webhooks: WebhookData[] = [
      makeWebhook({ name: 'val-hook', type: 'validating', cluster: 'c1' }),
      makeWebhook({ name: 'mut-hook', type: 'mutating', cluster: 'c2' }),
      makeWebhook({ name: 'val-hook-2', type: 'validating', cluster: 'c3' }),
    ]

    it('shows all webhooks on the "all" tab by default', () => {
      setupMocks({ webhooks })
      render(<AdmissionWebhooks />)
      expect(screen.getByText('val-hook')).toBeInTheDocument()
      expect(screen.getByText('mut-hook')).toBeInTheDocument()
      expect(screen.getByText('val-hook-2')).toBeInTheDocument()
    })

    it('filters to only mutating webhooks when mutating tab is clicked', async () => {
      setupMocks({ webhooks })
      render(<AdmissionWebhooks />)

      // Tabs are the only buttons; rendered text is the count from t({count:n})
      // Order: all(3), mutating(1), validating(2)
      const tabs = screen.getAllByRole('button')
      const mutTab = tabs[1] // mutating tab
      await userEvent.click(mutTab)

      expect(screen.getByText('mut-hook')).toBeInTheDocument()
      expect(screen.queryByText('val-hook')).not.toBeInTheDocument()
      expect(screen.queryByText('val-hook-2')).not.toBeInTheDocument()
    })

    it('filters to only validating webhooks when validating tab is clicked', async () => {
      setupMocks({ webhooks })
      render(<AdmissionWebhooks />)

      const tabs = screen.getAllByRole('button')
      const valTab = tabs[2] // validating tab
      await userEvent.click(valTab)

      expect(screen.getByText('val-hook')).toBeInTheDocument()
      expect(screen.getByText('val-hook-2')).toBeInTheDocument()
      expect(screen.queryByText('mut-hook')).not.toBeInTheDocument()
    })

    it('shows correct count on all tab', () => {
      setupMocks({ webhooks })
      render(<AdmissionWebhooks />)

      // All tab is the first button; its text is the count returned by t({count:3})
      const tabs = screen.getAllByRole('button')
      expect(tabs[0].textContent).toBe('3')
    })
  })

  // ---- Error banner ----

  describe('error state', () => {
    it('shows error banner when isFailed is true', () => {
      setupMocks({
        webhooks: [makeWebhook()],
        isFailed: true,
        consecutiveFailures: 3,
      })
      render(<AdmissionWebhooks />)
      expect(screen.getByText('Error loading webhooks')).toBeInTheDocument()
    })

    it('does not show error banner when isFailed is false', () => {
      setupMocks({ webhooks: [makeWebhook()] })
      render(<AdmissionWebhooks />)
      expect(screen.queryByText('errorTitle')).not.toBeInTheDocument()
    })

    it('passes isFailed and consecutiveFailures to useCardLoadingState', () => {
      setupMocks({ isFailed: true, consecutiveFailures: 2 })
      render(<AdmissionWebhooks />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isFailed: true, consecutiveFailures: 2 }),
      )
    })
  })

  // ---- Refresh state ----

  describe('refresh state', () => {
    it('passes isRefreshing to useCardLoadingState', () => {
      setupMocks({ webhooks: [makeWebhook()], isRefreshing: true })
      render(<AdmissionWebhooks />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isRefreshing: true }),
      )
    })
  })
})
