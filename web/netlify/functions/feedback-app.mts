/**
 * Netlify Function: feedback-app
 *
 * Central attribution proxy for console-submitted issues. Localhost
 * and cluster-deployed console instances POST here with a per-user
 * client credential; this function validates the credential with
 * GitHub, mints an App installation token for `kubestellar-console-bot`,
 * and creates the issue so GitHub stamps
 * `performed_via_github_app.slug` on it.
 *
 * The App private key lives ONLY in Netlify env vars — never in
 * consumer `.env` files or cluster Secrets. This is the single
 * secret-holder for the attribution contract.
 *
 * See _shared/feedback-helpers.ts for GitHub API calls, JWT signing,
 * credential caching, and input validation logic.
 */

import { handlePreflight } from "./_shared/cors";
import {
  checkInMemoryRateLimit,
  getClientIp,
  type InMemoryRateLimitEntry,
} from "./_shared/inMemoryRateLimit";
import { enforceSimpleRateLimit } from "./_shared/rate-limit";
import {
  ALLOWED_REPOS,
  CLIENT_AUTH_HEADER,
  CORS_OPTS,
  FEEDBACK_APP_AUTH_FAILURE_RATE_LIMIT_MAX_REQUESTS,
  FEEDBACK_APP_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS,
  FEEDBACK_APP_PRE_AUTH_RATE_LIMIT_MAX_REQUESTS,
  FEEDBACK_APP_PRE_AUTH_RATE_LIMIT_WINDOW_MS,
  FEEDBACK_APP_RATE_LIMIT_MAX_REQUESTS,
  FEEDBACK_APP_RATE_LIMIT_WINDOW_MS,
  GITHUB_API,
  GH_TIMEOUT_MS,
  RATE_LIMIT_STORE_NAME,
  addSubIssue,
  getInstallationCred,
  getRepoPermissions,
  jsonResponse,
  sanitizeUpstreamError,
  validateIssueRequest,
  verifyClientAuth,
} from "./_shared/feedback-helpers";

import type { FeedbackAppAction, IssueRequest } from "./_shared/feedback-helpers";

const MAX_FEEDBACK_BODY_BYTES = 102_400;
/** Maximum response body size for GitHub API responses (512 KB) */
const MAX_RESPONSE_BYTES = 512_000;
const HTTP_STATUS_RATE_LIMITED = 429;
const FEEDBACK_MUTATION_PERMISSION_ERROR = "Push access required for feedback mutations";

const preAuthRateLimitMap = new Map<string, InMemoryRateLimitEntry>();
const authFailureRateLimitMap = new Map<string, InMemoryRateLimitEntry>();

function rateLimitResponse(request: Request, retryAfterSeconds: number): Response {
  return jsonResponse(
    request,
    HTTP_STATUS_RATE_LIMITED,
    {
      error: "Rate limit exceeded",
      retryAfter: retryAfterSeconds,
    },
    { "Retry-After": String(retryAfterSeconds) },
  );
}

export function resetFeedbackAppRateLimitsForTests(): void {
  preAuthRateLimitMap.clear();
  authFailureRateLimitMap.clear();
}

