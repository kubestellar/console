/**
 * Netlify Function: GitHub Pipelines Dashboard
 *
 * Powers the `/ci-cd` pipeline cards (Nightly Release Pulse, Workflow Matrix,
 * Live Runs flow, Recent Failures). Caches GitHub Actions data server-side
 * (Netlify Blobs) so a public-page visitor never hits GitHub directly and
 * the unauth'd 60/hr per-IP rate limit isn't a concern.
 *
 * Views (GET):
 *   ?view=pulse                         → cross-repo nightly health
 *   ?view=matrix&days=14|30|90&repo=…   → heatmap of workflows × days
 *   ?view=flow&repo=…                   → in-progress / queued runs + job tree
 *   ?view=failures&repo=…               → last N failed runs with failing step
 *   ?view=log&repo=…&job=…              → job log tail (last LOG_TAIL_LINES)
 *
 * Mutations (POST):
 *   ?view=mutate&op=rerun|cancel&repo=…&run=…
 *   Gated on GITHUB_MUTATIONS_TOKEN env var. If unset, always returns 503
 *   to keep the public demo site from triggering workflow re-runs.
 *
 * Env:
 *   GITHUB_TOKEN            — read-only PAT (required)
 *   GITHUB_MUTATIONS_TOKEN  — PAT with actions:write (optional; disabled if absent)
 */
import { getStore } from "@netlify/blobs";
import {
  STORE_NAME,
  CACHE_TTL_MS,
  MATRIX_DEFAULT_DAYS,
  MATRIX_MAX_DAYS,
  getRepos,
} from "./github-pipelines/constants";
import { corsOrigin, jsonResponse, readCache, writeCache, isValidRepo } from "./github-pipelines/helpers";
import { buildPulse, buildMatrix, buildFlow, buildFailures, buildLog } from "./github-pipelines/views";
import { mutate } from "./github-pipelines/mutations";

const REPOS = getRepos();

export default async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");
  const baseHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": corsOrigin(origin),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: baseHeaders });
  }

  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "pulse";

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return jsonResponse(
      { error: "GITHUB_TOKEN not configured" },
      { status: 500, headers: baseHeaders }
    );
  }

  const store = getStore(STORE_NAME);

  try {
    // Mutations — POST only
    if (view === "mutate") {
      if (req.method !== "POST") {
        return jsonResponse(
          { error: "Mutations require POST" },
          { status: 405, headers: baseHeaders }
        );
      }
      const op = url.searchParams.get("op") ?? "";
      const repo = url.searchParams.get("repo") ?? "";
      const run = url.searchParams.get("run") ?? "";
      if (!/^\d+$/.test(run)) {
        return jsonResponse({ error: "Invalid run ID" }, { status: 400, headers: baseHeaders });
      }
      const resp = await mutate(op, repo, run, req);
      // Inherit CORS headers
      for (const [k, v] of Object.entries(baseHeaders)) resp.headers.set(k, v);
      return resp;
    }

    // Reads — cache hit? Include UTC date in the pulse key so it rotates
    // daily and doesn't serve yesterday's release tag for hours after a new
    // nightly publishes. Other views are keyed by their query params.
    const datePrefix = view === "pulse" ? new Date().toISOString().slice(0, 13) : ""; // hourly bucket for pulse
    const cacheKey = `${view}:${datePrefix}:${url.searchParams.get("repo") ?? "all"}:${url.searchParams.get("days") ?? ""}:${url.searchParams.get("job") ?? ""}`;
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
        payload = await buildPulse(store, token, url.searchParams.get("repo"));
        break;
      case "matrix": {
        const daysRaw = parseInt(url.searchParams.get("days") ?? String(MATRIX_DEFAULT_DAYS), 10);
        const days = Math.min(Math.max(1, daysRaw || MATRIX_DEFAULT_DAYS), MATRIX_MAX_DAYS);
        payload = await buildMatrix(store, token, days, url.searchParams.get("repo"));
        break;
      }
      case "flow":
        payload = await buildFlow(token, url.searchParams.get("repo"));
        break;
      case "failures":
        payload = await buildFailures(token, url.searchParams.get("repo"));
        break;
      case "all": {
        // Unified fetch — builds all four views in parallel so the CI/CD
        // dashboard makes one request instead of four.
        const repoFilter = url.searchParams.get("repo");
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
        const repo = url.searchParams.get("repo") ?? "";
        const job = url.searchParams.get("job") ?? "";
        if (!isValidRepo(repo) || !REPOS.includes(repo) || !job || !/^\d+$/.test(job)) {
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
    const wrapped = { ...(payload as Record<string, unknown>), repos: REPOS };
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
        repos: REPOS,
        nextCron: "0 5 * * *",
      },
      { status: 500, headers: baseHeaders }
    );
  }
};

export const config = {
  path: "/api/github-pipelines",
};
