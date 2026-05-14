import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react'
import { ToastProvider } from '../../../ui/Toast'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('../../../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
  emitAddCardModalOpened: vi.fn(), emitCardExpanded: vi.fn(), emitCardRefreshed: vi.fn(),
  emitGitHubTokenConfigured: vi.fn(), emitGitHubTokenRemoved: vi.fn(), emitConversionStep: vi.fn(),
}))

vi.mock('../../../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}))

import { GitHubTokenSection, buildGitHubTokenSaveError, buildGitHubTokenValidationError } from '../GitHubTokenSection'

function renderGitHubTokenSection() {
  return render(
    <ToastProvider>
      <GitHubTokenSection forceVersionCheck={vi.fn()} />
    </ToastProvider>
  )
}

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

describe('GitHubTokenSection', () => {
  it('adds troubleshooting guidance for GitHub 403 token validation failures', () => {
    expect(buildGitHubTokenValidationError(403, 'Resource not accessible by personal access token')).toContain("Classic PATs need the 'repo' scope")
    expect(buildGitHubTokenValidationError(403, 'Resource not accessible by personal access token')).toContain("'Issues' and 'Contents' read/write permissions")
  })

  it('shows a descriptive admin message for save-token 403 failures', () => {
    expect(buildGitHubTokenSaveError(403, 'Console admin access required')).toContain('grant your account the admin role')
  })

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    localStorage.clear()
    window.history.replaceState({}, '', '/settings')
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    localStorage.clear()
    window.history.replaceState({}, '', '/settings')
  })

  it('renders without crashing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockJsonResponse({ hasToken: false, source: '' }))

    const { container } = renderGitHubTokenSection()

    expect(container).toBeTruthy()
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/github/token/status', expect.any(Object)))
  })

  it('disables the Clear button while token validation is in progress', async () => {
    const INITIAL_RATE_LIMIT = {
      limit: 5000,
      remaining: 4999,
      reset: 1_700_000_000,
    }
    let resolveRateLimit: ((value: Response) => void) | null = null
    const rateLimitPromise = new Promise<Response>((resolve) => {
      resolveRateLimit = resolve
    })

    vi.mocked(fetch)
      .mockResolvedValueOnce(mockJsonResponse({ hasToken: true, source: 'settings' }))
      .mockResolvedValueOnce(mockJsonResponse({ rate: INITIAL_RATE_LIMIT }))
      .mockResolvedValueOnce(mockJsonResponse({}))
      .mockImplementationOnce(() => rateLimitPromise)

    renderGitHubTokenSection()

    const clearButton = await screen.findByRole('button', { name: 'settings.github.clear' })
    const tokenInput = screen.getByLabelText('settings.github.feedbackToken')
    const saveButton = screen.getByRole('button', { name: 'settings.github.saveAndTest' })

    fireEvent.change(tokenInput, { target: { value: 'github_pat_test' } })
    fireEvent.click(saveButton)

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/github/token', expect.objectContaining({ method: 'POST' })))
    expect(clearButton).toBeDisabled()

    await act(async () => {
      resolveRateLimit?.(mockJsonResponse({ rate: INITIAL_RATE_LIMIT }))
      await Promise.resolve()
    })

    await waitFor(() => expect(clearButton).not.toBeDisabled())
  })

  it('scrolls the GitHub token section itself for deep links', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch).mockResolvedValueOnce(mockJsonResponse({ hasToken: false, source: '' }))
    window.history.replaceState({}, '', '/settings#github-token')

    const { container } = renderGitHubTokenSection()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const section = container.querySelector('#github-token-settings') as HTMLElement
    const input = screen.getByLabelText('settings.github.feedbackToken') as HTMLInputElement
    const scrollIntoView = vi.fn()
    const focus = vi.fn()

    Object.defineProperty(section, 'scrollIntoView', { value: scrollIntoView, configurable: true })
    Object.defineProperty(input, 'focus', { value: focus, configurable: true })

    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(focus).toHaveBeenCalled()
  })
})
