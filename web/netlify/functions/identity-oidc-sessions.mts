/**
 * Netlify Function: Identity OIDC Sessions
 *
 * Returns demo OIDC session list for the enterprise OIDC dashboard.
 */

/** Offset constants for demo timestamps (milliseconds) */
const TEN_MINUTES_MS = 600_000;
const THIRTY_MINUTES_MS = 1_800_000;
const FORTY_FIVE_MINUTES_MS = 2_700_000;
const ONE_HOUR_MS = 3_600_000;
const NINETY_MINUTES_MS = 5_400_000;
const TWO_HOURS_MS = 7_200_000;
const TWO_AND_HALF_HOURS_MS = 9_000_000;
const THREE_HOURS_MS = 10_800_000;
const FOUR_HOURS_MS = 14_400_000;
const FIFTEEN_MINUTES_MS = 900_000;
const SEVENTY_FIVE_MINUTES_MS = 4_500_000;

export default async () => {
  const now = Date.now();
  return new Response(
    JSON.stringify([
      { id: "sess-1", user: "alice@company.com", provider_id: "oidc-1", provider_name: "Okta Production", login_time: new Date(now - ONE_HOUR_MS).toISOString(), expires_at: new Date(now + TWO_HOURS_MS).toISOString(), ip_address: "10.0.1.42", active: true },
      { id: "sess-2", user: "bob@company.com", provider_id: "oidc-2", provider_name: "Azure AD", login_time: new Date(now - TWO_HOURS_MS).toISOString(), expires_at: new Date(now + ONE_HOUR_MS).toISOString(), ip_address: "10.0.2.18", active: true },
      { id: "sess-3", user: "carol@company.com", provider_id: "oidc-3", provider_name: "GitHub Enterprise", login_time: new Date(now - THIRTY_MINUTES_MS).toISOString(), expires_at: new Date(now + NINETY_MINUTES_MS).toISOString(), ip_address: "10.0.1.55", active: true },
      { id: "sess-4", user: "dave@company.com", provider_id: "oidc-1", provider_name: "Okta Production", login_time: new Date(now - NINETY_MINUTES_MS).toISOString(), expires_at: new Date(now + THIRTY_MINUTES_MS).toISOString(), ip_address: "172.16.0.22", active: true },
      { id: "sess-5", user: "eve@company.com", provider_id: "oidc-4", provider_name: "Google Workspace", login_time: new Date(now - TEN_MINUTES_MS).toISOString(), expires_at: new Date(now + THREE_HOURS_MS).toISOString(), ip_address: "10.0.3.7", active: true },
      { id: "sess-6", user: "frank@company.com", provider_id: "oidc-2", provider_name: "Azure AD", login_time: new Date(now - FOUR_HOURS_MS).toISOString(), expires_at: new Date(now - THIRTY_MINUTES_MS).toISOString(), ip_address: "10.0.1.91", active: false },
      { id: "sess-7", user: "grace@company.com", provider_id: "oidc-1", provider_name: "Okta Production", login_time: new Date(now - FIFTEEN_MINUTES_MS).toISOString(), expires_at: new Date(now + TWO_AND_HALF_HOURS_MS).toISOString(), ip_address: "192.168.1.14", active: true },
      { id: "sess-8", user: "hank@company.com", provider_id: "oidc-3", provider_name: "GitHub Enterprise", login_time: new Date(now - FORTY_FIVE_MINUTES_MS).toISOString(), expires_at: new Date(now + SEVENTY_FIVE_MINUTES_MS).toISOString(), ip_address: "10.0.2.33", active: true },
    ]),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
