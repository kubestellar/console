/**
 * Netlify Function: Affiliate Clicks
 *
 * Returns intern affiliate click counts from GA4, keyed by GitHub login.
 * Used by the docs leaderboard to show a "Social" column for mapped interns.
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

/** Reverse map: utm_term → GitHub login */
const TERM_TO_LOGIN: Record<string, string> = {};
for (const [login, term] of Object.entries(INTERN_MAP)) {
  TERM_TO_LOGIN[term] = login;
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
  const credentials = JSON.parse(
    Buffer.from(serviceAccountB64, "base64").toString("utf-8")
  );
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });
  const analyticsData = google.analyticsdata({ version: "v1beta", auth });

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - LOOKBACK_DAYS * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const res = await analyticsData.properties.runReport({
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
      limit: 50,
    },
  });

  const result: Record<string, AffiliateData> = {};

  for (const row of res.data.rows || []) {
    const utmTerm = row.dimensionValues?.[0]?.value;
    const sessions = parseInt(row.metricValues?.[0]?.value || "0");
    const users = parseInt(row.metricValues?.[1]?.value || "0");

    if (!utmTerm || !TERM_TO_LOGIN[utmTerm]) continue;

    const login = TERM_TO_LOGIN[utmTerm];
    result[login] = {
      clicks: sessions,
      unique_users: users,
      utm_term: utmTerm,
    };
  }

  // Fill in zeros for interns with no clicks
  for (const [login, term] of Object.entries(INTERN_MAP)) {
    if (!result[login]) {
      result[login] = { clicks: 0, unique_users: 0, utm_term: term };
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
