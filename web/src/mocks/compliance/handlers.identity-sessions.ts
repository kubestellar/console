import { http, HttpResponse, delay } from 'msw'
import {
  pruneRegistry,
  savedCards,
  DEMO_30_SEC_MS,
  DEMO_45_SEC_MS,
  DEMO_1_MIN_MS,
  DEMO_90_SEC_MS,
  DEMO_2_MIN_MS,
  DEMO_150_SEC_MS,
  DEMO_3_MIN_MS,
  DEMO_4_MIN_MS,
  DEMO_5_MIN_MS,
  DEMO_6_MIN_MS,
  DEMO_7_MIN_MS,
  DEMO_8_MIN_MS,
  DEMO_10_MIN_MS,
  DEMO_15_MIN_MS,
  DEMO_20_MIN_MS,
  DEMO_30_MIN_MS,
  DEMO_45_MIN_MS,
  DEMO_50_MIN_MS,
  DEMO_1_HOUR_MS,
  DEMO_75_MIN_MS,
  DEMO_90_MIN_MS,
  DEMO_2_HOUR_MS,
  DEMO_150_MIN_MS,
  DEMO_3_HOUR_MS,
  DEMO_4_HOUR_MS,
  DEMO_8_HOUR_MS,
  DEMO_12_HOUR_MS,
  DEMO_1_DAY_MS,
  DEMO_2_DAY_MS,
  DEMO_3_DAY_MS,
  DEMO_1_WEEK_MS,
  DEMO_30_DAY_MS,
} from './handlers.fixtures'



export function createIdentitySessionsHandlers() {
  return [
  http.get('/api/identity/sessions/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      active_sessions: 42, unique_users: 31, avg_duration_minutes: 47,
      sessions_terminated_24h: 15, policy_violations: 3,
      mfa_sessions_pct: 88, evaluated_at: new Date().toISOString(),
    })
  }),

  http.get('/api/identity/sessions/active', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'as-1', user: 'alice@company.com', login_time: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString(), last_activity: new Date(Date.now() - DEMO_2_MIN_MS).toISOString(), ip_address: '10.0.1.42', user_agent: 'Chrome/125 (macOS)', provider: 'Okta', status: 'active', expires_at: new Date(Date.now() + DEMO_2_HOUR_MS).toISOString() },
      { id: 'as-2', user: 'bob@company.com', login_time: new Date(Date.now() - DEMO_2_HOUR_MS).toISOString(), last_activity: new Date(Date.now() - DEMO_30_MIN_MS).toISOString(), ip_address: '10.0.2.18', user_agent: 'Firefox/128 (Linux)', provider: 'Azure AD', status: 'idle', expires_at: new Date(Date.now() + DEMO_1_HOUR_MS).toISOString() },
      { id: 'as-3', user: 'carol@company.com', login_time: new Date(Date.now() - DEMO_30_MIN_MS).toISOString(), last_activity: new Date(Date.now() - DEMO_1_MIN_MS).toISOString(), ip_address: '10.0.1.55', user_agent: 'Safari/18 (macOS)', provider: 'GitHub', status: 'active', expires_at: new Date(Date.now() + DEMO_90_MIN_MS).toISOString() },
      { id: 'as-4', user: 'dave@company.com', login_time: new Date(Date.now() - DEMO_90_MIN_MS).toISOString(), last_activity: new Date(Date.now() - DEMO_50_MIN_MS).toISOString(), ip_address: '172.16.0.22', user_agent: 'kubectl/v1.30 (linux/amd64)', provider: 'Okta', status: 'idle', expires_at: new Date(Date.now() + DEMO_30_MIN_MS).toISOString() },
      { id: 'as-5', user: 'eve@company.com', login_time: new Date(Date.now() - DEMO_10_MIN_MS).toISOString(), last_activity: new Date(Date.now() - DEMO_30_SEC_MS).toISOString(), ip_address: '10.0.3.7', user_agent: 'Chrome/125 (Windows)', provider: 'Google', status: 'active', expires_at: new Date(Date.now() + DEMO_3_HOUR_MS).toISOString() },
      { id: 'as-6', user: 'frank@company.com', login_time: new Date(Date.now() - DEMO_4_HOUR_MS).toISOString(), last_activity: new Date(Date.now() - DEMO_2_HOUR_MS).toISOString(), ip_address: '10.0.1.91', user_agent: 'Edge/125 (Windows)', provider: 'Azure AD', status: 'expired', expires_at: new Date(Date.now() - DEMO_30_MIN_MS).toISOString() },
      { id: 'as-7', user: 'grace@company.com', login_time: new Date(Date.now() - DEMO_15_MIN_MS).toISOString(), last_activity: new Date(Date.now() - DEMO_45_SEC_MS).toISOString(), ip_address: '192.168.1.14', user_agent: 'Chrome/125 (macOS)', provider: 'Okta', status: 'active', expires_at: new Date(Date.now() + DEMO_150_MIN_MS).toISOString() },
      { id: 'as-8', user: 'hank@company.com', login_time: new Date(Date.now() - DEMO_45_MIN_MS).toISOString(), last_activity: new Date(Date.now() - DEMO_10_MIN_MS).toISOString(), ip_address: '10.0.2.33', user_agent: 'kubectl/v1.31 (darwin/arm64)', provider: 'GitHub', status: 'active', expires_at: new Date(Date.now() + DEMO_75_MIN_MS).toISOString() },
    ])
  }),

  http.get('/api/identity/sessions/policies', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'pol-1', name: 'Default Session Policy', description: 'Standard session timeouts for all users', idle_timeout_minutes: 30, absolute_timeout_hours: 8, max_concurrent: 3, enforce_mfa: true, scope: 'global' },
      { id: 'pol-2', name: 'Admin Session Policy', description: 'Stricter timeouts for cluster administrators', idle_timeout_minutes: 15, absolute_timeout_hours: 4, max_concurrent: 1, enforce_mfa: true, scope: 'admin' },
      { id: 'pol-3', name: 'Service Account Policy', description: 'Long-lived sessions for automation and CI/CD', idle_timeout_minutes: 120, absolute_timeout_hours: 24, max_concurrent: 10, enforce_mfa: false, scope: 'service-accounts' },
    ])
  }),

  // ── SIEM mock handlers ──────────────────────────────────────────────
  ]
}
