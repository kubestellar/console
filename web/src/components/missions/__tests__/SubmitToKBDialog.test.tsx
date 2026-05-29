/**
 * SubmitToKBDialog unit tests
 *
 * Covers: closed state, open render, CNCF detection, filename generation,
 * mission type toggle, security scan states, submit/cancel behaviour,
 * long-URL fallback to issue link.
 */

import type React from 'react'
import * as ReactModule from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { MockedFunction } from 'vitest'

// ── Hoisted mock refs ────────────────────────────────────────────────────

const { mockBuildGitHubNewFileUrl, mockBuildGitHubIssueUrl } = vi.hoisted(() => ({
  mockBuildGitHubNewFileUrl: vi.fn(() => 'https://github.com/kubestellar/console-kb/new/master'),
  mockBuildGitHubIssueUrl: vi.fn(() => 'https://github.com/kubestellar/console-kb/issues/new'),
}))

// ── Module mocks ─────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const pluralized = {
        'missions.browser.stepsCount': options?.count === 1 ? '{{count}} step' : '{{count}} steps',
        'missions.submitToKB.findings': options?.count === 1
          ? '{{count}} finding — review before submitting'
          : '{{count}} findings — review before submitting',
      } as Record<string, string | undefined>
      const map: Record<string, string> = {
        'missions.submitToKB.title': 'Submit to Knowledge Base',
        'missions.submitToKB.missionType': 'Mission Type',
        'missions.submitToKB.missionClass.fixer.label': 'Fixer',
        'missions.submitToKB.missionClass.fixer.description': 'Troubleshooting fix',
        'missions.submitToKB.missionClass.install.label': 'Install Mission',
        'missions.submitToKB.missionClass.install.description': 'Setup / deploy guide',
        'missions.submitToKB.cncfProject': 'CNCF Project',
        'missions.submitToKB.optional': 'optional',
        'missions.submitToKB.cncfProjectPlaceholder': 'e.g., Istio, Argo CD, Prometheus...',
        'missions.submitToKB.filename': 'Filename',
        'missions.submitToKB.scanning': 'Scanning for sensitive data...',
        'missions.submitToKB.noSensitiveData': 'No sensitive data detected',
        'missions.submitToKB.runSecurityScan': 'Run security scan',
        'missions.submitToKB.previewJson': 'Preview JSON ({{count}} chars)',
        'missions.submitToKB.opensPr': 'Opens a PR on {{repo}}',
        'missions.submitToKB.cancel': 'Cancel',
        'missions.submitToKB.submit': 'Submit to KB',
        'missions.submitToKB.submitting': 'Submitting...',
      }
      let value = pluralized[key] ?? map[key] ?? key
      for (const [name, replacement] of Object.entries(options ?? {})) {
        value = value.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g'), String(replacement))
      }
      return value
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('@/lib/githubUrls', () => ({
  buildGitHubNewFileUrl: mockBuildGitHubNewFileUrl,
  buildGitHubIssueUrl: mockBuildGitHubIssueUrl,
}))

vi.mock('../../../lib/missions/scanner/index', () => ({
  fullScan: vi.fn(() => ({ valid: true, findings: [] })),
}))

vi.mock('../../../lib/modals/BaseModal', () => ({
  BaseModal: Object.assign(
    ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
      isOpen ? <div role="dialog">{children}</div> : null,
    {
      Header: ({ title, onClose }: { title: string; onClose?: () => void }) => (
        <div>
          <h1>{title}</h1>
          {onClose && <button onClick={onClose} aria-label="close dialog">×</button>}
        </div>
      ),
      Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      Footer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    }
  ),
}))

// Import after mocks are in place
import { SubmitToKBDialog } from '../SubmitToKBDialog'
import type { Resolution } from '../../../hooks/useResolutions'
import { fullScan } from '../../../lib/missions/scanner/index'

// ── Fixtures ─────────────────────────────────────────────────────────────

