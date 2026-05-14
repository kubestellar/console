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
import { buildCorsHeaders, handlePreflight } from "./_shared/cors";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_STORE = "analytics-dashboard";
const CACHE_KEY_PREFIX = "dashboard-data"; // suffixed with filter mode
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
    commandCopied: number;
    agentConnected: number;
    fixerViewed: number;
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
  missions: { started: number; completed: number; errored: number; rated: number; topTypes: { type: string; count: number }[] };
  cardPopularity: { card: string; added: number; expanded: number; clicked: number }[];
  featureAdoption: { feature: string; count: number; users: number }[];
  weeklyRetention: { week: string; newUsers: number; returning: number }[];
  errors: { event: string; count: number; detail: string; daily: number[] }[];
  dailyFunnel: { date: string; agentConnected: number }[];
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
    signal: AbortSignal.timeout(10_000),
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
  store.set(TOKEN_CACHE_KEY, JSON.stringify(cacheEntry)).catch((err) => { console.warn("[analytics-dashboard] blob cache write failed:", err instanceof Error ? err.message : err) });

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
      signal: AbortSignal.timeout(10_000),
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

type FilterMode = "production" | "all";

/** Exclusion filter: NOT (deployment_type = "localhost") */
const LOCALHOST_EXCLUSION = {
  notExpression: {
    filter: {
      fieldName: "customUser:deployment_type",
      stringFilter: { matchType: "EXACT" as const, value: "localhost" },
    },
  },
};

/**
 * Wrap a GA4 query body with localhost exclusion when in production filter mode.
 * Merges with any existing dimensionFilter using andGroup.
 */
function withFilter(
  body: Record<string, unknown>,
  mode: FilterMode
): Record<string, unknown> {
  if (mode === "all") return body;
  const existing = body.dimensionFilter as Record<string, unknown> | undefined;
  if (!existing) {
    return { ...body, dimensionFilter: LOCALHOST_EXCLUSION };
  }
  return {
    ...body,
    dimensionFilter: {
      andGroup: { expressions: [existing, LOCALHOST_EXCLUSION] },
    },
  };
}

