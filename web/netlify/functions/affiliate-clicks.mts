/**
 * Netlify Function: Affiliate Clicks
 *
 * Returns affiliate click counts from GA4, keyed by GitHub login.
 * Queries two campaigns:
 *   - intern_outreach: utm_term is intern-01..10, mapped to GitHub logins via INTERN_MAP
 *   - contributor_affiliate: utm_term IS the GitHub handle directly (no mapping)
 * Used by the docs leaderboard to show a "Social" column.
 *
 * Requires Netlify env vars: GA4_SERVICE_ACCOUNT_JSON (base64), GA4_PROPERTY_ID
 */

import { google } from "googleapis";

/** Map GitHub login → utm_term for intern affiliate links */
const INTERN_MAP: Record<string, string> = {
  "rishi-jat": "intern-01",
  "ghanshyam2005singh": "intern-02",
  "arnavgogia20": "intern-03",
  "mrhapile": "intern-04",
  "aaradhychinche-alt": "intern-05",
  "xonas1101": "intern-06",
  "Arpit529Srivastava": "intern-07",
  "shivansh-source": "intern-08",
  "AAdIprog": "intern-09",
  "Abhishek-Punhani": "intern-10",
};

/** Reverse map: utm_term → GitHub login (lowercased — GitHub logins are case-insensitive) */
const TERM_TO_LOGIN: Record<string, string> = {};
for (const [login, term] of Object.entries(INTERN_MAP)) {
  TERM_TO_LOGIN[term] = login.toLowerCase();
}

/** Cache TTL — 3 minutes. Shorter than before (was 15m) so intern shares
 *  feel responsive on the leaderboard once GA4 has processed the clicks.
 *  GA4 itself has a separate 24-48h attribution-dimension processing lag
 *  that this cache cannot help with; see the leaderboard footnote. */
const CACHE_TTL_MS = 3 * 60 * 1000;
/** Days to look back for affiliate clicks */
const LOOKBACK_DAYS = 90;

/** Minimum / maximum plausible GitHub login length. GitHub enforces 1-39
 *  chars; we require 2+ to avoid spurious single-letter matches that look
 *  like parsing artifacts. */
const GH_LOGIN_MIN_LEN = 2;
const GH_LOGIN_MAX_LEN = 39;
const GH_LOGIN_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){1,38}$/;

/** True when a raw utm_term looks like a plausible GitHub login — i.e. a
 *  mentee shared a link with `utm_campaign=intern_outreach` but used their
 *  GitHub handle as utm_term instead of the legacy `intern-0X` form. We
 *  treat those as contributor_affiliate-style entries rather than dropping
 *  them (GA4 data on 2026-04-19 showed xonas1101 under intern_outreach —
 *  the old code silently skipped that row). */
function isPlausibleGitHubLogin(term: string): boolean {
  if (term.length < GH_LOGIN_MIN_LEN || term.length > GH_LOGIN_MAX_LEN) return false;
  if (/^intern-\d+$/.test(term)) return false;
  return GH_LOGIN_PATTERN.test(term);
}

let cachedResult: { data: Record<string, AffiliateData>; fetchedAt: number } | null = null;

interface AffiliateData {
  clicks: number;
  unique_users: number;
  utm_term: string;
}

const ALLOWED_ORIGINS = [
  "https://console.kubestellar.io",
  "https://kubestellar.io",
  "https://www.kubestellar.io",
];

function corsOrigin(origin: string | null): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  if (
    ALLOWED_ORIGINS.some((o) => origin === o) ||
    origin.endsWith(".kubestellar.io")
  ) {
    return origin;
  }
  return ALLOWED_ORIGINS[0];
}

