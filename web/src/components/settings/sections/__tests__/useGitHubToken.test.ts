/**
 * Unit tests for useGitHubToken.
 *
 * This hook was extracted from GitHubTokenSection.tsx in PR #21902.
 * GitHubTokenSection.test.tsx already covers it indirectly via
 * component rendering; this file adds focused renderHook coverage of the
 * hook's own contract:
 *
 *   - the on-mount token-status load + rate-limit validation
 *   - handleSaveToken's success path (save, validate, persist, notify) and
 *     its save-error path
 *   - handleClearToken clearing local + backend state
 *
 * Addresses #21906 (coverage gap for hooks extracted in #21902).
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const showToast = vi.fn()
vi.mock('../../../ui/Toast', () => ({
  useToast: () => ({ showToast }),
}))

vi.mock('../../../lib/authToken', () => ({
  getStoredAuthToken: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../../lib/analytics', () => ({
  emitGitHubTokenConfigured: vi.fn(),
  emitGitHubTokenRemoved: vi.fn(),
  emitConversionStep: vi.fn(),
}))

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: vi.fn().mockResolvedValue(body) } as unknown as Response
}

import { useGitHubToken } from '../useGitHubToken'

describe('useGitHubToken', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ hasToken: false, source: '' })))
    localStorage.clear()
    showToast.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('starts initializing, then settles with no token when the backend reports none configured', async () => {
    const { result } = renderHook(() => useGitHubToken(vi.fn()))
    expect(result.current.isInitializing).toBe(true)

    await waitFor(() => expect(result.current.isInitializing).toBe(false))
    expect(result.current.hasToken).toBe(false)
  })

  it('loads an existing token on mount and validates it via the rate-limit proxy', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ hasToken: true, source: 'settings' }))
      .mockResolvedValueOnce(jsonResponse({ rate: { limit: 5000, remaining: 4999, reset: 1700000000 } }))

    const { result } = renderHook(() => useGitHubToken(vi.fn()))
    await waitFor(() => expect(result.current.isInitializing).toBe(false))

    expect(result.current.hasToken).toBe(true)
    expect(result.current.tokenSource).toBe('settings')
    expect(result.current.rateLimit?.remaining).toBe(4999)
  })

  it('handleSaveToken saves, validates, and clears the input on success', async () => {
    const forceVersionCheck = vi.fn()
    const { result } = renderHook(() => useGitHubToken(forceVersionCheck))
    await waitFor(() => expect(result.current.isInitializing).toBe(false))

    act(() => { result.current.setTokenInput('ghp_faketoken123') })

    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ rate: { limit: 5000, remaining: 4998, reset: 1700000000 } }))

    await act(async () => { await result.current.handleSaveToken() })

    expect(result.current.hasToken).toBe(true)
    expect(result.current.tokenInput).toBe('')
    expect(result.current.tokenSaved).toBe(true)
    expect(forceVersionCheck).toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('settings.github.saveSuccessToast', 'success')
  })

  it('handleSaveToken surfaces a 401 error without marking the token as saved', async () => {
    const { result } = renderHook(() => useGitHubToken(vi.fn()))
    await waitFor(() => expect(result.current.isInitializing).toBe(false))

    act(() => { result.current.setTokenInput('bad-token') })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'Bad credentials' }, false, 401))

    await act(async () => { await result.current.handleSaveToken() })

    expect(result.current.hasToken).toBe(false)
    expect(result.current.tokenError).toBe('Bad credentials')
  })

  it('handleSaveToken is a no-op when the input is blank', async () => {
    const { result } = renderHook(() => useGitHubToken(vi.fn()))
    await waitFor(() => expect(result.current.isInitializing).toBe(false))

    const fetchCallsBefore = vi.mocked(fetch).mock.calls.length
    await act(async () => { await result.current.handleSaveToken() })
    expect(vi.mocked(fetch).mock.calls.length).toBe(fetchCallsBefore)
  })

  it('handleClearToken clears local token state and calls the backend DELETE', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ hasToken: true, source: 'settings' }))
      .mockResolvedValueOnce(jsonResponse({ rate: { limit: 5000, remaining: 4999, reset: 1700000000 } }))

    const { result } = renderHook(() => useGitHubToken(vi.fn()))
    await waitFor(() => expect(result.current.hasToken).toBe(true))

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}))
    await act(async () => { await result.current.handleClearToken() })

    expect(result.current.hasToken).toBe(false)
    expect(result.current.tokenSource).toBeNull()
    expect(result.current.rateLimit).toBeNull()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/github/token', expect.objectContaining({ method: 'DELETE' }))
  })
})