/** Fetch all dashboard data in parallel */
async function fetchDashboardData(
  propertyId: string,
  accessToken: string,
  filterMode: FilterMode = "production"
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
    missionEventRows,
    missionTypeRows,
    cardPopRows,
    featureRows,
    weeklyRetRows,
    errorRows,
    errorDailyRows,
    dailyFunnelRows,
  ] = await Promise.all([
    // 1. Overview metrics (current period)
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [currentRange],
      metrics: [
        { name: "activeUsers" },
        { name: "sessions" },
        { name: "screenPageViews" },
        { name: "averageSessionDuration" },
        { name: "bounceRate" },
        { name: "eventCount" },
      ],
    }, filterMode)),

    // 2. Overview metrics (previous period for comparison)
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [previousRange],
      metrics: [
        { name: "activeUsers" },
        { name: "sessions" },
        { name: "screenPageViews" },
        { name: "averageSessionDuration" },
        { name: "bounceRate" },
        { name: "eventCount" },
      ],
    }, filterMode)),

    // 3. Daily users/sessions
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [currentRange],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: "date", orderType: "ALPHANUMERIC" } }],
    }, filterMode)),

    // 4. Top pages
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [currentRange],
      dimensions: [{ name: "pageTitle" }],
      metrics: [
        { name: "screenPageViews" },
        { name: "averageSessionDuration" },
      ],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 15,
    }, filterMode)),

    // 5. Top events
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [currentRange],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 20,
    }, filterMode)),

    // 6. Countries
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [currentRange],
      dimensions: [{ name: "country" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: 15,
    }, filterMode)),

    // 7. Traffic sources
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [currentRange],
      dimensions: [
        { name: "sessionSource" },
        { name: "sessionMedium" },
      ],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    }, filterMode)),

    // 8. Devices
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [currentRange],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
    }, filterMode)),

    // 9. Funnel events (custom KSC events)
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [currentRange],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "totalUsers" }],
      dimensionFilter: {
        orGroup: {
          expressions: [
            "ksc_utm_landing",
            "login",
            "ksc_install_command_copied",
            "ksc_agent_connected",
            "ksc_fixer_viewed",
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
    }, filterMode)),

    // 10. CNCF outreach (by utm_term = project slug)
    runReport(propertyId, accessToken, withFilter({
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
    }, filterMode)),

    // 11. Engagement by page
    runReport(propertyId, accessToken, withFilter({
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
    }, filterMode)),

    // 12. New vs returning users
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [currentRange],
      dimensions: [{ name: "newVsReturning" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
    }, filterMode)),

    // 13. Mission events (started/completed/error/rated)
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [currentRange],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
      dimensionFilter: {
        orGroup: {
          expressions: [
            "ksc_mission_started",
            "ksc_mission_completed",
            "ksc_mission_error",
            "ksc_mission_rated",
          ].map((ev) => ({
            filter: {
              fieldName: "eventName",
              stringFilter: { matchType: "EXACT", value: ev },
            },
          })),
        },
      },
    }, filterMode)),

    // 14. Mission types breakdown (by customEvent:mission_type)
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [currentRange],
      dimensions: [{ name: "customEvent:mission_type" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          stringFilter: { matchType: "EXACT", value: "ksc_mission_started" },
        },
      },
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 15,
    }, filterMode)),

    // 15. Card popularity (added/expanded/clicked by card_type)
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [currentRange],
      dimensions: [
        { name: "customEvent:card_type" },
        { name: "eventName" },
      ],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        orGroup: {
          expressions: [
            "ksc_card_added",
            "ksc_card_expanded",
            "ksc_card_list_item_clicked",
          ].map((ev) => ({
            filter: {
              fieldName: "eventName",
              stringFilter: { matchType: "EXACT", value: ev },
            },
          })),
        },
      },
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 100,
    }, filterMode)),

    // 16. Feature adoption events
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [currentRange],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
      dimensionFilter: {
        orGroup: {
          expressions: [
            "ksc_global_search_opened",
            "ksc_global_search_queried",
            "ksc_theme_changed",
            "ksc_language_changed",
            "ksc_demo_mode_toggled",
            "ksc_dashboard_created",
            "ksc_data_exported",
            "ksc_marketplace_install",
            "ksc_drill_down_opened",
            "ksc_card_refreshed",
            "ksc_tour_started",
            "ksc_tour_completed",
            "ksc_feedback_submitted",
            "ksc_linkedin_share",
            "ksc_pwa_prompt_shown",
            "ksc_sidebar_navigated",
            "ksc_add_card_modal_opened",
          ].map((ev) => ({
            filter: {
              fieldName: "eventName",
              stringFilter: { matchType: "EXACT", value: ev },
            },
          })),
        },
      },
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 20,
    }, filterMode)),

    // 17. Weekly retention (new vs returning by week)
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [currentRange],
      dimensions: [{ name: "week" }, { name: "newVsReturning" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ dimension: { dimensionName: "week", orderType: "ALPHANUMERIC" } }],
    }, filterMode)),

    // 18. Error events
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [currentRange],
      dimensions: [{ name: "eventName" }, { name: "customEvent:error_category" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        orGroup: {
          expressions: [
            "ksc_error",
            "ksc_mission_error",
            "ksc_update_failed",
            "ksc_chunk_reload_recovery_failed",
            "ksc_marketplace_install_failed",
            "ksc_update_stalled",
          ].map((ev) => ({
            filter: {
              fieldName: "eventName",
              stringFilter: { matchType: "EXACT", value: ev },
            },
          })),
        },
      },
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 30,
    }, filterMode)),

    // 19. Daily error trends (for sparklines)
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [currentRange],
      dimensions: [{ name: "date" }, { name: "eventName" }, { name: "customEvent:error_category" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        orGroup: {
          expressions: [
            "ksc_error",
            "ksc_mission_error",
            "ksc_update_failed",
            "ksc_chunk_reload_recovery_failed",
            "ksc_marketplace_install_failed",
            "ksc_update_stalled",
          ].map((ev) => ({
            filter: {
              fieldName: "eventName",
              stringFilter: { matchType: "EXACT", value: ev },
            },
          })),
        },
      },
      orderBys: [{ dimension: { dimensionName: "date", orderType: "ALPHANUMERIC" } }],
    }, filterMode)),

    // 20. Daily funnel events (agent_connected by date — for conv rate line chart)
    runReport(propertyId, accessToken, withFilter({
      dateRanges: [currentRange],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "totalUsers" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          stringFilter: { matchType: "EXACT" as const, value: "ksc_agent_connected" },
        },
      },
      orderBys: [{ dimension: { dimensionName: "date", orderType: "ALPHANUMERIC" } }],
    }, filterMode)),
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

  // Parse mission events
  const missionMap: Record<string, number> = {};
  for (const row of missionEventRows) {
    missionMap[dimVal(row, 0)] = metVal(row, 0);
  }

  // Parse mission types
  const missionTopTypes = missionTypeRows
    .filter((r) => dimVal(r, 0) !== "(not set)")
    .map((r) => ({ type: dimVal(r, 0), count: metVal(r, 0) }));

  // Parse card popularity — pivot by card_type
  const cardMap = new Map<string, { added: number; expanded: number; clicked: number }>();
  for (const row of cardPopRows) {
    const card = dimVal(row, 0);
    const event = dimVal(row, 1);
    const count = metVal(row, 0);
    if (card === "(not set)") continue;
    if (!cardMap.has(card)) cardMap.set(card, { added: 0, expanded: 0, clicked: 0 });
    const entry = cardMap.get(card)!;
    if (event === "ksc_card_added") entry.added += count;
    else if (event === "ksc_card_expanded") entry.expanded += count;
    else if (event === "ksc_card_list_item_clicked") entry.clicked += count;
  }
  const cardPopularity = [...cardMap.entries()]
    .map(([card, stats]) => ({ card, ...stats }))
    .sort((a, b) => (b.added + b.expanded + b.clicked) - (a.added + a.expanded + a.clicked));

  // Parse feature adoption
  const featureAdoption = featureRows
    .filter((r) => dimVal(r, 0) !== "(not set)")
    .map((r) => ({
      feature: dimVal(r, 0).replace("ksc_", "").replace(/_/g, " "),
      count: metVal(r, 0),
      users: metVal(r, 1),
    }));

  // Parse weekly retention
  const weekMap = new Map<string, { newUsers: number; returning: number }>();
  for (const row of weeklyRetRows) {
    const week = dimVal(row, 0);
    const type = dimVal(row, 1);
    const users = metVal(row, 0);
    if (!weekMap.has(week)) weekMap.set(week, { newUsers: 0, returning: 0 });
    const entry = weekMap.get(week)!;
    if (type === "new") entry.newUsers = users;
    else if (type === "returning") entry.returning = users;
  }
  const weeklyRetention = [...weekMap.entries()]
    .map(([week, data]) => ({ week, ...data }))
    .sort((a, b) => a.week.localeCompare(b.week));

  // Parse errors with daily sparkline data
  // Build a map of all dates in the range for consistent sparkline lengths
  const allDates = dailyRows.map((r) => dimVal(r, 0)).sort();
  const SPARKLINE_DAYS = allDates.length;

  // Normalize empty/not-set dimension values to a single sentinel
  const normalizeDetail = (d: string) =>
    !d || d === "(not set)" || d === "(data deleted)" ? "—" : d;

  // Build daily counts per error key (event + normalized detail)
  const errorDailyMap = new Map<string, Map<string, number>>();
  for (const row of errorDailyRows) {
    const date = dimVal(row, 0);
    const event = dimVal(row, 1).replace("ksc_", "").replace(/_/g, " ");
    const detail = normalizeDetail(dimVal(row, 2));
    const count = metVal(row, 0);
    const key = `${event}|||${detail}`;
    if (!errorDailyMap.has(key)) errorDailyMap.set(key, new Map());
    const dayMap = errorDailyMap.get(key)!;
    dayMap.set(date, (dayMap.get(date) || 0) + count);
  }

  // Deduplicate error rows: GA4 returns separate rows for "" and "(not set)"
  // on the same event when error_category is unset. Merge them.
  const errorMerged = new Map<string, { event: string; count: number; detail: string }>();
  for (const r of errorRows) {
    if (dimVal(r, 0) === "(not set)") continue;
    const event = dimVal(r, 0).replace("ksc_", "").replace(/_/g, " ");
    const detail = normalizeDetail(dimVal(r, 1));
    const key = `${event}|||${detail}`;
    const existing = errorMerged.get(key);
    if (existing) {
      existing.count += metVal(r, 0);
    } else {
      errorMerged.set(key, { event, count: metVal(r, 0), detail });
    }
  }

  const errors = [...errorMerged.values()]
    .sort((a, b) => b.count - a.count)
    .map((e) => {
      const key = `${e.event}|||${e.detail}`;
      const dayMap = errorDailyMap.get(key);
      const daily = allDates.map((d) => dayMap?.get(d) || 0);
      return { event: e.event, count: e.count, detail: e.detail, daily };
    });



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
      commandCopied: funnelMap["ksc_install_command_copied"] || 0,
      agentConnected: funnelMap["ksc_agent_connected"] || 0,
      fixerViewed: funnelMap["ksc_fixer_viewed"] || 0,
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
    missions: {
      started: missionMap["ksc_mission_started"] || 0,
      completed: missionMap["ksc_mission_completed"] || 0,
      errored: missionMap["ksc_mission_error"] || 0,
      rated: missionMap["ksc_mission_rated"] || 0,
      topTypes: missionTopTypes,
    },
    cardPopularity,
    featureAdoption,
    weeklyRetention,
    errors,
    dailyFunnel: dailyFunnelRows.map((r) => ({
      date: dimVal(r, 0),
      agentConnected: metVal(r, 0),
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
  // See web/netlify/functions/_shared/cors.ts for allowlist rationale (#9879).
  const corsOpts = {
    methods: "GET, OPTIONS",
    headers: "Content-Type",
  };
  /** Browser cache: 15 min — analytics rollups refresh infrequently. */
  const ANALYTICS_BROWSER_CACHE_S = 900;
  const corsHeaders: Record<string, string> = {
    ...buildCorsHeaders(req, corsOpts),
    "Cache-Control": `public, max-age=${ANALYTICS_BROWSER_CACHE_S}`,
  };

  if (req.method === "OPTIONS") {
    return handlePreflight(req, corsOpts);
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

  // Parse filter mode: ?filter=production (default) or ?filter=all
  const url = new URL(req.url);
  const filterParam = url.searchParams.get("filter");
  const filterMode: FilterMode = filterParam === "all" ? "all" : "production";
  const cacheKey = `${CACHE_KEY_PREFIX}-${filterMode}`;

  // Check blob cache
  const store = getStore(CACHE_STORE);
  try {
    const cached = await store.get(cacheKey, { type: "text" });
    if (cached) {
      const entry = JSON.parse(cached);
      if (Date.now() < entry.expiresAt) {
        return new Response(JSON.stringify({ ...entry.data, fromCache: true, filterMode }), {
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
    const data = await fetchDashboardData(propertyId, accessToken, filterMode);

    // Cache result
    store
      .set(
        cacheKey,
        JSON.stringify({ data, expiresAt: Date.now() + CACHE_TTL_MS })
      )
      .catch((err) => { console.warn("[analytics-dashboard] blob cache write failed:", err instanceof Error ? err.message : err) });

    return new Response(JSON.stringify({ ...data, filterMode }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[analytics-dashboard] Fetch error:", err instanceof Error ? err.message : err);
    return new Response(
      JSON.stringify({ error: "Failed to fetch analytics data" }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};