async function readCappedJson<T>(response: Response): Promise<T> {
  const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new Error(`Upstream response too large: ${contentLength} bytes`);
  }

  const rawText = await response.text();
  if (rawText.length > MAX_RESPONSE_BYTES) {
    throw new Error(`Upstream response too large: ${rawText.length} bytes`);
  }

  return JSON.parse(rawText) as T;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return handlePreflight(request, CORS_OPTS);
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse(request, 405, { error: "Method not allowed" });
  }

  const clientIp = getClientIp(request);
  const preAuthRate = checkInMemoryRateLimit(
    clientIp,
    preAuthRateLimitMap,
    FEEDBACK_APP_PRE_AUTH_RATE_LIMIT_MAX_REQUESTS,
    FEEDBACK_APP_PRE_AUTH_RATE_LIMIT_WINDOW_MS,
  );
  if (!preAuthRate.allowed) {
    return rateLimitResponse(request, preAuthRate.retryAfterSeconds);
  }

  const authFailureRate = checkInMemoryRateLimit(
    clientIp,
    authFailureRateLimitMap,
    FEEDBACK_APP_AUTH_FAILURE_RATE_LIMIT_MAX_REQUESTS,
    FEEDBACK_APP_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS,
    { consume: false },
  );
  if (!authFailureRate.allowed) {
    return rateLimitResponse(request, authFailureRate.retryAfterSeconds);
  }

  const clientAuth = request.headers.get(CLIENT_AUTH_HEADER);
  if (!clientAuth) {
    checkInMemoryRateLimit(
      clientIp,
      authFailureRateLimitMap,
      FEEDBACK_APP_AUTH_FAILURE_RATE_LIMIT_MAX_REQUESTS,
      FEEDBACK_APP_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS,
    );
    return jsonResponse(request, 401, { error: "Missing client credential" });
  }

  // Pre-auth rate limit per IP to prevent token introspection flooding (CWE-770, #16646)
  const blobPreAuthRate = await enforceSimpleRateLimit({
    storeName: RATE_LIMIT_STORE_NAME,
    prefix: "feedback-preauth:",
    subject: clientIp,
    windowMs: FEEDBACK_APP_RATE_LIMIT_WINDOW_MS,
    maxRequests: FEEDBACK_APP_RATE_LIMIT_MAX_REQUESTS,
  });
  if (blobPreAuthRate.limited) {
    return jsonResponse(request, 429, {
      error: "Rate limit exceeded",
      retryAfter: blobPreAuthRate.retryAfterSeconds,
    });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");

  let payload: IssueRequest | null = null;
  let action: FeedbackAppAction = "create_issue";
  if (request.method === "POST") {
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_FEEDBACK_BODY_BYTES) {
      return jsonResponse(request, 413, { error: "Request body too large" });
    }

    let rawBody: unknown;
    try {
      const text = await request.text();
      if (text.length > MAX_FEEDBACK_BODY_BYTES) {
        return jsonResponse(request, 413, { error: "Request body too large" });
      }
      rawBody = JSON.parse(text) as unknown;
    } catch {
      return jsonResponse(request, 400, { error: "Invalid JSON body" });
    }

    const validation = validateIssueRequest(rawBody);
    if (!validation.ok) {
      return jsonResponse(request, 400, { error: validation.error });
    }
    payload = validation.value;
    action = payload.action ?? "create_issue";
  }

  const repoOwner = payload?.repoOwner ?? url.searchParams.get("repoOwner") ?? "";
  const repoName = payload?.repoName ?? url.searchParams.get("repoName") ?? "";
  if (!repoOwner || !repoName) {
    return jsonResponse(request, 400, { error: "repoOwner and repoName required" });
  }

  const repoSlug = `${repoOwner}/${repoName}`;
  if (!ALLOWED_REPOS.has(repoSlug)) {
    return jsonResponse(request, 403, { error: "Repository not allowed" });
  }

  let user: { login: string; id: number };
  try {
    user = await verifyClientAuth(clientAuth);
  } catch (err) {
    const failedAuthRate = checkInMemoryRateLimit(
      clientIp,
      authFailureRateLimitMap,
      FEEDBACK_APP_AUTH_FAILURE_RATE_LIMIT_MAX_REQUESTS,
      FEEDBACK_APP_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS,
    );
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[feedback-app] Client auth failed:", msg);
    if (!failedAuthRate.allowed) {
      return rateLimitResponse(request, failedAuthRate.retryAfterSeconds);
    }
    return jsonResponse(request, 401, { error: "Client authentication failed" });
  }

  if (request.method === "POST") {
    const rate = await enforceSimpleRateLimit({
      storeName: RATE_LIMIT_STORE_NAME,
      prefix: "feedback-app:",
      subject: String(user.id || clientIp),
      maxRequests: FEEDBACK_APP_RATE_LIMIT_MAX_REQUESTS,
      windowMs: FEEDBACK_APP_RATE_LIMIT_WINDOW_MS,
    });
    if (rate.limited) {
      return rateLimitResponse(request, rate.retryAfterSeconds);
    }
  }

  let repoPermissions: { push: boolean } | null = null;
  if (request.method === "GET" || mode === "capabilities") {
    try {
      repoPermissions = await getRepoPermissions(clientAuth, repoSlug);
      return jsonResponse(request, 200, { can_link_parent: repoPermissions.push });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[feedback-app] Repo capability check failed:", msg);
      return jsonResponse(request, 502, { error: "Repository capability check failed" });
    }
  }

  try {
    repoPermissions = await getRepoPermissions(clientAuth, repoSlug);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[feedback-app] Repo permission check failed:", msg);
    return jsonResponse(request, 502, { error: "Repository permission check failed" });
  }
  if (!repoPermissions.push) {
    console.warn("[feedback-app] Denied mutation without push access:", {
      action,
      repoSlug,
      login: user.login,
      userId: user.id,
    });
    return jsonResponse(request, 403, { error: FEEDBACK_MUTATION_PERMISSION_ERROR });
  }

  let installCred: string;
  try {
    installCred = await getInstallationCred();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[feedback-app] App credential unavailable:", msg);
    return jsonResponse(request, 502, { error: "Service temporarily unavailable" });
  }

  if (!payload) {
    return jsonResponse(request, 400, { error: "Request body required" });
  }

  const stampedBody = payload.body
    ? `${payload.body}\n\n---\n*Submitted by @${user.login} via KubeStellar Console (proxied by \`kubestellar-console-bot\`).*`
    : "";

  try {
    if (action === "comment_issue") {
      const resp = await fetch(
        `${GITHUB_API}/repos/${repoSlug}/issues/${payload.issueNumber}/comments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${installCred}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "KubeStellar-Console-FeedbackApp",
          },
          body: JSON.stringify({ body: stampedBody }),
          signal: AbortSignal.timeout(GH_TIMEOUT_MS),
        },
      );
      if (!resp.ok) {
        const txt = await resp.text();
        console.error("[feedback-app] GitHub issue comment failed:", resp.status, sanitizeUpstreamError(txt));
        return jsonResponse(request, resp.status, { error: "Failed to add comment to issue" });
      }
      const data = await readCappedJson<{ html_url: string }>(resp);
      return jsonResponse(request, 200, { html_url: data.html_url, submitter: user.login });
    }

    if (action === "update_issue_state") {
      const resp = await fetch(
        `${GITHUB_API}/repos/${repoSlug}/issues/${payload.issueNumber}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${installCred}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "KubeStellar-Console-FeedbackApp",
          },
          body: JSON.stringify({ state: payload.state }),
          signal: AbortSignal.timeout(GH_TIMEOUT_MS),
        },
      );
      if (!resp.ok) {
        const txt = await resp.text();
        console.error("[feedback-app] GitHub issue update failed:", resp.status, sanitizeUpstreamError(txt));
        return jsonResponse(request, resp.status, { error: "Failed to update issue state" });
      }
      const data = await readCappedJson<{ html_url: string; state: string }>(resp);
      return jsonResponse(request, 200, { html_url: data.html_url, state: data.state, submitter: user.login });
    }

    // Default action: create_issue
    const issuePayload: Record<string, unknown> = { title: payload.title, body: stampedBody };
    if (payload.labels && payload.labels.length > 0) {
      issuePayload.labels = payload.labels;
    }

    const resp = await fetch(`${GITHUB_API}/repos/${repoSlug}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${installCred}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "KubeStellar-Console-FeedbackApp",
      },
      body: JSON.stringify(issuePayload),
      signal: AbortSignal.timeout(GH_TIMEOUT_MS),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      console.error("[feedback-app] GitHub issue create failed:", resp.status, sanitizeUpstreamError(txt));
      return jsonResponse(request, resp.status, { error: "Failed to create issue" });
    }
    const data = await readCappedJson<{ id: number; number: number; html_url: string }>(resp);

    let warning: string | undefined;
    if (typeof payload.parentIssueNumber === "number" && payload.parentIssueNumber > 0) {
      try {
        await addSubIssue(installCred, repoSlug, payload.parentIssueNumber, data.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[feedback-app] Sub-issue linking failed:", msg);
        warning = `Issue #${data.number} was created, but it could not be linked to parent issue #${payload.parentIssueNumber}.`;
      }
    }

    return jsonResponse(request, 200, {
      id: data.id,
      number: data.number,
      html_url: data.html_url,
      submitter: user.login,
      ...(warning ? { warning } : {}),
    });
  } catch (err) {
    console.error("[feedback-app] Feedback action failed:", err instanceof Error ? err.message : err);
    return jsonResponse(request, 502, { error: "Feedback action failed" });
  }
}
