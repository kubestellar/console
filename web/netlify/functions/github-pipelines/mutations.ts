/**
 * Mutation handling (rerun/cancel) for GitHub Pipelines Dashboard
 */
import { enforceSimpleRateLimit } from "../_shared/rate-limit";
import { STORE_NAME, getRepos } from "./constants";
import { gh } from "./fetchers";
import { isValidRepo, jsonResponse } from "./helpers";

const REPOS = getRepos();

export async function mutate(
  op: string,
  repo: string,
  runId: string,
  req: Request
): Promise<Response> {
  // Rate limiting — 5 mutations per hour per IP
  const clientIp =
    req.headers.get("x-nf-client-connection-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const rate = await enforceSimpleRateLimit({
    storeName: STORE_NAME,
    prefix: "gh-pipelines-mutate:",
    subject: clientIp,
    maxRequests: 5,
    windowMs: 3600 * 1000, // 1 hour
  });
  if (rate.limited) {
    return jsonResponse(
      { error: "Rate limit exceeded", retryAfter: rate.retryAfterSeconds },
      { status: 429 }
    );
  }

  const token = process.env.GITHUB_MUTATIONS_TOKEN;
  if (!token) {
    // Intentional: demo site never mutates without an operator explicitly
    // enabling it by setting GITHUB_MUTATIONS_TOKEN. See README for details.
    return jsonResponse(
      { error: "Workflow mutations disabled on this deployment" },
      { status: 503 }
    );
  }
  if (!isValidRepo(repo) || !REPOS.includes(repo)) {
    return jsonResponse({ error: "Unknown repo" }, { status: 400 });
  }
  let path: string;
  if (op === "rerun") path = `/repos/${repo}/actions/runs/${runId}/rerun`;
  else if (op === "cancel") path = `/repos/${repo}/actions/runs/${runId}/cancel`;
  else return jsonResponse({ error: "Unknown op" }, { status: 400 });

  const res = await gh(path, token, { method: "POST" });
  if (!res.ok) {
    return jsonResponse({ error: "upstream request failed" }, { status: 502 });
  }
  return jsonResponse({ ok: true, op, run: runId, repo });
}
