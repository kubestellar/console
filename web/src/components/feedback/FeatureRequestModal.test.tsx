import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import * as FeatureRequestModalModule from './FeatureRequestModal'
import { FeatureRequestModal } from './FeatureRequestModal'

// Mock heavy/lazy deps so the modal mounts cleanly in jsdom
vi.mock('../../hooks/useFeatureRequests', () => ({
  useFeatureRequests: () => ({
    createRequest: vi.fn(),
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
    saveDraft: vi.fn(),
    deleteDraft: vi.fn(),
    clearAllDrafts: vi.fn(),
  }),
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback || _k }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

describe('FeatureRequestModal Component', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
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
})