const BASE_RESOLUTION: Resolution = {
  id: 'res-1',
  missionId: 'mission-1',
  userId: 'user-1',
  title: 'Fix kyverno webhook failure',
  visibility: 'private',
  issueSignature: {
    type: 'WebhookTimeout',
    resourceKind: 'Policy',
    namespace: 'kyverno',
  },
  resolution: {
    summary: 'Restart kyverno pods to clear webhook state',
    steps: ['kubectl rollout restart -n kyverno', 'Verify webhooks respond'],
  },
  context: { cluster: 'prod', operators: ['kyverno'] },
  effectiveness: { timesUsed: 1, timesSuccessful: 1 },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const PLAIN_RESOLUTION: Resolution = {
  id: 'res-2',
  missionId: 'mission-2',
  userId: 'user-2',
  title: 'Increase pod memory limit',
  visibility: 'private',
  issueSignature: { type: 'OOMKilled', resourceKind: 'Pod' },
  resolution: {
    summary: 'Set memory limit to 512Mi',
    steps: ['Edit deployment', 'Apply change'],
  },
  context: { cluster: 'dev' },
  effectiveness: { timesUsed: 0, timesSuccessful: 0 },
  createdAt: '2026-02-01T00:00:00Z',
  updatedAt: '2026-02-01T00:00:00Z',
}

const DEFAULT_PROPS = {
  resolution: BASE_RESOLUTION,
  isOpen: true,
  onClose: vi.fn(),
}

const SUBMIT_DIALOG_STATE_CALLS_PER_RENDER = 5

function mockUseStateAtCall(callIndex: number, forcedValue: unknown) {
  const actualUseState = ReactModule.useState
  let callCount = 0

  return vi.spyOn(ReactModule, 'useState').mockImplementation(((initial: unknown) => {
    callCount += 1
    if (
      callCount >= callIndex
      && (callCount - callIndex) % SUBMIT_DIALOG_STATE_CALLS_PER_RENDER === 0
    ) {
      return [forcedValue, vi.fn()] as never
    }

    return actualUseState(initial as never)
  }) as typeof ReactModule.useState)
}

// ── Helpers ───────────────────────────────────────────────────────────────

function renderDialog(props = DEFAULT_PROPS) {
  return render(<SubmitToKBDialog {...props} />)
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('SubmitToKBDialog', () => {
  let mockWindowOpen: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockWindowOpen = vi.fn()
    vi.stubGlobal('open', mockWindowOpen)
    ;(fullScan as MockedFunction<typeof fullScan>).mockReturnValue({ valid: true, findings: [] })
    mockBuildGitHubNewFileUrl.mockReturnValue('https://github.com/kubestellar/console-kb/new/master')
    mockBuildGitHubIssueUrl.mockReturnValue('https://github.com/kubestellar/console-kb/issues/new')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Closed / open rendering ──────────────────────────────────────────

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <SubmitToKBDialog resolution={BASE_RESOLUTION} isOpen={false} onClose={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders the dialog title when open', () => {
    renderDialog()
    expect(screen.getByRole('heading', { name: /Submit to Knowledge Base/i })).toBeInTheDocument()
  })

  it('shows the resolution title in the preview section', () => {
    renderDialog()
    expect(screen.getByText(BASE_RESOLUTION.title)).toBeInTheDocument()
  })

  it('shows issue type in the preview section', () => {
    renderDialog()
    const matches = screen.getAllByText(/WebhookTimeout/)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('shows step count in the preview section', () => {
    renderDialog()
    expect(screen.getByText(/2 steps/)).toBeInTheDocument()
  })

  // ── Mission type toggle ──────────────────────────────────────────────

  it('defaults to Fixer mission type', () => {
    renderDialog()
    const fixerBtn = screen.getByRole('button', { name: /Fixer/i })
    expect(fixerBtn.className).toContain('bg-purple-500')
  })

  it('switches to Install Mission when clicked', () => {
    renderDialog()
    const installBtn = screen.getByRole('button', { name: /Install Mission/i })
    fireEvent.click(installBtn)
    expect(installBtn.className).toContain('bg-blue-500')
  })

  it('shows fixes/troubleshoot target dir for fixer type', () => {
    renderDialog()
    expect(screen.getByText('fixes/troubleshoot/')).toBeInTheDocument()
  })

  it('shows fixes/cncf-install target dir after switching to install', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /Install Mission/i }))
    expect(screen.getByText('fixes/cncf-install/')).toBeInTheDocument()
  })

  // ── CNCF project detection ───────────────────────────────────────────

  it('auto-detects CNCF project from operators list', () => {
    renderDialog()
    const input = screen.getByPlaceholderText(/e.g., Istio, Argo CD/i) as HTMLInputElement
    expect(input.value).toBe('Kyverno')
  })

  it('shows empty CNCF project for plain resolution with no keywords', () => {
    renderDialog({ ...DEFAULT_PROPS, resolution: PLAIN_RESOLUTION })
    // OOMKilled has no CNCF keyword
    const input = screen.getByPlaceholderText(/e.g., Istio, Argo CD/i) as HTMLInputElement
    expect(input.value).toBe('')
  })

  it('allows editing the CNCF project field', () => {
    renderDialog()
    const input = screen.getByPlaceholderText(/e.g., Istio, Argo CD/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Falco' } })
    expect(input.value).toBe('Falco')
  })

  // ── Filename generation ──────────────────────────────────────────────

  it('generates a fixer- prefixed filename from the resolution title', () => {
    renderDialog()
    const input = screen.getByDisplayValue(/fixer-fix-kyverno-webhook-failure/) as HTMLInputElement
    expect(input.value).toMatch(/^fixer-fix-kyverno-webhook-failure/)
  })

  it('generates an install- prefixed filename after switching to install type', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /Install Mission/i }))
    const input = screen.getByDisplayValue(/install-fix-kyverno-webhook-failure/) as HTMLInputElement
    expect(input.value).toMatch(/^install-fix-kyverno-webhook-failure/)
  })

  it('allows editing the filename', () => {
    renderDialog()
    const input = screen.getByDisplayValue(/fixer-fix-kyverno/) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'custom-fix.json' } })
    expect(input.value).toBe('custom-fix.json')
  })

  // ── Security scan ────────────────────────────────────────────────────

  it('runs fullScan automatically on open', () => {
    renderDialog()
    expect(fullScan).toHaveBeenCalledTimes(1)
  })

  it('shows "No sensitive data detected" when scan finds no issues', () => {
    renderDialog()
    expect(screen.getByText(/No sensitive data detected/i)).toBeInTheDocument()
  })

  it('shows warning count when scan finds issues', () => {
    ;(fullScan as MockedFunction<typeof fullScan>).mockReturnValue({
      valid: false,
      findings: [
        { severity: 'warning', field: 'title', message: 'Contains token' },
        { severity: 'error', field: 'steps', message: 'Possible secret' },
      ],
    })
    renderDialog()
    expect(screen.getByText(/2 findings\s+—\s+review before submitting/i)).toBeInTheDocument()
  })

  // ── Submit / Cancel ──────────────────────────────────────────────────

  it('disables Submit to KB when filename is empty', () => {
    renderDialog()
    const input = screen.getByDisplayValue(/fixer-fix-kyverno/) as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    const submitBtn = screen.getByRole('button', { name: /Submit to KB/i })
    expect(submitBtn).toBeDisabled()
  })

  it('enables Submit to KB when filename is not empty', () => {
    renderDialog()
    const submitBtn = screen.getByRole('button', { name: /Submit to KB/i })
    expect(submitBtn).not.toBeDisabled()
  })

  it('shows a spinner and disables the submit button while submitting', () => {
    mockUseStateAtCall(5, true)

    renderDialog()

    const submitBtn = screen.getByRole('button', { name: /Submitting/i })
    expect(submitBtn).toBeDisabled()
    expect(submitBtn.querySelector('svg.animate-spin')).toBeInTheDocument()
  })

  it('re-enables the submit button after submission completes', async () => {
    renderDialog()

    const submitBtn = screen.getByRole('button', { name: /Submit to KB/i })
    await act(async () => {
      fireEvent.click(submitBtn)
    })

    expect(screen.getByRole('button', { name: /Submit to KB/i })).not.toBeDisabled()
  })

  it('calls window.open and onClose when Submit to KB is clicked', () => {
    const onClose = vi.fn()
    render(<SubmitToKBDialog resolution={BASE_RESOLUTION} isOpen onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /Submit to KB/i }))
    expect(mockWindowOpen).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('falls back to GitHub issue URL when new-file URL exceeds 7500 chars', () => {
    mockBuildGitHubNewFileUrl.mockReturnValue('x'.repeat(7501))
    const onClose = vi.fn()
    render(<SubmitToKBDialog resolution={BASE_RESOLUTION} isOpen onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /Submit to KB/i }))
    expect(mockBuildGitHubIssueUrl).toHaveBeenCalledTimes(1)
    expect(mockWindowOpen).toHaveBeenCalledWith(
      mockBuildGitHubIssueUrl.mock.results[0].value,
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn()
    render(<SubmitToKBDialog resolution={BASE_RESOLUTION} isOpen onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when header close button is clicked', () => {
    const onClose = vi.fn()
    render(<SubmitToKBDialog resolution={BASE_RESOLUTION} isOpen onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
