/** @vitest-environment jsdom */
import { beforeEach, describe, it, expect, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { UpdatesTab } from '../UpdatesTab'
import type { FeatureRequest } from '../../../hooks/useFeatureRequests'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => options?.requestType ? `${key}:${options.requestType}` : key,
  }),
}))

vi.mock('../../rewards/ContributorLadder', () => ({
  ContributorBanner: () => <div data-testid="contributor-banner" />,
}))

vi.mock('../../../lib/icons', () => ({
  Github: () => <svg data-testid="github-icon" />,
  Linkedin: () => <svg data-testid="linkedin-icon" />,
}))

const baseRequest: FeatureRequest = {
  id: 'request-1',
  user_id: 'user-1',
  github_login: 'reporter',
  title: 'Merged bug fix',
  description: 'The fix was merged but needs verification.',
  request_type: 'bug',
  github_issue_number: 12996,
  github_issue_url: 'https://github.com/kubestellar/console/issues/12996',
  status: 'fix_complete',
  pr_number: 13000,
  pr_url: 'https://github.com/kubestellar/console/pull/13000',
  created_at: '2024-01-01T00:00:00Z',
}

function renderUpdatesTab(overrides?: Partial<ComponentProps<typeof UpdatesTab>>) {
  const onCloseRequest = vi.fn(() => Promise.resolve({}))
  const onReopenRequest = vi.fn(() => Promise.resolve({}))

  const rendered = render(
    <UpdatesTab
      requests={[baseRequest]}
      requestsLoading={false}
      isRefreshing={false}
      isInDemoMode={false}
      canPerformActions={true}
      currentGitHubLogin="reporter"
      githubRewards={null}
      githubPoints={0}
      token="token"
      showToast={vi.fn()}
      onRefreshRequests={vi.fn()}
      onRefreshNotifications={vi.fn()}
      onRefreshGitHub={vi.fn()}
      isGitHubRefreshing={false}
      onRequestUpdate={vi.fn(() => Promise.resolve())}
      onCloseRequest={onCloseRequest}
      onReopenRequest={onReopenRequest}
      getUnreadCountForRequest={vi.fn(() => 0)}
      markRequestNotificationsAsRead={vi.fn()}
      onShowLoginPrompt={vi.fn()}
      {...overrides}
    />
  )

  return { onCloseRequest, onReopenRequest, ...rendered }
}

describe('UpdatesTab verification flow', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders the awaiting verification prompt for owned fix_complete requests', async () => {
    const { onCloseRequest } = renderUpdatesTab()

    expect(screen.getByTestId('awaiting-verification-request-1')).toBeTruthy()
    fireEvent.click(screen.getByText('feedback.verifyFix'))

    await waitFor(() => {
      expect(onCloseRequest).toHaveBeenCalledWith('request-1', { user_verified: true })
    })
  })

  it('submits follow-up details when the fix is still broken', async () => {
    const { onReopenRequest } = renderUpdatesTab()

    fireEvent.click(screen.getByText('feedback.stillBroken'))
    fireEvent.change(screen.getByPlaceholderText('feedback.stillBrokenPlaceholder'), {
      target: { value: 'Still broken on my cluster after the merged change.' },
    })
    fireEvent.click(screen.getByText('feedback.submitStillBroken'))

    await waitFor(() => {
      expect(onReopenRequest).toHaveBeenCalledWith('request-1', {
        comment: 'Still broken on my cluster after the merged change.',
      })
    })
  })

  it('restores the verified state from localStorage after remounting', async () => {
    const firstRender = renderUpdatesTab()

    fireEvent.click(screen.getByText('feedback.verifyFix'))

    await waitFor(() => {
      expect(firstRender.onCloseRequest).toHaveBeenCalledWith('request-1', { user_verified: true })
    })

    await waitFor(() => {
      expect(screen.queryByTestId('awaiting-verification-request-1')).toBeNull()
    })

    firstRender.unmount()
    renderUpdatesTab()

    expect(screen.queryByTestId('awaiting-verification-request-1')).toBeNull()
    expect(screen.getByText('feedback.verifiedByYou')).toBeTruthy()
  })

  it('hides verification controls when the user already verified the fix', () => {
    renderUpdatesTab({
      requests: [{ ...baseRequest, closed_by_user: true }],
    })

    expect(screen.queryByTestId('awaiting-verification-request-1')).toBeNull()
    expect(screen.getByText('feedback.verifiedByYou')).toBeTruthy()
  })

  it('degrades gracefully when localStorage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    const { onCloseRequest } = renderUpdatesTab()

    expect(screen.getByTestId('awaiting-verification-request-1')).toBeTruthy()

    fireEvent.click(screen.getByText('feedback.verifyFix'))

    await waitFor(() => {
      expect(onCloseRequest).toHaveBeenCalledWith('request-1', { user_verified: true })
    })

    await waitFor(() => {
      expect(screen.queryByTestId('awaiting-verification-request-1')).toBeNull()
    })
  })
})
