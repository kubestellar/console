import { http, HttpResponse, delay } from 'msw'
import {
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

export function createIdentityOidcHandlers() {
  return [
  http.get('/api/identity/oidc/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_providers: 5, active_providers: 4, total_users: 1247,
      active_sessions: 89, failed_logins_24h: 7, mfa_adoption: 82,
      evaluated_at: new Date().toISOString(),
    })
  }),

  http.get('/api/identity/oidc/providers', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'oidc-1', name: 'Okta Production', issuer_url: 'https://company.okta.com', status: 'connected', protocol: 'OIDC', client_id: 'okta-prod-001', users_synced: 485, last_sync: new Date(Date.now() - DEMO_5_MIN_MS).toISOString(), groups_mapped: 12 },
      { id: 'oidc-2', name: 'Azure AD', issuer_url: 'https://login.microsoftonline.com/tenant-id', status: 'connected', protocol: 'OIDC', client_id: 'azure-ad-001', users_synced: 312, last_sync: new Date(Date.now() - DEMO_10_MIN_MS).toISOString(), groups_mapped: 8 },
      { id: 'oidc-3', name: 'GitHub Enterprise', issuer_url: 'https://github.com/login/oauth', status: 'connected', protocol: 'OAuth2', client_id: 'gh-ent-001', users_synced: 198, last_sync: new Date(Date.now() - DEMO_15_MIN_MS).toISOString(), groups_mapped: 15 },
      { id: 'oidc-4', name: 'Google Workspace', issuer_url: 'https://accounts.google.com', status: 'connected', protocol: 'OIDC', client_id: 'gws-001', users_synced: 252, last_sync: new Date(Date.now() - DEMO_20_MIN_MS).toISOString(), groups_mapped: 6 },
      { id: 'oidc-5', name: 'Keycloak Staging', issuer_url: 'https://keycloak.staging.internal', status: 'degraded', protocol: 'OIDC', client_id: 'kc-staging-001', users_synced: 0, last_sync: new Date(Date.now() - DEMO_1_DAY_MS).toISOString(), groups_mapped: 3 },
    ])
  }),

  http.get('/api/identity/oidc/sessions', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'sess-1', user: 'alice@company.com', provider_id: 'oidc-1', provider_name: 'Okta Production', login_time: new Date(Date.now() - DEMO_1_HOUR_MS).toISOString(), expires_at: new Date(Date.now() + DEMO_2_HOUR_MS).toISOString(), ip_address: '10.0.1.42', active: true },
      { id: 'sess-2', user: 'bob@company.com', provider_id: 'oidc-2', provider_name: 'Azure AD', login_time: new Date(Date.now() - DEMO_2_HOUR_MS).toISOString(), expires_at: new Date(Date.now() + DEMO_1_HOUR_MS).toISOString(), ip_address: '10.0.2.18', active: true },
      { id: 'sess-3', user: 'carol@company.com', provider_id: 'oidc-3', provider_name: 'GitHub Enterprise', login_time: new Date(Date.now() - DEMO_30_MIN_MS).toISOString(), expires_at: new Date(Date.now() + DEMO_90_MIN_MS).toISOString(), ip_address: '10.0.1.55', active: true },
      { id: 'sess-4', user: 'dave@company.com', provider_id: 'oidc-1', provider_name: 'Okta Production', login_time: new Date(Date.now() - DEMO_90_MIN_MS).toISOString(), expires_at: new Date(Date.now() + DEMO_30_MIN_MS).toISOString(), ip_address: '172.16.0.22', active: true },
      { id: 'sess-5', user: 'eve@company.com', provider_id: 'oidc-4', provider_name: 'Google Workspace', login_time: new Date(Date.now() - DEMO_10_MIN_MS).toISOString(), expires_at: new Date(Date.now() + DEMO_3_HOUR_MS).toISOString(), ip_address: '10.0.3.7', active: true },
      { id: 'sess-6', user: 'frank@company.com', provider_id: 'oidc-2', provider_name: 'Azure AD', login_time: new Date(Date.now() - DEMO_4_HOUR_MS).toISOString(), expires_at: new Date(Date.now() - DEMO_30_MIN_MS).toISOString(), ip_address: '10.0.1.91', active: false },
      { id: 'sess-7', user: 'grace@company.com', provider_id: 'oidc-1', provider_name: 'Okta Production', login_time: new Date(Date.now() - DEMO_15_MIN_MS).toISOString(), expires_at: new Date(Date.now() + DEMO_150_MIN_MS).toISOString(), ip_address: '192.168.1.14', active: true },
      { id: 'sess-8', user: 'hank@company.com', provider_id: 'oidc-3', provider_name: 'GitHub Enterprise', login_time: new Date(Date.now() - DEMO_45_MIN_MS).toISOString(), expires_at: new Date(Date.now() + DEMO_75_MIN_MS).toISOString(), ip_address: '10.0.2.33', active: true },
    ])
  }),
  ]
}
