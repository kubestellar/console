/**
 * Netlify Function: GA4 Analytics Dashboard API
 *
 * Queries the GA4 Data API using a service account to provide
 * real-time analytics data for the KubeStellar Console dashboard.
 *
 * Required Netlify env vars:
 *   GA4_SERVICE_ACCOUNT_JSON — base64-encoded service account key JSON
 *   GA4_PROPERTY_ID          — GA4 property ID (numeric, e.g. "525401563")
 */

import { getStore } from "@netlify/blobs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_STORE = "analytics-dashboard";
const CACHE_KEY = "dashboard-data";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const TOKEN_CACHE_KEY = "access-token";
const GA4_DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWT_EXPIRY_SECONDS = 3600;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id: string;
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

interface GA4Row {
  dimensionValues: { value: string }[];
  metricValues: { value: string }[];
}

interface DashboardData {
  overview: {
    activeUsers: number;
    sessions: number;
    pageViews: number;
    avgEngagementTime: number;
    bounceRate: number;
    eventsPerSession: number;
  };
  overviewPrevious: {
    activeUsers: number;
    sessions: number;
    pageViews: number;
    avgEngagementTime: number;
    bounceRate: number;
    eventsPerSession: number;
  };
  dailyUsers: { date: string; users: number; sessions: number }[];
  topPages: { page: string; views: number; avgTime: number }[];
  topEvents: { event: string; count: number; users: number }[];
  countries: { country: string; users: number; sessions: number }[];
  trafficSources: { source: string; medium: string; sessions: number; users: number }[];
  devices: { category: string; users: number }[];
  funnel: {
    landing: number;
    login: number;
    agentConnected: number;
    solutionViewed: number;
    missionStarted: number;
  };
  cncfOutreach: {
    project: string;
    sessions: number;
    users: number;
    events: number;
  }[];
  engagementByPage: {
    page: string;
    avgEngagement: number;
    bounceRate: number;
    views: number;
  }[];
  newVsReturning: { type: string; users: number; sessions: number }[];
  cachedAt: string;
  propertyId: string;
  dateRange: string;
}

// ---------------------------------------------------------------------------
// JWT / OAuth helpers (no external deps — uses Web Crypto API)
// ---------------------------------------------------------------------------

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function textToBase64url(text: string): string {
  return base64url(new TextEncoder().encode(text));
}

/** Import a PEM private key for RS256 signing */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

/** Create a signed JWT for Google OAuth2 */
async function createSignedJWT(
  serviceAccount: ServiceAccountKey
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + JWT_EXPIRY_SECONDS,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
  };

  const headerB64 = textToBase64url(JSON.stringify(header));
  const payloadB64 = textToBase64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importPrivateKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

/** Get an access token (with caching) */
async function getAccessToken(
  serviceAccount: ServiceAccountKey,
  store: ReturnType<typeof getStore>
): Promise<string> {
  // Check token cache
  try {
    const cached = await store.get(TOKEN_CACHE_KEY, { type: "text" });
    if (cached) {
      const entry: TokenCache = JSON.parse(cached);
      if (Date.now() < entry.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
        return entry.accessToken;
      }
    }
  } catch {
    // Cache miss
  }

  const jwt = await createSignedJWT(serviceAccount);
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${body}`);
  }

  const data = await resp.json();
  const accessToken = data.access_token;
  const expiresIn = data.expires_in || JWT_EXPIRY_SECONDS;

  // Cache token
  const cacheEntry: TokenCache = {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  store.set(TOKEN_CACHE_KEY, JSON.stringify(cacheEntry)).catch(() => {});

  return accessToken;
}

// ---------------------------------------------------------------------------
// GA4 Data API queries
// ---------------------------------------------------------------------------

async function runReport(
  propertyId: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<GA4Row[]> {
  const resp = await fetch(
    `${GA4_DATA_API}/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GA4 API ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  return data.rows || [];
}

function dimVal(row: GA4Row, idx: number): string {
  return (row.dimensionValues || [])[idx]?.value || "(not set)";
}

function metVal(row: GA4Row, idx: number): number {
  return parseFloat((row.metricValues || [])[idx]?.value || "0");
}

