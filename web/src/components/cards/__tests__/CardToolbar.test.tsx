/**
 * Vitest unit tests for CardToolbar (#15513).
 *
 * Run from web/:  npm run test:card-toolbar
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardToolbar, type CardToolbarProps } from '../CardToolbar'

const TEST_CARD_ID = 'card-toolbar-test-id'
const TEST_CARD_TYPE = 'cluster_health'
const TEST_CARD_TITLE = 'Cluster Health'
const CONSECUTIVE_FAILURE_COUNT = 3

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'cardWrapper.refreshFailedRetry' && opts?.count !== undefined) {
        return `cardWrapper.refreshFailedRetry:${opts.count}`
      }
      if (key === 'cardWrapper.cardControls' && opts?.title) {
        return `cardWrapper.cardControls:${opts.title}`
      }
      return key
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../card-wrapper/CardActionMenu', () => ({
  CardActionMenu: () => <div data-testid="card-action-menu-stub" />,
}))

function renderCardToolbar(overrides: Partial<CardToolbarProps> = {}) {
  const callbacks = {
    onToggleCollapse: vi.fn(),
    onRefresh: vi.fn(),
    onExpandFullscreen: vi.fn(),
    onOpenBugReport: vi.fn(),
    onShowWidgetExport: vi.fn(),
  }

  const props: CardToolbarProps = {
    title: TEST_CARD_TITLE,
    isCollapsed: false,
    isRefreshDisabled: false,
    isRefreshSpinning: false,
    isFailed: false,
    consecutiveFailures: 0,
    cardId: TEST_CARD_ID,
    cardType: TEST_CARD_TYPE,
    ...callbacks,
    ...overrides,
  }

  const result = render(<CardToolbar {...props} />)
  return { ...result, ...callbacks }
}

function getCollapseButton(isCollapsed: boolean) {
  return screen.getByRole('button', {
    name: isCollapsed ? 'cardWrapper.expandCard' : 'cardWrapper.collapseCard',
  })
}

function getRefreshButton() {
  return screen.getByRole('button', {
    name: /cardWrapper\.refresh(FailedRetry|Data)/,
  })
}

describe('CardToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('collapse button', () => {
    it('uses expand label and aria-expanded=false when collapsed', () => {
      renderCardToolbar({ isCollapsed: true })

      const collapseBtn = getCollapseButton(true)
      expect(collapseBtn).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('button', { name: 'cardWrapper.collapseCard' })).not.toBeInTheDocument()
    })

    it('uses collapse label and aria-expanded=true when expanded', () => {
      renderCardToolbar({ isCollapsed: false })

      const collapseBtn = getCollapseButton(false)
      expect(collapseBtn).toHaveAttribute('aria-expanded', 'true')
      expect(screen.queryByRole('button', { name: 'cardWrapper.expandCard' })).not.toBeInTheDocument()
    })

    it('calls onToggleCollapse when clicked', async () => {
      const user = userEvent.setup()
      const { onToggleCollapse } = renderCardToolbar({ isCollapsed: false })

      await user.click(getCollapseButton(false))

      expect(onToggleCollapse).toHaveBeenCalledTimes(1)
    })
  })

  describe('refresh button', () => {
    // #15513 acceptance criteria — refresh styling classes are part of the contract.
    it('is disabled with cursor-not-allowed and text-blue-400 when isRefreshDisabled', () => {
      renderCardToolbar({ isRefreshDisabled: true })

      const refreshBtn = getRefreshButton()
      expect(refreshBtn).toBeDisabled()
      expect(refreshBtn).toHaveClass('cursor-not-allowed', 'text-blue-400')
    })

    it('uses failed styling when isFailed and not disabled', () => {
      renderCardToolbar({
        isFailed: true,
        consecutiveFailures: CONSECUTIVE_FAILURE_COUNT,
        isRefreshDisabled: false,
      })

      const refreshBtn = getRefreshButton()
      expect(refreshBtn).not.toBeDisabled()
      expect(refreshBtn).toHaveClass('text-red-400')
      expect(refreshBtn).not.toHaveClass('cursor-not-allowed')
    })

    it('uses normal styling when not failed and not disabled', () => {
      renderCardToolbar({ isFailed: false, isRefreshDisabled: false })

      const refreshBtn = getRefreshButton()
      expect(refreshBtn).toHaveClass('text-muted-foreground')
      expect(refreshBtn).not.toHaveClass('text-red-400')
      expect(refreshBtn).not.toHaveClass('cursor-not-allowed')
    })

    it('uses refreshFailedRetry aria-label with failure count when failed', () => {
      renderCardToolbar({
        isFailed: true,
        consecutiveFailures: CONSECUTIVE_FAILURE_COUNT,
      })

      expect(
        screen.getByRole('button', {
          name: `cardWrapper.refreshFailedRetry:${CONSECUTIVE_FAILURE_COUNT}`,
        }),
      ).toBeInTheDocument()
    })

    it('uses refreshData aria-label when not failed', () => {
      renderCardToolbar({ isFailed: false })

      expect(
        screen.getByRole('button', { name: 'cardWrapper.refreshData' }),
      ).toBeInTheDocument()
    })

    it('applies animate-spin to RefreshCw when isRefreshSpinning', () => {
      renderCardToolbar({ isRefreshSpinning: true })

      const refreshBtn = getRefreshButton()
      expect(refreshBtn.querySelector('.animate-spin')).toBeTruthy()
    })

    it('calls onRefresh when clicked and not disabled', async () => {
      const user = userEvent.setup()
      const { onRefresh } = renderCardToolbar({ isRefreshDisabled: false })

      await user.click(getRefreshButton())

      expect(onRefresh).toHaveBeenCalledTimes(1)
    })

    it('does not render when onRefresh is undefined', () => {
      renderCardToolbar({ onRefresh: undefined })

      expect(
        screen.queryByRole('button', { name: /cardWrapper\.refresh/ }),
      ).not.toBeInTheDocument()
    })
  })

  describe('fullscreen and bug-report buttons', () => {
    it('calls onExpandFullscreen when fullscreen button is clicked', async () => {
      const user = userEvent.setup()
      const { onExpandFullscreen } = renderCardToolbar()

      await user.click(
        screen.getByRole('button', { name: 'cardWrapper.expandFullScreen' }),
      )

      expect(onExpandFullscreen).toHaveBeenCalledTimes(1)
    })

    it('calls onOpenBugReport when bug-report button is clicked', async () => {
      const user = userEvent.setup()
      const { onOpenBugReport } = renderCardToolbar()

      await user.click(
        screen.getByRole('button', { name: 'cardWrapper.reportIssue' }),
      )

      expect(onOpenBugReport).toHaveBeenCalledTimes(1)
    })
  })

  describe('toolbar shell', () => {
    it('renders toolbar region with expected controls and CardActionMenu stub', () => {
      renderCardToolbar()

      const toolbar = screen.getByRole('toolbar', {
        name: `cardWrapper.cardControls:${TEST_CARD_TITLE}`,
      })
      expect(toolbar).toBeInTheDocument()
      expect(within(toolbar).getByRole('button', { name: 'cardWrapper.collapseCard' })).toBeInTheDocument()
      expect(within(toolbar).getByRole('button', { name: 'cardWrapper.refreshData' })).toBeInTheDocument()
      expect(within(toolbar).getByRole('button', { name: 'cardWrapper.expandFullScreen' })).toBeInTheDocument()
      expect(within(toolbar).getByRole('button', { name: 'cardWrapper.reportIssue' })).toBeInTheDocument()
      expect(within(toolbar).getByTestId('card-action-menu-stub')).toBeInTheDocument()
    })
  })
})