async function fetchAffiliateClicks(): Promise<Record<string, AffiliateData>> {
  // Netlify env vars use GA4_SERVICE_ACCOUNT_JSON (base64-encoded) + GA4_PROPERTY_ID
  const serviceAccountB64 =
    process.env.GA4_SERVICE_ACCOUNT_JSON;
  const propertyId =
    process.env.GA4_PROPERTY_ID;

  if (!serviceAccountB64 || !propertyId) {
    console.warn("GA4_SERVICE_ACCOUNT_JSON or GA4_PROPERTY_ID not set in Netlify env vars");
    return {};
  }

  // Decode base64 service account JSON
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(
      Buffer.from(serviceAccountB64, "base64").toString("utf-8")
    );
  } catch {
    console.error("GA4_SERVICE_ACCOUNT_JSON is not valid base64-encoded JSON");
    return {};
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });
  const analyticsData = google.analyticsdata({ version: "v1beta", auth });

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - LOOKBACK_DAYS * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  /** Max rows to return per GA4 query */
  const GA4_QUERY_LIMIT = 50;

  // --- Query 1: intern_outreach campaign (intern-01..10 → GitHub login via INTERN_MAP) ---
  const internRes = await analyticsData.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate: fmt(startDate), endDate: fmt(endDate) }],
      dimensions: [{ name: "sessionManualTerm" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      dimensionFilter: {
        filter: {
          fieldName: "sessionCampaignName",
          stringFilter: { matchType: "EXACT", value: "intern_outreach" },
        },
      },
      limit: GA4_QUERY_LIMIT,
    },
  });

  // --- Query 2: contributor_affiliate campaign (utm_term IS the GitHub handle) ---
  const contributorRes = await analyticsData.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate: fmt(startDate), endDate: fmt(endDate) }],
      dimensions: [{ name: "sessionManualTerm" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      dimensionFilter: {
        filter: {
          fieldName: "sessionCampaignName",
          stringFilter: { matchType: "EXACT", value: "contributor_affiliate" },
        },
      },
      limit: GA4_QUERY_LIMIT,
    },
  });

  const result: Record<string, AffiliateData> = {};

  /** Helper to merge a row into the result, summing clicks/unique_users for duplicates.
   *  Keys are always lowercased — GitHub logins are case-insensitive and GA4 utm_term
   *  casing varies by how mentees share their links. */
  function mergeEntry(login: string, utmTerm: string, sessions: number, users: number): void {
    const key = login.toLowerCase();
    if (result[key]) {
      result[key].clicks += sessions;
      result[key].unique_users += users;
    } else {
      result[key] = { clicks: sessions, unique_users: users, utm_term: utmTerm };
    }
  }

  // Process intern_outreach rows. Historically utm_term was `intern-0X` and
  // mapped through INTERN_MAP; the project is migrating to utm_term=<github>.
  // Since interns may still tag shares with `intern_outreach` while using a
  // GitHub-login utm_term (observed 2026-04-19 with xonas1101), fall back to
  // treating that term AS the login when it doesn't match INTERN_MAP and
  // looks like a plausible GitHub handle.
  for (const row of internRes.data.rows || []) {
    const utmTerm = row.dimensionValues?.[0]?.value;
    const sessions = parseInt(row.metricValues?.[0]?.value || "0");
    const users = parseInt(row.metricValues?.[1]?.value || "0");

    if (!utmTerm) continue;

    if (TERM_TO_LOGIN[utmTerm]) {
      // Legacy intern-0X → mapped GitHub login
      mergeEntry(TERM_TO_LOGIN[utmTerm], utmTerm, sessions, users);
    } else if (isPlausibleGitHubLogin(utmTerm)) {
      // New shape under the legacy campaign — credit the GitHub login directly
      mergeEntry(utmTerm, utmTerm, sessions, users);
    }
    // Otherwise drop — utm_term is not a known intern slot and not a
    // plausible GitHub login (e.g. free-form text, spam, typo).
  }

  // Process contributor_affiliate rows (utm_term IS the GitHub login directly).
  // Validate with the GitHub-login pattern so a stray `(not set)` / typo /
  // garbage term doesn't create a phantom leaderboard row.
  for (const row of contributorRes.data.rows || []) {
    const utmTerm = row.dimensionValues?.[0]?.value;
    const sessions = parseInt(row.metricValues?.[0]?.value || "0");
    const users = parseInt(row.metricValues?.[1]?.value || "0");

    if (!utmTerm || !isPlausibleGitHubLogin(utmTerm)) continue;

    mergeEntry(utmTerm, utmTerm, sessions, users);
  }

  // Fill in zeros for interns with no clicks (use lowercase key to match mergeEntry)
  for (const [login, term] of Object.entries(INTERN_MAP)) {
    const key = login.toLowerCase();
    if (!result[key]) {
      result[key] = { clicks: 0, unique_users: 0, utm_term: term };
    }
  }

  return result;
}

export default async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": corsOrigin(origin),
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=900",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...headers, "Access-Control-Allow-Methods": "GET, OPTIONS" },
    });
  }

  try {
    // Check cache
    if (cachedResult && Date.now() - cachedResult.fetchedAt < CACHE_TTL_MS) {
      return new Response(JSON.stringify(cachedResult.data), {
        status: 200,
        headers,
      });
    }

    const data = await fetchAffiliateClicks();
    cachedResult = { data, fetchedAt: Date.now() };

    return new Response(JSON.stringify(data), { status: 200, headers });
  } catch (err) {
    console.error("Failed to fetch affiliate clicks:", err);
    // Return cached data on error if available
    if (cachedResult) {
      return new Response(JSON.stringify(cachedResult.data), {
        status: 200,
        headers,
      });
    }
    return new Response(
      JSON.stringify({ error: "Failed to fetch affiliate data" }),
      { status: 502, headers }
    );
  }
};

export const config = {
  path: "/api/affiliate/clicks",
};