/** Fetch all dashboard data in parallel */
async function fetchDashboardData(
  propertyId: string,
  accessToken: string
): Promise<DashboardData> {
  const currentRange = { startDate: "28daysAgo", endDate: "today" };
  const previousRange = { startDate: "56daysAgo", endDate: "29daysAgo" };

  const [
    overviewRows,
    overviewPrevRows,
    dailyRows,
    pageRows,
    eventRows,
    countryRows,
    sourceRows,
    deviceRows,
    funnelRows,
    cncfRows,
    engagementRows,
    newReturnRows,
  ] = await Promise.all([
    // 1. Overview metrics (current period)
    runReport(propertyId, accessToken, {
      dateRanges: [currentRange],
      metrics: [
        { name: "activeUsers" },
        { name: "sessions" },
        { name: "screenPageViews" },
        { name: "averageSessionDuration" },
        { name: "bounceRate" },
        { name: "eventCount" },
      ],
    }),

    // 2. Overview metrics (previous period for comparison)
    runReport(propertyId, accessToken, {
      dateRanges: [previousRange],
      metrics: [
        { name: "activeUsers" },
        { name: "sessions" },
        { name: "screenPageViews" },
        { name: "averageSessionDuration" },
        { name: "bounceRate" },
        { name: "eventCount" },
      ],
    }),

    // 3. Daily users/sessions
    runReport(propertyId, accessToken, {
      dateRanges: [currentRange],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: "date", orderType: "ALPHANUMERIC" } }],
    }),

    // 4. Top pages
    runReport(propertyId, accessToken, {
      dateRanges: [currentRange],
      dimensions: [{ name: "pageTitle" }],
      metrics: [
        { name: "screenPageViews" },
        { name: "averageSessionDuration" },
      ],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 15,
    }),

    // 5. Top events
    runReport(propertyId, accessToken, {
      dateRanges: [currentRange],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 20,
    }),

    // 6. Countries
    runReport(propertyId, accessToken, {
      dateRanges: [currentRange],
      dimensions: [{ name: "country" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: 15,
    }),

    // 7. Traffic sources
    runReport(propertyId, accessToken, {
      dateRanges: [currentRange],
      dimensions: [
        { name: "sessionSource" },
        { name: "sessionMedium" },
      ],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    }),

    // 8. Devices
    runReport(propertyId, accessToken, {
      dateRanges: [currentRange],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
    }),

    // 9. Funnel events (custom KSC events)
    runReport(propertyId, accessToken, {
      dateRanges: [currentRange],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "totalUsers" }],
      dimensionFilter: {
        orGroup: {
          expressions: [
            "ksc_utm_landing",
            "login",
            "ksc_agent_connected",
            "ksc_solution_viewed",
            "ksc_mission_started",
            "page_view",
            "first_visit",
          ].map((ev) => ({
            filter: {
              fieldName: "eventName",
              stringFilter: { matchType: "EXACT", value: ev },
            },
          })),
        },
      },
    }),

    // 10. CNCF outreach (by utm_term = project slug)
    runReport(propertyId, accessToken, {
      dateRanges: [currentRange],
      dimensions: [{ name: "sessionManualTerm" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "eventCount" },
      ],
      dimensionFilter: {
        filter: {
          fieldName: "sessionCampaignName",
          stringFilter: { matchType: "EXACT", value: "cncf_outreach" },
        },
      },
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 30,
    }),

    // 11. Engagement by page
    runReport(propertyId, accessToken, {
      dateRanges: [currentRange],
      dimensions: [{ name: "pageTitle" }],
      metrics: [
        { name: "userEngagementDuration" },
        { name: "bounceRate" },
        { name: "screenPageViews" },
        { name: "activeUsers" },
      ],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 15,
    }),

    // 12. New vs returning users
    runReport(propertyId, accessToken, {
      dateRanges: [currentRange],
      dimensions: [{ name: "newVsReturning" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
    }),
  ]);

  // Parse overview
  const ov = overviewRows[0];
  const ovp = overviewPrevRows[0];
  const overview = ov
    ? {
        activeUsers: metVal(ov, 0),
        sessions: metVal(ov, 1),
        pageViews: metVal(ov, 2),
        avgEngagementTime: metVal(ov, 3),
        bounceRate: metVal(ov, 4),
        eventsPerSession:
          metVal(ov, 1) > 0 ? metVal(ov, 5) / metVal(ov, 1) : 0,
      }
    : {
        activeUsers: 0,
        sessions: 0,
        pageViews: 0,
        avgEngagementTime: 0,
        bounceRate: 0,
        eventsPerSession: 0,
      };

  const overviewPrevious = ovp
    ? {
        activeUsers: metVal(ovp, 0),
        sessions: metVal(ovp, 1),
        pageViews: metVal(ovp, 2),
        avgEngagementTime: metVal(ovp, 3),
        bounceRate: metVal(ovp, 4),
        eventsPerSession:
          metVal(ovp, 1) > 0 ? metVal(ovp, 5) / metVal(ovp, 1) : 0,
      }
    : {
        activeUsers: 0,
        sessions: 0,
        pageViews: 0,
        avgEngagementTime: 0,
        bounceRate: 0,
        eventsPerSession: 0,
      };

  // Parse funnel
  const funnelMap: Record<string, number> = {};
  for (const row of funnelRows) {
    funnelMap[dimVal(row, 0)] = metVal(row, 0);
  }

  return {
    overview,
    overviewPrevious,
    dailyUsers: dailyRows.map((r) => ({
      date: dimVal(r, 0),
      users: metVal(r, 0),
      sessions: metVal(r, 1),
    })),
    topPages: pageRows.map((r) => ({
      page: dimVal(r, 0),
      views: metVal(r, 0),
      avgTime: metVal(r, 1),
    })),
    topEvents: eventRows.map((r) => ({
      event: dimVal(r, 0),
      count: metVal(r, 0),
      users: metVal(r, 1),
    })),
    countries: countryRows.map((r) => ({
      country: dimVal(r, 0),
      users: metVal(r, 0),
      sessions: metVal(r, 1),
    })),
    trafficSources: sourceRows.map((r) => ({
      source: dimVal(r, 0),
      medium: dimVal(r, 1),
      sessions: metVal(r, 0),
      users: metVal(r, 1),
    })),
    devices: deviceRows.map((r) => ({
      category: dimVal(r, 0),
      users: metVal(r, 0),
    })),
    funnel: {
      landing: funnelMap["page_view"] || funnelMap["first_visit"] || 0,
      login: funnelMap["login"] || 0,
      agentConnected: funnelMap["ksc_agent_connected"] || 0,
      solutionViewed: funnelMap["ksc_solution_viewed"] || 0,
      missionStarted: funnelMap["ksc_mission_started"] || 0,
    },
    cncfOutreach: cncfRows
      .filter((r) => dimVal(r, 0) !== "(not set)")
      .map((r) => ({
        project: dimVal(r, 0),
        sessions: metVal(r, 0),
        users: metVal(r, 1),
        events: metVal(r, 2),
      })),
    engagementByPage: engagementRows.map((r) => ({
      page: dimVal(r, 0),
      avgEngagement:
        metVal(r, 3) > 0 ? metVal(r, 0) / metVal(r, 3) : 0,
      bounceRate: metVal(r, 1),
      views: metVal(r, 2),
    })),
    newVsReturning: newReturnRows.map((r) => ({
      type: dimVal(r, 0),
      users: metVal(r, 0),
      sessions: metVal(r, 1),
    })),
    cachedAt: new Date().toISOString(),
    propertyId,
    dateRange: "Last 28 days",
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async (req: Request) => {
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=900", // 15 min browser cache
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Load service account credentials
  const saJsonB64 =
    Netlify.env.get("GA4_SERVICE_ACCOUNT_JSON") ||
    process.env.GA4_SERVICE_ACCOUNT_JSON;
  const propertyId =
    Netlify.env.get("GA4_PROPERTY_ID") || process.env.GA4_PROPERTY_ID;

  if (!saJsonB64 || !propertyId) {
    return new Response(
      JSON.stringify({
        error: "Missing configuration",
        hint: "Set GA4_SERVICE_ACCOUNT_JSON (base64) and GA4_PROPERTY_ID in Netlify env vars",
      }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  let serviceAccount: ServiceAccountKey;
  try {
    serviceAccount = JSON.parse(atob(saJsonB64));
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid GA4_SERVICE_ACCOUNT_JSON — must be base64-encoded JSON" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Check blob cache
  const store = getStore(CACHE_STORE);
  try {
    const cached = await store.get(CACHE_KEY, { type: "text" });
    if (cached) {
      const entry = JSON.parse(cached);
      if (Date.now() < entry.expiresAt) {
        return new Response(JSON.stringify({ ...entry.data, fromCache: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  } catch {
    // Cache miss
  }

  // Fetch fresh data
  try {
    const accessToken = await getAccessToken(serviceAccount, store);
    const data = await fetchDashboardData(propertyId, accessToken);

    // Cache result
    store
      .set(
        CACHE_KEY,
        JSON.stringify({ data, expiresAt: Date.now() + CACHE_TTL_MS })
      )
      .catch(() => {});

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: "Failed to fetch analytics data", message }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};
