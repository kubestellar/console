/**
 * Unit tests for useLocalLogin.
 *
 * This hook was extracted from LocalLoginForm.tsx in PR #21902 and
 * previously had no dedicated test coverage. These tests exercise:
 *
 *   - deriving sessionExpired / manifestSuccess / oauthError from the URL
 *     search params, including the known-vs-unknown OAuth error lookup
 *   - the auto-login side effect for Netlify previews / demo mode / hosted
 *     demo domains
 *   - the OAuth-setup-needed probe (checkOAuthConfiguredWithRetry) when no
 *     auto-login condition applies
 *   - toggleOauthSetupExpanded and handleCopyStep's copy-then-reset flow
 *
 * Addresses #21906 (coverage gap for hooks extracted in #21902).
 */
import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockLogin = vi.fn()
let oauthProbeResult: { backendUp: boolean; oauthConfigured: boolean; inCluster: boolean } = {
  backendUp: false, oauthConfigured: false, inCluster: false,
}

vi.mock('../../../lib/api', () => ({
  checkOAuthConfiguredWithRetry: () => Promise.resolve(oauthProbeResult),
}))

const { emitLogin, copyToClipboard } = vi.hoisted(() => ({
  emitLogin: vi.fn(),
  copyToClipboard: vi.fn().mockResolvedValue(true),
}))
vi.mock('../../../lib/analytics', () => ({ emitLogin }))
vi.mock('../../../lib/clipboard', () => ({ copyToClipboard }))

let mockBranding: { hostedDomain?: string } = {}
vi.mock('../../../hooks/useBranding', () => ({
  useBranding: () => mockBranding,
}))

import { useLocalLogin, OAUTH_ERROR_INFO } from '../useLocalLogin'

function renderUseLocalLogin(path = '/', isLoading = false, isAuthenticated = false) {
  return renderHook(() => useLocalLogin(mockLogin, isLoading, isAuthenticated), {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>,
  })
}

describe('useLocalLogin', () => {
  beforeEach(() => {
    mockLogin.mockClear()
    emitLogin.mockClear()
    copyToClipboard.mockClear().mockResolvedValue(true)
    mockBranding = {}
    oauthProbeResult = { backendUp: false, oauthConfigured: false, inCluster: false }
    vi.stubGlobal('location', { hostname: 'localhost' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('defaults to no session-expired/manifest/oauth-error state on a plain URL', () => {
    const { result } = renderUseLocalLogin('/login')
    expect(result.current.sessionExpired).toBe(false)
    expect(result.current.manifestSuccess).toBe(false)
    expect(result.current.oauthError).toBeNull()
    expect(result.current.errorInfo).toBeNull()
  })

  it('flags sessionExpired and manifestSuccess from their respective query params', () => {
    const { result } = renderUseLocalLogin('/login?reason=session_expired&manifest=success')
    expect(result.current.sessionExpired).toBe(true)
    expect(result.current.manifestSuccess).toBe(true)
  })

  it('maps a known oauth error code to its OAUTH_ERROR_INFO entry', () => {
    const { result } = renderUseLocalLogin('/login?error=invalid_client')
    expect(result.current.oauthError).toBe('invalid_client')
    expect(result.current.errorInfo).toEqual(OAUTH_ERROR_INFO.invalid_client)
  })

  it('falls back to a generic error message for an unrecognized oauth error code', () => {
    const { result } = renderUseLocalLogin('/login?error=totally_unknown_code')
    expect(result.current.errorInfo?.title).toBe('Authentication Error')
    expect(result.current.errorInfo?.message).toContain('totally_unknown_code')
  })

  it('auto-logs in on a Netlify deploy-preview hostname', async () => {
    vi.stubGlobal('location', { hostname: 'deploy-preview-123--kubestellar.netlify.app' })
    renderUseLocalLogin('/login')
    await waitFor(() => expect(mockLogin).toHaveBeenCalled())
    expect(emitLogin).toHaveBeenCalledWith('auto-netlify')
  })

  it('does not auto-login and instead probes OAuth setup on a normal hostname', async () => {
    oauthProbeResult = { backendUp: true, oauthConfigured: false, inCluster: true }
    const { result } = renderUseLocalLogin('/login')
    await waitFor(() => expect(result.current.showOAuthSetup).toBe(true))
    expect(mockLogin).not.toHaveBeenCalled()
    expect(result.current.inClusterNoOAuth).toBe(true)
  })

  it('skips the auto-login effect while isLoading is true', async () => {
    renderUseLocalLogin('/login', true, false)
    await new Promise(r => setTimeout(r, 0))
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('toggleOauthSetupExpanded flips oauthSetupExpanded', () => {
    const { result } = renderUseLocalLogin('/login')
    expect(result.current.oauthSetupExpanded).toBe(false)
    act(() => result.current.toggleOauthSetupExpanded())
    expect(result.current.oauthSetupExpanded).toBe(true)
  })

  it('handleCopyStep sets copiedStep after a successful clipboard copy, then resets it after the timeout', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = renderUseLocalLogin('/login')

    await act(async () => { await result.current.handleCopyStep('some command', 2) })
    expect(result.current.copiedStep).toBe(2)

    act(() => { vi.advanceTimersByTime(2500) })
    expect(result.current.copiedStep).toBeNull()
  })

  it('handleCopyStep is a no-op when the clipboard write fails', async () => {
    copyToClipboard.mockResolvedValueOnce(false)
    const { result } = renderUseLocalLogin('/login')
    await act(async () => { await result.current.handleCopyStep('some command', 1) })
    expect(result.current.copiedStep).toBeNull()
  })
})
