/**
 * UpdatesTabRequestItem tests
 *
 * Verifies that RequestItem renders correctly and uses semantic theme token
 * classes introduced in the dark-mode migration (PR #16578) rather than the
 * old light-only Tailwind classes.
 */

import type React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { FeatureRequest } from '../../hooks/useFeatureRequests'
import type { RequestItemProps } from './UpdatesTab.types'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('../../hooks/useFeatureRequests', () => ({
  isTriaged: (status: string) => status !== 'open' && status !== 'needs_triage',
  getStatusDescription: () => null,
}))

vi.mock('./FeatureRequestTypes', () => ({
  formatRelativeTime: () => '2 hours ago',
  getStatusInfo: () => ({
    label: 'Fix complete',
    bgColor: 'bg-green-500/20',
    color: 'text-green-400',
  }),
  PREVIEW_WARMUP_SECONDS: 30,
}))

vi.mock('@/lib/utils/sanitizeUrl', () => ({
  sanitizeUrl: (url: string) => url,
}))

vi.mock('../../lib/utils/isValidPreviewUrl', () => ({
  isValidPreviewUrl: () => true,
}))

vi.mock('../../lib/constants/time', () => ({
  MS_PER_SECOND: 1000,
}))

vi.mock('./updatesTabStorage', () => ({
  getVerifiedFixStorageKey: () => 'test-storage-key',
  readVerifiedFixState: () => false,
  writeVerifiedFixState: vi.fn(),
}))

// ── Fixtures ─────────────────────────────────────────────────────────────────

const fixCompleteRequest: FeatureRequest = {
  id: 'req-1',
  user_id: 'user-1',
  github_login: 'testuser',
  title: 'Test feature request',
  description: 'Test description',
  request_type: 'feature',
  status: 'fix_complete',
  closed_by_user: true,
  created_at: '2024-01-01T00:00:00Z',
}

const bugRequest: FeatureRequest = {
  id: 'req-2',
  user_id: 'user-1',
  github_login: 'testuser',
  title: 'Test bug report',
  description: 'Something broke',
  request_type: 'bug',
  status: 'in_progress',
  created_at: '2024-01-02T00:00:00Z',
}

function makeProps(request: FeatureRequest, overrides: Partial<RequestItemProps> = {}): RequestItemProps {
  return {
    request,
    currentGitHubLogin: 'testuser',
    canPerformActions: true,
    actionLoading: null,
    confirmClose: null,
    previewChecking: null,
    previewResults: {},
    getUnreadCountForRequest: () => 0,
    markRequestNotificationsAsRead: vi.fn(),
    onRequestUpdate: vi.fn().mockResolvedValue(undefined),
    onCloseRequest: vi.fn().mockResolvedValue(true),
    onReopenRequest: vi.fn().mockResolvedValue(undefined),
    onSetConfirmClose: vi.fn(),
    onCheckPreview: vi.fn().mockResolvedValue(undefined),
    onShowLoginPrompt: vi.fn(),
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

import { RequestItem } from './UpdatesTabRequestItem'

describe('RequestItem', () => {
  it('renders the request title', () => {
    render(<RequestItem {...makeProps(fixCompleteRequest)} />)
    expect(screen.getByText(/Test feature request/)).toBeInTheDocument()
  })

  it('renders a bug request title with bug prefix', () => {
    render(<RequestItem {...makeProps(bugRequest)} />)
    expect(screen.getByText(/Test bug report/)).toBeInTheDocument()
  })

  it('shows the request type badge', () => {
    const { container } = render(<RequestItem {...makeProps(fixCompleteRequest)} />)
    expect(screen.getByText('Feature')).toBeInTheDocument()
    expect(container.querySelector('.bg-purple-500\\/20')).not.toBeNull()
  })

  it('shows Bug type badge for bug requests', () => {
    render(<RequestItem {...makeProps(bugRequest)} />)
    expect(screen.getByText('Bug')).toBeInTheDocument()
  })

  describe('semantic theme token classes', () => {
    it('uses bg-muted for the Closed badge, not light-only bg-gray-500/20', () => {
      const { container } = render(<RequestItem {...makeProps(fixCompleteRequest)} />)
      expect(screen.getByText('Closed')).toBeInTheDocument()
      expect(container.querySelector('.bg-muted')).not.toBeNull()
      expect(container.querySelector('.bg-gray-500\\/20')).toBeNull()
    })

    it('uses bg-secondary/30 for row hover, not bg-white/10', () => {
      const { container } = render(<RequestItem {...makeProps(fixCompleteRequest)} />)
      const row = container.querySelector('.hover\\:bg-secondary\\/30')
      expect(row).not.toBeNull()
      expect(container.querySelector('.hover\\:bg-white\\/10')).toBeNull()
    })
  })
})
