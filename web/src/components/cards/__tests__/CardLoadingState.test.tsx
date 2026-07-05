import React from 'react'
/**
 * Direct Vitest coverage for CardLoadingState presentational branches (#15510).
 *
 * Run from web/:  npm run test:card-loading-state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardLoadingState, type CardLoadingStateProps } from '../CardLoadingState'
import type { CardDataState } from '../CardDataContext'

const TEST_CARD_ID = 'card-loading-test-id'
const TEST_CARD_TYPE = 'cluster_health'
const TEST_CARD_TITLE = 'Cluster Health'
const CHILD_CONTENT_TEXT = 'card-loading-child-content'
const SKELETON_ROW_COUNT = 3
const CHILDREN_CONTAINER_TEST_ID = 'card-loading-children'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../card-wrapper/InstallCTAFlow', () => ({
  InstallCTAFlow: ({ cardType, title }: { cardType: string; title: string }) => (
    <div data-testid="install-cta-flow" data-card-type={cardType} data-title={title} />
  ),
}))

function renderCardLoadingState(overrides: Partial<CardLoadingStateProps> = {}) {
  const props: CardLoadingStateProps = {
    cardId: TEST_CARD_ID,
    cardType: TEST_CARD_TYPE,
    title: TEST_CARD_TITLE,
    children: <div data-testid="card-child">{CHILD_CONTENT_TEXT}</div>,
    isVisible: true,
    isExpanded: false,
    shouldShowSkeleton: false,
    skeletonType: 'list',
    skeletonRows: SKELETON_ROW_COUNT,
    cardLoadingTimedOut: false,
    childDataState: null,
    isVisuallySpinning: false,
    showInstallCta: false,
    ...overrides,
  }
  return render(<CardLoadingState {...props} />)
}

function emptyChildDataState(overrides: Partial<CardDataState> = {}): CardDataState {
  return {
    isFailed: false,
    consecutiveFailures: 0,
    isLoading: false,
    hasData: false,
    ...overrides,
  }
}

function getChildrenContainer() {
  return screen.getByTestId(CHILDREN_CONTAINER_TEST_ID)
}

function getTimeoutPanel(container: HTMLElement) {
  const panel = container.querySelector('[data-card-loading-timeout="true"]')
  expect(panel).not.toBeNull()
  return panel as HTMLElement
}

function getEmptyStatePanel(container: HTMLElement) {
  const panel = container.querySelector('[data-card-empty-state="true"]')
  expect(panel).not.toBeNull()
  return panel as HTMLElement
}

describe('CardLoadingState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('invisible-card branch', () => {
    it('renders bare skeleton without header and does not mount children', () => {
      const { container } = renderCardLoadingState({
        isVisible: false,
        isExpanded: false,
        shouldShowSkeleton: true,
        cardLoadingTimedOut: true,
        childDataState: emptyChildDataState(),
      })

      expect(screen.queryByTestId('card-child')).not.toBeInTheDocument()
      expect(screen.queryByTestId(CHILDREN_CONTAINER_TEST_ID)).not.toBeInTheDocument()
      expect(container.querySelector('[data-card-skeleton="true"]')).not.toBeInTheDocument()
      expect(container.querySelector('[data-card-loading-timeout="true"]')).not.toBeInTheDocument()
      expect(container.querySelector('[data-card-empty-state="true"]')).not.toBeInTheDocument()
      expect(container.querySelector('.min-h-card')).toBeInTheDocument()
    })

    it('still renders when expanded even if not visible', () => {
      renderCardLoadingState({
        isVisible: false,
        isExpanded: true,
        childDataState: emptyChildDataState({ hasData: true }),
      })

      expect(screen.getByTestId('card-child')).toBeInTheDocument()
      expect(getChildrenContainer()).toHaveClass('flex', 'flex-1', 'flex-col')
      expect(getChildrenContainer()).not.toHaveClass('hidden')
    })
  })

  describe('skeleton branch', () => {
    it('renders data-card-skeleton and hides children', () => {
      const { container } = renderCardLoadingState({ shouldShowSkeleton: true })

      expect(container.querySelector('[data-card-skeleton="true"]')).toBeInTheDocument()
      expect(getChildrenContainer()).toHaveClass('hidden')
    })
  })

  describe('loading timeout branch', () => {
    const timeoutState = () =>
      emptyChildDataState({ isLoading: true, hasData: false })

    it('renders timeout panel with AlertTriangle when timed out without data', () => {
      const { container } = renderCardLoadingState({
        cardLoadingTimedOut: true,
        childDataState: timeoutState(),
      })

      const timeoutPanel = getTimeoutPanel(container)
      expect(within(timeoutPanel).getByText('cardWrapper.loadingTimedOutTitle')).toBeInTheDocument()
      expect(within(timeoutPanel).getByText('cardWrapper.loadingTimedOutMessage')).toBeInTheDocument()
      expect(timeoutPanel.querySelector('svg')).toBeTruthy()
      expect(getChildrenContainer()).toHaveClass('hidden')
    })

    it('calls onLoadingTimeoutRetry when retry button is clicked', async () => {
      const user = userEvent.setup()
      const onLoadingTimeoutRetry = vi.fn()
      const { container } = renderCardLoadingState({
        cardLoadingTimedOut: true,
        childDataState: timeoutState(),
        onLoadingTimeoutRetry,
      })

      const timeoutPanel = getTimeoutPanel(container)
      const retryBtn = within(timeoutPanel).getByRole('button', {
        name: 'cardWrapper.loadingTimedOutRetry',
      })
      await user.click(retryBtn)

      expect(onLoadingTimeoutRetry).toHaveBeenCalledTimes(1)
    })

    it('calls onRemove when remove button is clicked', async () => {
      const user = userEvent.setup()
      const onRemove = vi.fn()
      const { container } = renderCardLoadingState({
        cardLoadingTimedOut: true,
        childDataState: timeoutState(),
        onRemove,
      })

      const timeoutPanel = getTimeoutPanel(container)
      const removeBtn = within(timeoutPanel).getByTestId('card-remove-button')
      await user.click(removeBtn)

      expect(onRemove).toHaveBeenCalledTimes(1)
    })

    it('applies animate-spin to RefreshCw when isVisuallySpinning is true', () => {
      const { container } = renderCardLoadingState({
        cardLoadingTimedOut: true,
        childDataState: timeoutState(),
        onLoadingTimeoutRetry: vi.fn(),
        isVisuallySpinning: true,
      })

      const timeoutPanel = getTimeoutPanel(container)
      const retryBtn = within(timeoutPanel).getByRole('button', {
        name: 'cardWrapper.loadingTimedOutRetry',
      })
      expect(retryBtn.querySelector('.animate-spin')).toBeTruthy()
    })
  })

  describe('empty-state branch', () => {
    it('renders empty-state panel when loaded without data', () => {
      const { container } = renderCardLoadingState({
        childDataState: emptyChildDataState(),
      })

      const emptyPanel = getEmptyStatePanel(container)
      expect(within(emptyPanel).getByText('cardWrapper.noDataTitle')).toBeInTheDocument()
      expect(getChildrenContainer()).toHaveClass('hidden')
    })

    it('calls onRefresh when refresh button is clicked', async () => {
      const user = userEvent.setup()
      const onRefresh = vi.fn()
      const { container } = renderCardLoadingState({
        childDataState: emptyChildDataState(),
        onRefresh,
      })

      const emptyPanel = getEmptyStatePanel(container)
      // Production reuses cardWrapper.loadingTimedOutRetry for empty-state refresh aria-label.
      const refreshBtn = within(emptyPanel).getByRole('button', {
        name: 'cardWrapper.loadingTimedOutRetry',
      })
      await user.click(refreshBtn)

      expect(onRefresh).toHaveBeenCalledTimes(1)
    })

    it('does not render empty state when loading timed out', () => {
      const { container } = renderCardLoadingState({
        cardLoadingTimedOut: true,
        childDataState: emptyChildDataState({ isLoading: true }),
      })

      expect(container.querySelector('[data-card-empty-state="true"]')).not.toBeInTheDocument()
      expect(container.querySelector('[data-card-loading-timeout="true"]')).toBeInTheDocument()
    })
  })

  describe('normal children branch', () => {
    it('shows children with flex layout when no branch is active', () => {
      const { container } = renderCardLoadingState({
        childDataState: emptyChildDataState({ hasData: true }),
      })

      expect(screen.getByTestId('card-child')).toHaveTextContent(CHILD_CONTENT_TEXT)
      expect(getChildrenContainer()).toHaveClass('flex', 'flex-1', 'flex-col')
      expect(getChildrenContainer()).not.toHaveClass('hidden')
      expect(container.querySelector('[data-card-skeleton="true"]')).not.toBeInTheDocument()
      expect(container.querySelector('[data-card-empty-state="true"]')).not.toBeInTheDocument()
    })
  })

  describe('InstallCTAFlow', () => {
    it('renders InstallCTAFlow when showInstallCta is true', () => {
      renderCardLoadingState({
        showInstallCta: true,
        childDataState: emptyChildDataState({ hasData: true }),
      })

      const cta = screen.getByTestId('install-cta-flow')
      expect(cta).toHaveAttribute('data-card-type', TEST_CARD_TYPE)
      expect(cta).toHaveAttribute('data-title', TEST_CARD_TITLE)
    })
  })
})
