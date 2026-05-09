import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import * as FeatureRequestModalModule from './FeatureRequestModal'
import { FeatureRequestModal } from './FeatureRequestModal'

// Mock heavy/lazy deps so the modal mounts cleanly in jsdom.
// createRequest is declared outside the factory so individual tests can
// swap its implementation (e.g. to simulate a successful submission).
const createRequestMock = vi.fn()

vi.mock('../../hooks/useFeatureRequests', () => ({
  useFeatureRequests: () => ({
    createRequest: createRequestMock,
    isSubmitting: false,
    requests: [],
    isLoading: false,
    isRefreshing: false,
    refresh: vi.fn(),
    requestUpdate: vi.fn(),
    closeRequest: vi.fn(),
    isDemoMode: false,
    summaries: [],
    error: null,
  }),
  useNotifications: () => ({
    notifications: [],
    isRefreshing: false,
    refresh: vi.fn(),
    getUnreadCountForRequest: () => 0,
    markRequestNotificationsAsRead: vi.fn(),
  }),
}))

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ user: { github_login: 'tester' }, isAuthenticated: true, token: 'real-token' }),
}))

vi.mock('../../hooks/useRewards', () => ({
  useRewards: () => ({ githubRewards: null, githubPoints: 0, refreshGitHubRewards: vi.fn() }),
}))

