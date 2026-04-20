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

/** Cache TTL — 15 minutes */
const CACHE_TTL_MS = 15 * 60 * 1000;
/** Days to look back for affiliate clicks */
const LOOKBACK_DAYS = 90;

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

  // Process intern_outreach rows (utm_term → GitHub login via INTERN_MAP)
  for (const row of internRes.data.rows || []) {
    const utmTerm = row.dimensionValues?.[0]?.value;
    const sessions = parseInt(row.metricValues?.[0]?.value || "0");
    const users = parseInt(row.metricValues?.[1]?.value || "0");

    if (!utmTerm || !TERM_TO_LOGIN[utmTerm]) continue;

    const login = TERM_TO_LOGIN[utmTerm];
    mergeEntry(login, utmTerm, sessions, users);
  }

  // Process contributor_affiliate rows (utm_term IS the GitHub login directly)
  for (const row of contributorRes.data.rows || []) {
    const utmTerm = row.dimensionValues?.[0]?.value;
    const sessions = parseInt(row.metricValues?.[0]?.value || "0");
    const users = parseInt(row.metricValues?.[1]?.value || "0");

    if (!utmTerm) continue;

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
