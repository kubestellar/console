import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WhatsNewModal, isUpdateSnoozed } from './WhatsNewModal'

// Mock dependencies
vi.mock('../../hooks/useVersionCheck', () => ({
  useVersionCheck: () => ({
    latestRelease: {
      tag: 'v0.3.22',
      version: 'v0.3.22',
      releaseNotes: '# Test Release\n\n- Feature A\n- Bug fix B',
      publishedAt: new Date('2026-04-15T12:00:00Z'),
      url: 'https://github.com/kubestellar/console/releases/tag/v0.3.22',
      type: 'nightly' as const,
      date: '20260415',
    },
    releases: [
      {
        tag: 'v0.3.21',
        version: 'v0.3.21',
        releaseNotes: '# Previous\n\n- Old fix',
        publishedAt: new Date('2026-04-14T12:00:00Z'),
        url: '',
        type: 'nightly' as const,
        date: '20260414',
      },
    ],
    currentVersion: 'v0.3.20',
    installMethod: 'dev' as const,
    hasUpdate: true,
    skipVersion: vi.fn(),
    triggerUpdate: vi.fn().mockResolvedValue({ success: true }),
    cancelUpdate: vi.fn(),
  }),
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}))

vi.mock('../../lib/analytics', () => ({
  emitWhatsNewUpdateClicked: vi.fn(),
  emitWhatsNewRemindLater: vi.fn(),
}))

vi.mock('../../lib/modals', () => ({
  BaseModal: Object.assign(
    ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
      isOpen ? <div data-testid="modal">{children}</div> : null,
    {
      Header: ({ title, description }: { title: string; description?: string }) => (
        <div data-testid="modal-header">
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      ),
      Content: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="modal-content">{children}</div>
      ),
      Footer: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="modal-footer">{children}</div>
      ),
    }
  ),
}))

vi.mock('../ui/LazyMarkdown', () => ({
  LazyMarkdown: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}))

vi.mock('remark-gfm', () => ({ default: () => {} }))
vi.mock('remark-breaks', () => ({ default: () => {} }))

vi.mock('../../hooks/useSelfUpgrade', () => ({
  useSelfUpgrade: () => ({ triggerUpgrade: vi.fn().mockResolvedValue({ success: true }) }),
}))

vi.mock('../../lib/markdown/releaseNotesComponents', () => ({
  buildReleaseNotesComponents: () => ({}),
}))

vi.mock('../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: [] }) },
  RateLimitError: class RateLimitError extends Error {},
}))

vi.mock('../../lib/constants', () => ({
  COPY_FEEDBACK_TIMEOUT_MS: 2000,
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
}))

vi.mock('../../lib/constants/time', () => ({
  MS_PER_HOUR: 3600000,
  MS_PER_DAY: 86400000,
}))

vi.mock('../../lib/formatters', () => ({
  formatTimeAgo: (d: Date) => d.toISOString(),
}))

vi.mock('../../lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

describe('WhatsNewModal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('renders release notes when open', () => {
    render(<WhatsNewModal isOpen={true} onClose={onClose} />)
    expect(screen.getByTestId('modal')).toBeInTheDocument()
    expect(screen.getByTestId('modal-header')).toHaveTextContent("What's new")
    expect(screen.getByTestId('modal-header')).toHaveTextContent('v0.3.22')
    expect(screen.getByTestId('markdown')).toHaveTextContent('Test Release')
  })

  it('does not render when closed', () => {
    render(<WhatsNewModal isOpen={false} onClose={onClose} />)
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument()
  })

  it('shows previous releases section', () => {
    render(<WhatsNewModal isOpen={true} onClose={onClose} />)
    expect(screen.getByText(/Previous releases/)).toBeInTheDocument()
  })

  it('shows manual update commands section', () => {
    render(<WhatsNewModal isOpen={true} onClose={onClose} />)
    expect(screen.getByText(/How to update manually/)).toBeInTheDocument()
  })

  it('has Update now button', () => {
    render(<WhatsNewModal isOpen={true} onClose={onClose} />)
    expect(screen.getByText('Update now')).toBeInTheDocument()
  })

  it('has Skip this version button', () => {
    render(<WhatsNewModal isOpen={true} onClose={onClose} />)
    expect(screen.getByText('Skip this version')).toBeInTheDocument()
  })

  it('has Remind me later button', () => {
    render(<WhatsNewModal isOpen={true} onClose={onClose} />)
    expect(screen.getByText('Remind me later')).toBeInTheDocument()
  })

  it('calls onClose on skip', () => {
    render(<WhatsNewModal isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByText('Skip this version'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows snooze options when Remind me later is clicked', () => {
    render(<WhatsNewModal isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByText('Remind me later'))
    expect(screen.getByText('In 1 hour')).toBeInTheDocument()
    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    expect(screen.getByText('Next week')).toBeInTheDocument()
  })

  it('closes modal and sets snooze on snooze selection', () => {
    render(<WhatsNewModal isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByText('Remind me later'))
    fireEvent.click(screen.getByText('Tomorrow'))
    expect(onClose).toHaveBeenCalled()
    expect(isUpdateSnoozed()).toBe(true)
  })
})

describe('isUpdateSnoozed', () => {
  beforeEach(() => localStorage.clear())

  it('returns false when no snooze is set', () => {
    expect(isUpdateSnoozed()).toBe(false)
  })

  it('returns true during active snooze', () => {
    localStorage.setItem('kc-update-snoozed', String(Date.now() + 60_000))
    expect(isUpdateSnoozed()).toBe(true)
  })

  it('returns false after snooze expires', () => {
    localStorage.setItem('kc-update-snoozed', String(Date.now() - 1000))
    expect(isUpdateSnoozed()).toBe(false)
  })
})

// isKillSwitchEnabled was removed in PR #8527 — kill-switch is no longer needed
