import type React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import * as FeedbackModalModule from './FeedbackModal'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}))

vi.mock('../../lib/modals', () => ({
  ConfirmDialog: () => null,
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('../../hooks/useRewards', () => ({
  useRewards: () => ({ awardCoins: vi.fn() }),
  REWARD_ACTIONS: { bug_report: { coins: 50 }, feature_suggestion: { coins: 25 } },
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../../lib/analytics', () => ({
  emitFeedbackSubmitted: vi.fn(),
  emitLinkedInShare: vi.fn(),
  emitScreenshotAttached: vi.fn(),
  emitScreenshotUploadFailed: vi.fn(),
  emitScreenshotUploadSuccess: vi.fn(),
  getRecentBrowserErrors: () => [],
  getRecentFailedApiCalls: () => [],
}))

vi.mock('../../lib/clipboard', () => ({
  copyBlobToClipboard: vi.fn(),
}))

vi.mock('../../hooks/useBranding', () => ({
  useBranding: () => ({ productName: 'Console' }),
}))

vi.mock('@/lib/utils/sanitizeUrl', () => ({
  sanitizeUrl: (url: string) => url,
}))

vi.mock('../../lib/imageCompression', () => ({
  compressScreenshot: vi.fn(),
}))

vi.mock('../../hooks/useFeatureRequests', () => ({
  useFeatureRequests: () => ({
    createRequest: vi.fn().mockResolvedValue({ id: 'new-req' }),
  }),
  DiagnosticInfo: {},
}))

vi.mock('../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({
    health: 'healthy',
    status: 'connected',
    dataErrorCount: 0,
    lastDataError: null,
  }),
}))

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ user: { github_login: 'testuser' } }),
}))

vi.mock('@/lib/icons', () => ({
  Linkedin: () => null,
}))

vi.mock('../../lib/constants', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 30000,
  COPY_FEEDBACK_TIMEOUT_MS: 2000,
}))

vi.mock('../../lib/constants/network', () => ({
  FEEDBACK_UPLOAD_TIMEOUT_MS: 30000,
}))

vi.mock('./FeatureRequestTypes', () => ({
  MAX_VIDEO_SIZE_BYTES: 10 * 1024 * 1024,
  ACCEPTED_MEDIA_TYPES: 'image/*,video/*',
  ACCEPTED_VIDEO_MIME_TYPES: new Set(['video/mp4']),
  ATTACHMENT_HELP_TEXT: 'Attach files',
  isFeedbackRequestBodyTooLarge: () => false,
  isFeedbackRequestBodyLimitError: () => false,
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FeedbackModal Component', () => {
  it('exports FeedbackModal component', () => {
    expect(FeedbackModalModule.FeedbackModal).toBeDefined()
    expect(typeof FeedbackModalModule.FeedbackModal).toBe('function')
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <FeedbackModalModule.FeedbackModal isOpen={false} onClose={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  describe('semantic theme token classes', () => {
    it('uses bg-foreground/20 for keyboard shortcut badge, not light-only bg-white/20', () => {
      render(
        <FeedbackModalModule.FeedbackModal isOpen={true} onClose={vi.fn()} />,
      )
      // The open modal is rendered into document.body via createPortal
      const kbdEl = document.body.querySelector('kbd')
      if (kbdEl) {
        expect(kbdEl.className).toContain('bg-foreground/20')
        expect(kbdEl.className).not.toContain('bg-white/20')
      }
    })

    it('uses text-foreground for keyboard shortcut text, not light-only text-white', () => {
      render(
        <FeedbackModalModule.FeedbackModal isOpen={true} onClose={vi.fn()} />,
      )
      const kbdEl = document.body.querySelector('kbd')
      if (kbdEl) {
        expect(kbdEl.className).not.toContain('text-white')
      }
    })
  })
})