vi.mock('../../hooks/useFeedbackDrafts', () => ({
  useFeedbackDrafts: () => ({
    drafts: [],
    draftCount: 0,
    recentlyDeletedDrafts: [],
    recentlyDeletedCount: 0,
    saveDraft: vi.fn(),
    deleteDraft: vi.fn(),
    permanentlyDeleteDraft: vi.fn(),
    restoreDeletedDraft: vi.fn(),
    clearAllDrafts: vi.fn(),
    emptyRecentlyDeleted: vi.fn(),
  }),
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback || _k }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

const createFetchResponse = (hasToken: boolean) => ({
  ok: true,
  json: vi.fn().mockResolvedValue({ hasToken }),
})

describe('FeatureRequestModal Component', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    createRequestMock.mockReset()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createFetchResponse(true)))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exports FeatureRequestModal component', () => {
    expect(FeatureRequestModalModule.FeatureRequestModal).toBeDefined()
    expect(typeof FeatureRequestModalModule.FeatureRequestModal).toBe('function')
  })

  // Regression test for #9152 — clicking Discard after typing must close
  // both the discard confirmation AND the parent feedback modal.
  it('closes the parent modal when Discard is clicked from the unsaved-changes prompt', async () => {
    const onClose = vi.fn()
    render(<FeatureRequestModal isOpen onClose={onClose} initialTab="submit" />)

    // Type something into the description so handleClose enters the dirty path
    const textarea = await screen.findByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Some unsaved feedback text.' } })

    // Click the modal's X close button (header)
    const closeButtons = screen.getAllByRole('button').filter(b => b.querySelector('svg'))
    // The header X is the first button rendered above tabs; click any close
    // button until the discard prompt appears.
    for (const btn of closeButtons) {
      fireEvent.click(btn)
      if (screen.queryByText(/Discard/)) break
    }

    // Discard confirmation must be visible
    const discardBtn = await screen.findByText(/^Discard$/)
    expect(discardBtn).toBeInTheDocument()

    // Click Discard
    fireEvent.click(discardBtn)

    // Parent's onClose must have been called exactly once
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('warns before switching away from Submit when unsaved report content exists', async () => {
    render(<FeatureRequestModal isOpen onClose={vi.fn()} initialTab="submit" />)

    const textarea = await screen.findByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Unsaved draft content that should trigger a warning.' } })

    fireEvent.click(screen.getByRole('button', { name: /Drafts/i }))

    expect(await screen.findByText(/Save Draft & Switch/i)).toBeInTheDocument()
    expect(await screen.findByText(/Switch Without Saving/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('Unsaved draft content that should trigger a warning.')

    fireEvent.click(screen.getByText(/Switch Without Saving/i))

    await waitFor(() => {
      expect(screen.getByText(/^No saved drafts$/i)).toBeInTheDocument()
      expect(screen.queryByText(/Save Draft & Switch/i)).not.toBeInTheDocument()
    })
  })



  // Regression test for Issue 9358 — after a successful submission the
  // form shows the "Request Submitted" confirmation view. Clicking Close
  // must dismiss the modal cleanly, WITHOUT re-surfacing the unsaved-
  // changes (Save Draft) prompt, even though the internal description
  // state has not yet been reset by the SUCCESS_DISPLAY_MS timer.
  it('closes cleanly after successful submission without prompting to save as draft', async () => {
    const onClose = vi.fn()
    // Simulate a successful issue creation — onSubmit resolves with a URL.
    createRequestMock.mockResolvedValue({
      github_issue_url: 'https://github.com/kubestellar/console/issues/1234',
      screenshots_uploaded: 0,
      screenshots_failed: 0,
    })

    render(<FeatureRequestModal isOpen onClose={onClose} initialTab="submit" />)

    // Fill the description with a valid title (≥10 chars) + body (≥20 chars, ≥3 words).
    const textarea = await screen.findByRole('textbox')
    fireEvent.change(textarea, {
      target: {
        value:
          'This is a valid bug title\nThis bug happens when the console crashes on load and users cannot proceed.',
      },
    })

    // Submit the form.
    const submitBtn = screen.getByRole('button', { name: /^Submit/i })
    fireEvent.click(submitBtn)

    // Wait for the success view to appear. The success view renders a plain
    // (non-i18n) paragraph "Your request has been submitted for review." — use
    // that as the anchor so the assertion doesn't depend on the mocked `t`
    // returning the raw i18n key (feedback.requestSubmitted).
    await screen.findByText(/Your request has been submitted for review/i)

    // At this point the description state is intentionally still populated —
    // the modal clears it on a 5s timer. But the content has already been
    // filed as a GitHub issue, so closing must NOT prompt "Unsaved changes".
    const closeBtn = await screen.findByRole('button', { name: /^Close$/i })
    fireEvent.click(closeBtn)

    // Parent's onClose must be invoked…
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))

    // …and the Unsaved-changes dialog must NOT appear.
    expect(screen.queryByText(/Unsaved changes/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Save Draft & Close/i)).not.toBeInTheDocument()
  })

  it('rechecks backend token status each time the modal reopens', async () => {
    const fetchMock = vi.mocked(global.fetch)
    const tokenStatusResponses = [
      createFetchResponse(false) as Response,
      createFetchResponse(true) as Response,
    ]
    const getUrl = (input: string | URL | Request) =>
      typeof input === 'string' || input instanceof URL ? input.toString() : input.url
    const getTokenStatusCallCount = () => fetchMock.mock.calls.filter(([input]) =>
      getUrl(input as string | URL | Request).includes('/api/github/token/status')
    ).length

    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      if (getUrl(input).includes('/api/github/token/status')) {
        return tokenStatusResponses.shift() ?? (createFetchResponse(true) as Response)
      }
      return createFetchResponse(true) as Response
    })

    const { rerender } = render(<FeatureRequestModal isOpen onClose={vi.fn()} initialTab="submit" />)

    await waitFor(() => expect(getTokenStatusCallCount()).toBe(1))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Submit/i })).toHaveAttribute(
        'title',
        expect.stringContaining('FEEDBACK_GITHUB_TOKEN is not configured'),
      )
    }, { timeout: 5000 })

    rerender(<FeatureRequestModal isOpen={false} onClose={vi.fn()} initialTab="submit" />)
    rerender(<FeatureRequestModal isOpen onClose={vi.fn()} initialTab="submit" />)

    await waitFor(() => expect(getTokenStatusCallCount()).toBe(2))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Submit/i })).not.toHaveAttribute('title')
      expect(screen.queryByText(/GitHub integration not configured/i)).not.toBeInTheDocument()
    })
  })

  it('shows re-authentication guidance and a direct GitHub fallback for 403 permission errors', async () => {
    createRequestMock.mockRejectedValue(new Error(JSON.stringify({
      error: 'GitHub could not create the issue because the current token does not have permission to open issues in this repository. Re-authenticate with GitHub OAuth and try again, or open the issue directly on GitHub.',
    })))

    render(<FeatureRequestModal isOpen onClose={vi.fn()} initialTab="submit" />)

    const textarea = await screen.findByRole('textbox')
    fireEvent.change(textarea, {
      target: {
        value: 'Permission denied title\nSubmitting from the modal fails because the token cannot create issues in this repository.',
      },
    })

    fireEvent.click(screen.getByRole('button', { name: /^Submit/i }))

    await screen.findByText(/Re-authenticate with GitHub OAuth/i)
    expect(screen.getByRole('button', { name: /Re-authenticate with GitHub/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /feedback\.openGitHubIssue/i })).toHaveAttribute(
      'href',
      expect.stringContaining('https://github.com/kubestellar/console/issues/new'),
    )
  })
})
