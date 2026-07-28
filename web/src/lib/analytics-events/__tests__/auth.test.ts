/**
 * Coverage for analytics-events/auth.ts.
 *
 * Each function is a thin wrapper around send() / emitError() /
 * setAnalyticsUserProperties() — tests verify the event name, payload shape,
 * URL redaction, length clamping, and session-guard behaviour. All external
 * modules (analytics-core, analytics-session, demoMode) are mocked so no
 * network or global side-effects escape the test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../analytics-core', () => ({
  send: vi.fn(),
  emitError: vi.fn(),
  setAnalyticsUserProperties: vi.fn(),
}))

vi.mock('../../analytics-session', () => ({
  getDeploymentType: vi.fn(),
}))

vi.mock('../../demoMode', () => ({
  isDemoMode: vi.fn(),
}))

import { send, emitError, setAnalyticsUserProperties } from '../../analytics-core'
import { getDeploymentType } from '../../analytics-session'
import { isDemoMode } from '../../demoMode'

import {
  emitLogin,
  emitLogout,
  emitSessionExpired,
  emitGitHubConnected,
  emitGitHubTokenConfigured,
  emitGitHubTokenRemoved,
  emitApiProviderConnected,
  emitDemoModeToggled,
  emitAgentTokenFailure,
  emitWsAuthMissing,
  emitSseAuthFailure,
  emitSessionRefreshFailure,
  emitSessionContext,
  emitDeveloperSession,
} from '../auth'

const SESSION_START_KEY = '_ksc_session_start_sent'
const DEV_SESSION_KEY = 'ksc-dev-session-sent'

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  localStorage.clear()
})

// ── Auth events ────────────────────────────────────────────────

describe('emitLogin', () => {
  it('sends the "login" event with the method payload', () => {
    emitLogin('github')
    expect(send).toHaveBeenCalledExactlyOnceWith('login', { method: 'github' })
  })

  it('forwards empty string as-is', () => {
    emitLogin('')
    expect(send).toHaveBeenCalledExactlyOnceWith('login', { method: '' })
  })
})

describe('emitLogout', () => {
  it('sends "ksc_logout" with no payload', () => {
    emitLogout()
    expect(send).toHaveBeenCalledExactlyOnceWith('ksc_logout')
  })
})

describe('emitSessionExpired', () => {
  it('sends "ksc_session_expired" with no payload', () => {
    emitSessionExpired()
    expect(send).toHaveBeenCalledExactlyOnceWith('ksc_session_expired')
  })
})

describe('emitGitHubConnected', () => {
  it('sends "ksc_github_connected" with no payload', () => {
    emitGitHubConnected()
    expect(send).toHaveBeenCalledExactlyOnceWith('ksc_github_connected')
  })
})

describe('emitGitHubTokenConfigured', () => {
  it('sends "ksc_github_token_configured" with no payload', () => {
    emitGitHubTokenConfigured()
    expect(send).toHaveBeenCalledExactlyOnceWith('ksc_github_token_configured')
  })
})

describe('emitGitHubTokenRemoved', () => {
  it('sends "ksc_github_token_removed" with no payload', () => {
    emitGitHubTokenRemoved()
    expect(send).toHaveBeenCalledExactlyOnceWith('ksc_github_token_removed')
  })
})

describe('emitApiProviderConnected', () => {
  it('sends "ksc_api_provider_connected" with the provider name', () => {
    emitApiProviderConnected('openai')
    expect(send).toHaveBeenCalledExactlyOnceWith('ksc_api_provider_connected', {
      provider: 'openai',
    })
  })

  it('preserves the provider string verbatim', () => {
    emitApiProviderConnected('anthropic-claude')
    expect(send).toHaveBeenCalledExactlyOnceWith('ksc_api_provider_connected', {
      provider: 'anthropic-claude',
    })
  })
})

describe('emitDemoModeToggled', () => {
  it('sends "ksc_demo_mode_toggled" and updates the user property when enabled', () => {
    emitDemoModeToggled(true)
    expect(send).toHaveBeenCalledExactlyOnceWith('ksc_demo_mode_toggled', { enabled: 'true' })
    expect(setAnalyticsUserProperties).toHaveBeenCalledExactlyOnceWith({ demo_mode: 'true' })
  })

  it('serialises the flag to the "false" string when disabled', () => {
    emitDemoModeToggled(false)
    expect(send).toHaveBeenCalledExactlyOnceWith('ksc_demo_mode_toggled', { enabled: 'false' })
    expect(setAnalyticsUserProperties).toHaveBeenCalledExactlyOnceWith({ demo_mode: 'false' })
  })
})

// ── Failure events ─────────────────────────────────────────────

describe('emitAgentTokenFailure', () => {
  it('emits an "agent_token_failure" error with the reason preserved', () => {
    emitAgentTokenFailure('missing token')
    expect(emitError).toHaveBeenCalledExactlyOnceWith('agent_token_failure', 'missing token')
  })

  it('clamps the reason to 100 characters', () => {
    const long = 'x'.repeat(250)
    emitAgentTokenFailure(long)
    const [, reason] = (emitError as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(reason).toHaveLength(100)
    expect(reason).toBe('x'.repeat(100))
  })

  it('leaves reasons shorter than 100 chars untouched', () => {
    emitAgentTokenFailure('short')
    expect(emitError).toHaveBeenCalledExactlyOnceWith('agent_token_failure', 'short')
  })
})

describe('emitWsAuthMissing', () => {
  it('strips the ws:// scheme + host and keeps the path', () => {
    emitWsAuthMissing('ws://localhost:8585/ws?token=abc')
    expect(emitError).toHaveBeenCalledExactlyOnceWith('ws_auth_missing', '/ws?token=abc')
  })

  it('strips the wss:// scheme + host', () => {
    emitWsAuthMissing('wss://console.example.com/agent/socket')
    expect(emitError).toHaveBeenCalledExactlyOnceWith('ws_auth_missing', '/agent/socket')
  })

  it('leaves inputs without a ws scheme unchanged (only clamped)', () => {
    emitWsAuthMissing('/relative/path')
    expect(emitError).toHaveBeenCalledExactlyOnceWith('ws_auth_missing', '/relative/path')
  })

  it('clamps the redacted URL to 100 characters', () => {
    const url = 'wss://host.example.com' + '/x'.repeat(200)
    emitWsAuthMissing(url)
    const [, redacted] = (emitError as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(redacted).toHaveLength(100)
    expect(redacted.startsWith('/x')).toBe(true)
    expect(redacted).not.toContain('host.example.com')
  })
})

describe('emitSseAuthFailure', () => {
  it('strips the http:// scheme + host and keeps the path', () => {
    emitSseAuthFailure('http://localhost:8080/api/stream?x=1')
    expect(emitError).toHaveBeenCalledExactlyOnceWith('sse_auth_failure', '/api/stream?x=1')
  })

  it('strips the https:// scheme + host', () => {
    emitSseAuthFailure('https://console.kubestellar.io/api/events')
    expect(emitError).toHaveBeenCalledExactlyOnceWith('sse_auth_failure', '/api/events')
  })

  it('does not strip ws:// URLs (only http/https are matched)', () => {
    emitSseAuthFailure('ws://host/path')
    expect(emitError).toHaveBeenCalledExactlyOnceWith('sse_auth_failure', 'ws://host/path')
  })

  it('clamps the redacted URL to 100 characters', () => {
    const url = 'https://host.example.com' + '/y'.repeat(200)
    emitSseAuthFailure(url)
    const [, redacted] = (emitError as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(redacted).toHaveLength(100)
    expect(redacted).not.toContain('host.example.com')
  })
})

describe('emitSessionRefreshFailure', () => {
  it('emits a "session_refresh_failure" error with the reason', () => {
    emitSessionRefreshFailure('token revoked')
    expect(emitError).toHaveBeenCalledExactlyOnceWith('session_refresh_failure', 'token revoked')
  })

  it('clamps the reason to 100 characters', () => {
    emitSessionRefreshFailure('z'.repeat(150))
    const [, reason] = (emitError as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(reason).toHaveLength(100)
  })
})

// ── Session context ────────────────────────────────────────────

describe('emitSessionContext', () => {
  it('sets user properties and sends "ksc_session_start" on first call', () => {
    emitSessionContext('helm', 'stable')
    expect(setAnalyticsUserProperties).toHaveBeenCalledExactlyOnceWith({
      install_method: 'helm',
      update_channel: 'stable',
    })
    expect(send).toHaveBeenCalledExactlyOnceWith('ksc_session_start', {
      install_method: 'helm',
      update_channel: 'stable',
    })
    expect(sessionStorage.getItem(SESSION_START_KEY)).toBe('1')
  })

  it('still refreshes user properties but does not resend on subsequent calls', () => {
    sessionStorage.setItem(SESSION_START_KEY, '1')
    emitSessionContext('brew', 'nightly')
    expect(setAnalyticsUserProperties).toHaveBeenCalledExactlyOnceWith({
      install_method: 'brew',
      update_channel: 'nightly',
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('sends only once across two consecutive calls in the same session', () => {
    emitSessionContext('binary', 'stable')
    emitSessionContext('binary', 'stable')
    expect(send).toHaveBeenCalledTimes(1)
    expect(setAnalyticsUserProperties).toHaveBeenCalledTimes(2)
  })
})

describe('emitDeveloperSession', () => {
  it('sends "ksc_developer_session" for a localhost, non-demo deployment', () => {
    vi.mocked(getDeploymentType).mockReturnValue('localhost')
    vi.mocked(isDemoMode).mockReturnValue(false)

    emitDeveloperSession()

    expect(send).toHaveBeenCalledExactlyOnceWith('ksc_developer_session', {
      deployment_type: 'localhost',
    })
    expect(localStorage.getItem(DEV_SESSION_KEY)).toBe('1')
  })

  it('is idempotent when the guard key is already set', () => {
    localStorage.setItem(DEV_SESSION_KEY, '1')
    vi.mocked(getDeploymentType).mockReturnValue('localhost')
    vi.mocked(isDemoMode).mockReturnValue(false)

    emitDeveloperSession()

    expect(send).not.toHaveBeenCalled()
    expect(getDeploymentType).not.toHaveBeenCalled()
  })

  it('does not send for non-localhost deployments', () => {
    vi.mocked(getDeploymentType).mockReturnValue('kubernetes')
    vi.mocked(isDemoMode).mockReturnValue(false)

    emitDeveloperSession()

    expect(send).not.toHaveBeenCalled()
    expect(localStorage.getItem(DEV_SESSION_KEY)).toBeNull()
  })

  it('does not send for netlify deployments', () => {
    vi.mocked(getDeploymentType).mockReturnValue('netlify')
    vi.mocked(isDemoMode).mockReturnValue(false)

    emitDeveloperSession()

    expect(send).not.toHaveBeenCalled()
  })

  it('does not send in demo mode without a ksc-token', () => {
    vi.mocked(getDeploymentType).mockReturnValue('localhost')
    vi.mocked(isDemoMode).mockReturnValue(true)

    emitDeveloperSession()

    expect(send).not.toHaveBeenCalled()
    expect(localStorage.getItem(DEV_SESSION_KEY)).toBeNull()
  })

  it('sends in demo mode when a ksc-token is present (authenticated demo)', () => {
    vi.mocked(getDeploymentType).mockReturnValue('localhost')
    vi.mocked(isDemoMode).mockReturnValue(true)
    localStorage.setItem('ksc-token', 'test-token')

    emitDeveloperSession()

    expect(send).toHaveBeenCalledExactlyOnceWith('ksc_developer_session', {
      deployment_type: 'localhost',
    })
    expect(localStorage.getItem(DEV_SESSION_KEY)).toBe('1')
  })

  it('only sends once even after repeated invocations', () => {
    vi.mocked(getDeploymentType).mockReturnValue('localhost')
    vi.mocked(isDemoMode).mockReturnValue(false)

    emitDeveloperSession()
    emitDeveloperSession()
    emitDeveloperSession()

    expect(send).toHaveBeenCalledTimes(1)
  })
})
