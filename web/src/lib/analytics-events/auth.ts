import { emitError, send, setAnalyticsUserProperties } from '../analytics-core'
import { getDeploymentType } from '../analytics-session'
import { isDemoMode } from '../demoMode'

// ── Auth ───────────────────────────────────────────────────────

export function emitLogin(method: string) {
  send('login', { method })
}

export function emitLogout() {
  send('ksc_logout')
}

export function emitSessionExpired() {
  send('ksc_session_expired')
}

export function emitGitHubConnected() {
  send('ksc_github_connected')
}

export function emitGitHubTokenConfigured() {
  send('ksc_github_token_configured')
}

export function emitGitHubTokenRemoved() {
  send('ksc_github_token_removed')
}

export function emitApiProviderConnected(provider: string) {
  send('ksc_api_provider_connected', { provider })
}

export function emitDemoModeToggled(enabled: boolean) {
  send('ksc_demo_mode_toggled', { enabled: String(enabled) })
  setAnalyticsUserProperties({ demo_mode: String(enabled) })
}

// ── Auth / Connection Failure Detection ─────────────────────────────

export function emitAgentTokenFailure(reason: string) {
  emitError('agent_token_failure', reason.slice(0, 100))
}

export function emitWsAuthMissing(url: string) {
  emitError('ws_auth_missing', url.replace(/^wss?:\/\/[^/]+/, '').slice(0, 100))
}

export function emitSseAuthFailure(url: string) {
  emitError('sse_auth_failure', url.replace(/^https?:\/\/[^/]+/, '').slice(0, 100))
}

export function emitSessionRefreshFailure(reason: string) {
  emitError('session_refresh_failure', reason.slice(0, 100))
}

// ── Session Context ─────────────────────────────────────────────────

const SESSION_START_KEY = '_ksc_session_start_sent'
const DEV_SESSION_KEY = 'ksc-dev-session-sent'

export function emitSessionContext(installMethod: string, updateChannel: string) {
  setAnalyticsUserProperties({
    install_method: installMethod,
    update_channel: updateChannel,
  })

  if (sessionStorage.getItem(SESSION_START_KEY)) return
  sessionStorage.setItem(SESSION_START_KEY, '1')

  send('ksc_session_start', {
    install_method: installMethod,
    update_channel: updateChannel,
  })
}

export function emitDeveloperSession() {
  if (localStorage.getItem(DEV_SESSION_KEY)) return
  const dep = getDeploymentType()
  if (dep !== 'localhost') return
  if (isDemoMode() && !localStorage.getItem('ksc-token')) return
  localStorage.setItem(DEV_SESSION_KEY, '1')
  send('ksc_developer_session', { deployment_type: dep })
}
