/**
 * Netlify Function: Identity Sessions Active
 *
 * Returns demo active session list for the enterprise Session dashboard.
 */

/** Offset constants for demo timestamps (milliseconds) */
const THIRTY_SECONDS_MS = 30_000;
const FORTY_FIVE_SECONDS_MS = 45_000;
const ONE_MINUTE_MS = 60_000;
const TWO_MINUTES_MS = 120_000;
const TEN_MINUTES_MS = 600_000;
const FIFTEEN_MINUTES_MS = 900_000;
const THIRTY_MINUTES_MS = 1_800_000;
const FORTY_FIVE_MINUTES_MS = 2_700_000;
const FIFTY_MINUTES_MS = 3_000_000;
const ONE_HOUR_MS = 3_600_000;
const NINETY_MINUTES_MS = 5_400_000;
const TWO_HOURS_MS = 7_200_000;
const TWO_AND_HALF_HOURS_MS = 9_000_000;
const THREE_HOURS_MS = 10_800_000;
const FOUR_HOURS_MS = 14_400_000;
const SEVENTY_FIVE_MINUTES_MS = 4_500_000;

export default async () => {
  const now = Date.now();
  return new Response(
    JSON.stringify([
      { id: "as-1", user: "alice@company.com", login_time: new Date(now - ONE_HOUR_MS).toISOString(), last_activity: new Date(now - TWO_MINUTES_MS).toISOString(), ip_address: "10.0.1.42", user_agent: "Chrome/125 (macOS)", provider: "Okta", status: "active", expires_at: new Date(now + TWO_HOURS_MS).toISOString() },
      { id: "as-2", user: "bob@company.com", login_time: new Date(now - TWO_HOURS_MS).toISOString(), last_activity: new Date(now - THIRTY_MINUTES_MS).toISOString(), ip_address: "10.0.2.18", user_agent: "Firefox/128 (Linux)", provider: "Azure AD", status: "idle", expires_at: new Date(now + ONE_HOUR_MS).toISOString() },
      { id: "as-3", user: "carol@company.com", login_time: new Date(now - THIRTY_MINUTES_MS).toISOString(), last_activity: new Date(now - ONE_MINUTE_MS).toISOString(), ip_address: "10.0.1.55", user_agent: "Safari/18 (macOS)", provider: "GitHub", status: "active", expires_at: new Date(now + NINETY_MINUTES_MS).toISOString() },
      { id: "as-4", user: "dave@company.com", login_time: new Date(now - NINETY_MINUTES_MS).toISOString(), last_activity: new Date(now - FIFTY_MINUTES_MS).toISOString(), ip_address: "172.16.0.22", user_agent: "kubectl/v1.30 (linux/amd64)", provider: "Okta", status: "idle", expires_at: new Date(now + THIRTY_MINUTES_MS).toISOString() },
      { id: "as-5", user: "eve@company.com", login_time: new Date(now - TEN_MINUTES_MS).toISOString(), last_activity: new Date(now - THIRTY_SECONDS_MS).toISOString(), ip_address: "10.0.3.7", user_agent: "Chrome/125 (Windows)", provider: "Google", status: "active", expires_at: new Date(now + THREE_HOURS_MS).toISOString() },
      { id: "as-6", user: "frank@company.com", login_time: new Date(now - FOUR_HOURS_MS).toISOString(), last_activity: new Date(now - TWO_HOURS_MS).toISOString(), ip_address: "10.0.1.91", user_agent: "Edge/125 (Windows)", provider: "Azure AD", status: "expired", expires_at: new Date(now - THIRTY_MINUTES_MS).toISOString() },
      { id: "as-7", user: "grace@company.com", login_time: new Date(now - FIFTEEN_MINUTES_MS).toISOString(), last_activity: new Date(now - FORTY_FIVE_SECONDS_MS).toISOString(), ip_address: "192.168.1.14", user_agent: "Chrome/125 (macOS)", provider: "Okta", status: "active", expires_at: new Date(now + TWO_AND_HALF_HOURS_MS).toISOString() },
      { id: "as-8", user: "hank@company.com", login_time: new Date(now - FORTY_FIVE_MINUTES_MS).toISOString(), last_activity: new Date(now - TEN_MINUTES_MS).toISOString(), ip_address: "10.0.2.33", user_agent: "kubectl/v1.31 (darwin/arm64)", provider: "GitHub", status: "active", expires_at: new Date(now + SEVENTY_FIVE_MINUTES_MS).toISOString() },
    ]),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
