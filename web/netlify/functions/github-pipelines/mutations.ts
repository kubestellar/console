/**
 * Mutation handling (rerun/cancel) for GitHub Pipelines Dashboard.
 * Auth and rate limiting are enforced by github-pipelines-mutate.mts.
 */
import { getRepos } from "./constants";
import { gh } from "./fetchers";
import { isValidRepo, jsonResponse } from "./helpers";

const REPOS = getRepos();
const RERUN_OPERATION = "rerun";
const CANCEL_OPERATION = "cancel";
const MAX_UPSTREAM_ERROR_PREVIEW_CHARS = 500;

export async function mutate(
  op: string,
  repo: string,
  runId: string,
): Promise<Response> {
  const token = process.env.GITHUB_MUTATIONS_TOKEN;
  if (!token) {
    return jsonResponse(
      { error: "Workflow mutations disabled on this deployment" },
      { status: 503 },
    );
  }
  if (!/^\d+$/.test(runId)) {
    return jsonResponse({ error: "Invalid run ID" }, { status: 400 });
  }
  if (!isValidRepo(repo) || !REPOS.includes(repo)) {
    return jsonResponse({ error: "Unknown repo" }, { status: 400 });
  }

  let path: string;
  if (op === RERUN_OPERATION) path = `/repos/${repo}/actions/runs/${runId}/rerun`;
  else if (op === CANCEL_OPERATION) path = `/repos/${repo}/actions/runs/${runId}/cancel`;
  else return jsonResponse({ error: "Unknown op" }, { status: 400 });

  const res = await gh(path, token, { method: "POST" });
  if (!res.ok) {
    const upstreamBody = await res.text().catch(() => "");
    console.warn("[github-pipelines-mutate] upstream mutation failed", {
      op,
      repo,
      runId,
      status: res.status,
      body: upstreamBody.slice(0, MAX_UPSTREAM_ERROR_PREVIEW_CHARS),
    });
    return jsonResponse({ error: "upstream request failed" }, { status: 502 });
  }
  return jsonResponse({ ok: true, op, run: runId, repo });
}
