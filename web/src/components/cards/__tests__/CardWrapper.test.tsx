/**
 * CardWrapper — shared shell for every dashboard card (#15264).
 *
 * PR A: demo badge, failure banner, collapse persistence, expand modal sizing,
 * mode-switch skeleton. Lazy modals / snooze / missions integration deferred to PR B.
 *
 * Run from web/:  npm run test:card-wrapper
 * (Do not run npx vitest from repo root — that skips vite.config.ts jsdom + @/ aliases.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React, { useContext, useLayoutEffect } from 'react'
import { isDemoMode } from '../../../lib/demoMode'
import { CardWrapper } from '../CardWrapper'
import { CardDataReportContext, type CardDataState } from '../CardDataContext'

const COLLAPSED_CARDS_STORAGE_KEY = 'kubestellar-collapsed-cards'
const TEST_CARD_ID = 'card-wrapper-test-id'
const TEST_CARD_TYPE = 'cluster_health'
const FULLSCREEN_CARD_TYPE = 'cluster_locations'
const LARGE_EXPANDED_CARD_TYPE = 'cluster_comparison'
const DEMO_BADGE_LABEL = 'Demo'
const CHILD_CONTENT_TEXT = 'card-wrapper-child-content'
const CUSTOM_ERROR_MESSAGE = 'upstream API unavailable'

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: vi.fn(() => true),
  isNetlifyDeployment: false,
  isDemoModeForced: false,
  canToggleDemoMode: () => true,
  setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(),
  subscribeDemoMode: () => () => {},
  isDemoToken: () => true,
  hasRealToken: () => false,
  setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

const mockUseDemoMode = vi.fn()
vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
  getDemoMode: () => true,
  default: () => true,
  hasRealToken: () => false,
  isDemoModeForced: false,
  isNetlifyDeployment: false,
  canToggleDemoMode: () => true,
  isDemoToken: () => true,
  setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

const mockUseIsModeSwitching = vi.fn(() => false)
vi.mock('../../../lib/unified/demo', () => ({
  useIsModeSwitching: () => mockUseIsModeSwitching(),
}))

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ setFullScreen: vi.fn() }),
}))

vi.mock('../../../hooks/useSnoozedCards', () => ({
  useSnoozedCards: () => ({ snoozeSwap: vi.fn() }),
}))

vi.mock('../../../lib/analytics', () => ({
  emitCardExpanded: vi.fn(),
  emitCardRefreshed: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'cardWrapper.demo') return DEMO_BADGE_LABEL
      if (key === 'titles.cluster_health') return 'Cluster Health'
      if (key === 'titles.cluster_locations') return 'Cluster Locations'
      if (key === 'titles.cluster_comparison') return 'Cluster Comparison'
      if (key === 'cardWrapper.expandFullScreen') return 'Expand full screen'
      if (key === 'cardWrapper.collapseCard') return 'Collapse card'
      if (key === 'cardWrapper.expandCard') return 'Expand card'
      if (key === 'cardWrapper.refreshFailedCount' && opts?.count) {
        return `Refresh failed (${opts.count})`
      }
      return key
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../lib/safeLazy', () => ({
  safeLazy: () => () => null,
}))

function renderCardWrapper(
  props: Partial<React.ComponentProps<typeof CardWrapper>> = {},
  options?: { reportState?: CardDataState },
) {
  const ui = (
    <CardWrapper
      cardId={TEST_CARD_ID}
      cardType={TEST_CARD_TYPE}
      isDemoData={false}
      {...props}
    >
      {options?.reportState ? (
        <CardStateReporter state={options.reportState} />
      ) : (
        <div data-testid="card-child">{CHILD_CONTENT_TEXT}</div>
      )}
    </CardWrapper>
  )

  return render(ui)
}

function CardStateReporter({ state }: { state: CardDataState }) {
  const ctx = useContext(CardDataReportContext)
  useLayoutEffect(() => {
    ctx.report(state)
  }, [ctx, state])
  return <div data-testid="card-child">{CHILD_CONTENT_TEXT}</div>
}

describe('CardWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockUseDemoMode.mockReturnValue({
      isDemoMode: true,
      toggleDemoMode: vi.fn(),
      setDemoMode: vi.fn(),
    })
    mockUseIsModeSwitching.mockReturnValue(false)
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('demo indicator', () => {
    it('shows demo badge when isDemoData is true and not loading', () => {
      renderCardWrapper({ isDemoData: true })

      expect(screen.getByTestId('demo-badge')).toBeInTheDocument()
      expect(screen.getByTestId('demo-badge')).toHaveTextContent(DEMO_BADGE_LABEL)
      expect(screen.getByText(CHILD_CONTENT_TEXT)).toBeInTheDocument()
    })

    it('does not show demo badge while child reports loading', () => {
      renderCardWrapper(
        {},
        {
          reportState: {
            isLoading: true,
            hasData: false,
            isDemoData: true,
            isFailed: false,
            consecutiveFailures: 0,
          },
        },
      )

      expect(screen.queryByTestId('demo-badge')).not.toBeInTheDocument()
    })

    it('suppresses demo badge when forceLive is true even with isDemoData', () => {
      renderCardWrapper({ isDemoData: true, forceLive: true })

      expect(screen.queryByTestId('demo-badge')).not.toBeInTheDocument()
    })
  })

  describe('CardFailureBanner', () => {
    it('renders failure banner with error message when isFailed', () => {
      renderCardWrapper({
        isFailed: true,
        consecutiveFailures: 2,
      }, {
        reportState: {
          isLoading: false,
          hasData: true,
          isDemoData: false,
          isFailed: true,
          consecutiveFailures: 2,
          errorMessage: CUSTOM_ERROR_MESSAGE,
        },
      })

      const banner = screen.getByTestId('card-failure-banner')
      expect(banner).toBeInTheDocument()
      expect(banner).toHaveTextContent(CUSTOM_ERROR_MESSAGE)
      expect(banner).toHaveTextContent('Refresh failed (2)')
    })

    it('hides failure banner when card is collapsed', async () => {
      const user = userEvent.setup()
      renderCardWrapper({
        isFailed: true,
        consecutiveFailures: 1,
      })

      expect(screen.getByTestId('card-failure-banner')).toBeInTheDocument()

      const collapseBtn = screen.getByRole('button', { name: 'Collapse card' })
      await user.click(collapseBtn)

      await waitFor(() => {
        expect(screen.queryByTestId('card-failure-banner')).not.toBeInTheDocument()
      })
    })
  })

  describe('collapse persistence', () => {
    it('persists collapsed state to localStorage', async () => {
      const user = userEvent.setup()
      renderCardWrapper({ cardId: TEST_CARD_ID })

      const collapseBtn = screen.getByRole('button', { name: 'Collapse card' })
      await user.click(collapseBtn)

      await waitFor(() => {
        const stored = JSON.parse(
          localStorage.getItem(COLLAPSED_CARDS_STORAGE_KEY) ?? '[]',
        ) as string[]
        expect(stored).toContain(TEST_CARD_ID)
      })

      expect(screen.queryByText(CHILD_CONTENT_TEXT)).not.toBeInTheDocument()
    })
  })

  describe('expanded modal sizing', () => {
    it('opens expanded modal for default card type', async () => {
      const user = userEvent.setup()
      renderCardWrapper({ cardType: TEST_CARD_TYPE })

      await user.click(screen.getByRole('button', { name: 'Expand full screen' }))

      expect(await screen.findByTestId('drilldown-modal')).toBeInTheDocument()
      expect(screen.getAllByText(CHILD_CONTENT_TEXT).length).toBeGreaterThan(0)
    })

    it('uses fullscreen modal size for FULLSCREEN_EXPANDED_CARDS', async () => {
      const user = userEvent.setup()
      renderCardWrapper({ cardType: FULLSCREEN_CARD_TYPE })

      await user.click(screen.getByRole('button', { name: 'Expand full screen' }))

      const modal = await screen.findByTestId('drilldown-modal')
      expect(modal).toHaveClass('max-w-[95vw]')
      expect(modal).toHaveClass('min-h-[95vh]')
    })

    it('uses xl modal size for LARGE_EXPANDED_CARDS', async () => {
      const user = userEvent.setup()
      renderCardWrapper({ cardType: LARGE_EXPANDED_CARD_TYPE })

      await user.click(screen.getByRole('button', { name: 'Expand full screen' }))

      const modal = await screen.findByTestId('drilldown-modal')
      expect(modal).toHaveClass('max-w-6xl')
      expect(modal).toHaveClass('min-h-[85vh]')
    })
  })

  describe('mode-switch skeleton', () => {
    beforeEach(() => {
      vi.mocked(isDemoMode).mockReturnValue(false)
      mockUseDemoMode.mockReturnValue({
        isDemoMode: false,
        toggleDemoMode: vi.fn(),
        setDemoMode: vi.fn(),
      })
      mockUseIsModeSwitching.mockReturnValue(true)
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
      vi.mocked(isDemoMode).mockReturnValue(true)
      mockUseIsModeSwitching.mockReturnValue(false)
    })

    it('shows skeleton overlay while demo↔live mode is switching', () => {
      renderCardWrapper({ skeletonType: 'list', skeletonRows: 2 })

      expect(document.querySelector('[data-card-skeleton="true"]')).toBeTruthy()
      expect(screen.getByTestId('card-child')).toBeInTheDocument()
    })
  })
})
