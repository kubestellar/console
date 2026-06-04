/**
 * Netlify Function: GitHub Pipelines Dashboard
 *
 * Powers the `/ci-cd` pipeline cards (Nightly Release Pulse, Workflow Matrix,
 * Live Runs flow, Recent Failures). Caches GitHub Actions data server-side
 * (Netlify Blobs) and rate-limits public reads so visitors never hit GitHub
 * directly and cannot abuse the dashboard endpoint.
 *
 * Views (GET):
 *   ?view=pulse                         → cross-repo nightly health
 *   ?view=matrix&days=14|30|90&repo=…   → heatmap of workflows × days
 *   ?view=flow&repo=…                   → in-progress / queued runs + job tree
 *   ?view=failures&repo=…               → last N failed runs with failing step
 *   ?view=log&repo=…&job=…              → job log tail (last LOG_TAIL_LINES)
 *
 * Mutations have been moved to the auth-gated
 * `/api/github-pipelines/mutate` Netlify function.
 *
 * Env:
 *   GITHUB_TOKEN — read-only PAT (required)
 */
import { getStore } from "@netlify/blobs";
import { buildStrictKubestellarCorsHeaders } from "./_shared/cors";
import { enforceSimpleRateLimit } from "./_shared/rate-limit";
import {
  STORE_NAME,
  CACHE_TTL_MS,
  MATRIX_DEFAULT_DAYS,
  MATRIX_MAX_DAYS,
  READ_RATE_LIMIT_STORE_NAME,
  READ_RATE_LIMIT_MAX_REQUESTS,
  READ_RATE_LIMIT_WINDOW_MS,
  getRepos,
} from "./github-pipelines/constants";
import {
  jsonResponse,
  readCache,
  writeCache,
  isValidRepo,
} from "./github-pipelines/helpers";
import { isAllowedRepoSlug } from "./_shared/repo-allowlist";
import {
  buildPulse,
  buildMatrix,
  buildFlow,
  buildFailures,
  buildLog,
} from "./github-pipelines/views";

export default async (req: Request): Promise<Response> => {
  const repos = getRepos();
  const origin = req.headers.get("origin");
  const baseHeaders: Record<string, string> = buildStrictKubestellarCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: baseHeaders });
  }

  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "pulse";
  const repoFilter = url.searchParams.get("repo");

  if (req.method !== "GET") {
    return jsonResponse(
      { error: "Only GET is supported on this endpoint" },
      { status: 405, headers: baseHeaders },
    );
  }

  if (repoFilter !== null && !isValidRepo(repoFilter)) {
    return jsonResponse(
      { error: "Invalid repo format" },
      { status: 400, headers: baseHeaders },
    );
  }

  if (repoFilter !== null && !isAllowedRepoSlug(repoFilter, repos)) {
    return jsonResponse(
      { error: "Repository not allowed" },
      { status: 403, headers: baseHeaders },
    );
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return jsonResponse(
      { error: "GITHUB_TOKEN not configured" },
      { status: 500, headers: baseHeaders }
    );
  }

  const clientIp =
    req.headers.get("x-nf-client-connection-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const readRate = await enforceSimpleRateLimit({
    storeName: READ_RATE_LIMIT_STORE_NAME,
    prefix: "gh-pipelines-read:",
    subject: clientIp,
    maxRequests: READ_RATE_LIMIT_MAX_REQUESTS,
    windowMs: READ_RATE_LIMIT_WINDOW_MS,
  });
  if (readRate.limited) {
    return jsonResponse(
      { error: "Rate limit exceeded", retryAfter: readRate.retryAfterSeconds },
      {
        status: 429,
        headers: {
          ...baseHeaders,
          "Retry-After": String(readRate.retryAfterSeconds),
        },
      },
    );
  }

  const store = getStore(STORE_NAME);

  try {
    // Reads — cache hit? Include UTC date in the pulse key so it rotates
    // daily and doesn't serve yesterday's release tag for hours after a new
    // nightly publishes. Other views are keyed by their query params.
    const datePrefix = view === "pulse" ? new Date().toISOString().slice(0, 13) : ""; // hourly bucket for pulse
    const cacheKey = `${view}:${datePrefix}:${repoFilter ?? "all"}:${url.searchParams.get("days") ?? ""}:${url.searchParams.get("job") ?? ""}`;
    if (view !== "log") {
      const cached = await readCache<unknown>(store, cacheKey);
      if (cached) {
        return jsonResponse(cached.payload, {
          headers: {
            ...baseHeaders,
            "Cache-Control": `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`,
            "X-Cache": "HIT",
          },
        });
      }
    }

    let payload: unknown;
    switch (view) {
      case "pulse":
        payload = await buildPulse(store, token, repoFilter);
        break;
      case "matrix": {
        const daysRaw = parseInt(url.searchParams.get("days") ?? String(MATRIX_DEFAULT_DAYS), 10);
        const days = Math.min(Math.max(1, daysRaw || MATRIX_DEFAULT_DAYS), MATRIX_MAX_DAYS);
        payload = await buildMatrix(store, token, days, repoFilter);
        break;
      }
      case "flow":
        payload = await buildFlow(token, repoFilter);
        break;
      case "failures":
        payload = await buildFailures(token, repoFilter);
        break;
      case "all": {
        // Unified fetch — builds all four views in parallel so the CI/CD
        // dashboard makes one request instead of four.
        const daysRaw = parseInt(url.searchParams.get("days") ?? String(MATRIX_DEFAULT_DAYS), 10);
        const days = Math.min(Math.max(1, daysRaw || MATRIX_DEFAULT_DAYS), MATRIX_MAX_DAYS);
        const [pulse, matrix, flow, failures] = await Promise.allSettled([
          buildPulse(store, token, repoFilter),
          buildMatrix(store, token, days, repoFilter),
          buildFlow(token, repoFilter),
          buildFailures(token, repoFilter),
        ]);
        payload = {
          pulse: pulse.status === "fulfilled" ? pulse.value : null,
          matrix: matrix.status === "fulfilled" ? matrix.value : null,
          flow: flow.status === "fulfilled" ? flow.value : null,
          failures: failures.status === "fulfilled" ? failures.value : null,
        };
        break;
      }
      case "log": {
        const repo = repoFilter ?? "";
        const job = url.searchParams.get("job") ?? "";
        if (!repo || !job || !/^\d+$/.test(job)) {
          return jsonResponse(
            { error: "repo and valid numeric job params required" },
            { status: 400, headers: baseHeaders }
          );
        }
        const r = await buildLog(token, repo, job);
        for (const [k, v] of Object.entries(baseHeaders)) r.headers.set(k, v);
        return r;
      }
      default:
        return jsonResponse({ error: "unknown view" }, { status: 400, headers: baseHeaders });
    }

    // Wrap payload with the repo list so the client never hardcodes it.
    // Cards read `repos` from the response to populate their filter dropdown.
    const wrapped = { ...(payload as Record<string, unknown>), repos };
    await writeCache(store, cacheKey, wrapped).catch((err) => { console.warn("[github-pipelines] blob cache write failed:", err instanceof Error ? err.message : err) });
    return jsonResponse(wrapped, {
      headers: {
        ...baseHeaders,
        "Cache-Control": `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`,
        "X-Cache": "MISS",
      },
    });
  } catch (err) {
    return jsonResponse(
      {
        error: "Internal error",
        repos,
        nextCron: "0 5 * * *",
      },
      { status: 500, headers: baseHeaders }
    );
  }
};

export const config = {
  path: "/api/github-pipelines",
};
