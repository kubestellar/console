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
import {
  fetchDashboardData,
  CACHE_KEY_PREFIX,
  CACHE_STORE,
  CACHE_TTL_MS,
} from "./_shared/analytics-dashboard";
import { getAccessToken } from "./_shared/analytics-dashboard-auth";
import type {
  FilterMode,
  ServiceAccountKey,
} from "./_shared/analytics-dashboard-types";
import { buildCorsHeaders, handlePreflight } from "./_shared/cors";

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
      JSON.stringify({
        error: "Invalid GA4_SERVICE_ACCOUNT_JSON — must be base64-encoded JSON",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const url = new URL(req.url);
  const filterParam = url.searchParams.get("filter");
  const filterMode: FilterMode =
    filterParam === "all" ? "all" : "production";
  const cacheKey = `${CACHE_KEY_PREFIX}-${filterMode}`;
  const store = getStore(CACHE_STORE);

  try {
    const cached = await store.get(cacheKey, { type: "text" });
    if (cached) {
      const entry = JSON.parse(cached);
      if (Date.now() < entry.expiresAt) {
        return new Response(
          JSON.stringify({ ...entry.data, fromCache: true, filterMode }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }
  } catch {
    // Cache miss
  }

  try {
    const accessToken = await getAccessToken(serviceAccount, store);
    const data = await fetchDashboardData(propertyId, accessToken, filterMode);

    store
      .set(
        cacheKey,
        JSON.stringify({ data, expiresAt: Date.now() + CACHE_TTL_MS })
      )
      .catch((err) => {
        console.warn(
          "[analytics-dashboard] blob cache write failed:",
          err instanceof Error ? err.message : err
        );
      });

    return new Response(JSON.stringify({ ...data, filterMode }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(
      "[analytics-dashboard] Fetch error:",
      err instanceof Error ? err.message : err
    );
    return new Response(JSON.stringify({ error: "Failed to fetch analytics data" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};
