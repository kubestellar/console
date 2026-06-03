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
import { enforceSimpleRateLimit } from "./_shared/rate-limit";
import {
  ALLOWED_REPOS,
  CLIENT_AUTH_HEADER,
  CORS_OPTS,
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

import type {
  FeedbackAppAction,
  IssueRequest,
  RepoPermissions,
} from "./_shared/feedback-helpers";

const MAX_FEEDBACK_BODY_BYTES = 102_400;
/** Maximum response body size for GitHub API responses (512 KB) */
const MAX_RESPONSE_BYTES = 512_000;
const FEEDBACK_COMMENT_PERMISSION_ERROR =
  "Push access required to add feedback issue comments as kubestellar-console-bot";
const FEEDBACK_LABEL_PERMISSION_ERROR =
  "Push access required to set feedback issue labels as kubestellar-console-bot";
const FEEDBACK_STATE_PERMISSION_ERROR =
  "Push access required to change feedback issue state as kubestellar-console-bot";
const FEEDBACK_PARENT_LINK_PERMISSION_ERROR =
  "Push access required to link feedback issues to a parent issue as kubestellar-console-bot";

type MutationPermissionRequirement =
  | { allowed: true }
  | { allowed: false; error: string };

type FeedbackBotMutationAction =
  | FeedbackAppAction
  | "set_labels"
  | "link_parent_issue";

interface FeedbackAuditUser {
  login: string;
  id: number;
}

interface FeedbackBotMutationAuditDetails {
  issueNumber?: number;
  createdIssueNumber?: number;
  issueId?: number;
  htmlUrl?: string;
  parentIssueNumber?: number;
  labels?: string[];
  state?: "open" | "closed";
}

function hasRepoWriteAccess(repoPermissions: RepoPermissions): boolean {
  return repoPermissions.push || repoPermissions.admin;
}

function logFeedbackBotMutation(
  action: FeedbackBotMutationAction,
  repoSlug: string,
  user: FeedbackAuditUser,
  details: FeedbackBotMutationAuditDetails,
): void {
  console.log(JSON.stringify({
    event: "feedback_app_bot_mutation",
    action,
    repoSlug,
    actorLogin: user.login,
    actorId: user.id,
    ...details,
  }));
}

function logDeniedFeedbackMutation(
  action: FeedbackAppAction,
  repoSlug: string,
  user: FeedbackAuditUser,
  repoPermissions: RepoPermissions,
  error: string,
): void {
  console.warn(JSON.stringify({
    event: "feedback_app_permission_denied",
    action,
    repoSlug,
    actorLogin: user.login,
    actorId: user.id,
    permissions: repoPermissions,
    error,
  }));
}

function getMutationPermissionRequirement(
  action: FeedbackAppAction,
  payload: IssueRequest,
  repoPermissions: RepoPermissions,
): MutationPermissionRequirement {
  if (action === "comment_issue" && !hasRepoWriteAccess(repoPermissions)) {
    return { allowed: false, error: FEEDBACK_COMMENT_PERMISSION_ERROR };
  }

  if (action === "update_issue_state" && !hasRepoWriteAccess(repoPermissions)) {
    return { allowed: false, error: FEEDBACK_STATE_PERMISSION_ERROR };
  }

  if ((payload.labels || []).length > 0 && !hasRepoWriteAccess(repoPermissions)) {
    return { allowed: false, error: FEEDBACK_LABEL_PERMISSION_ERROR };
  }

  if (
    typeof payload.parentIssueNumber === "number" &&
    payload.parentIssueNumber > 0 &&
    !hasRepoWriteAccess(repoPermissions)
  ) {
    return { allowed: false, error: FEEDBACK_PARENT_LINK_PERMISSION_ERROR };
  }

  return { allowed: true };
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

  const clientAuth = request.headers.get(CLIENT_AUTH_HEADER);
  if (!clientAuth) {
    return jsonResponse(request, 401, { error: "Missing client credential" });
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
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[feedback-app] Client auth failed:", msg);
    return jsonResponse(request, 401, { error: "Client authentication failed" });
  }

  if (request.method === "POST") {
    const clientIp =
      request.headers.get("x-nf-client-connection-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const rate = await enforceSimpleRateLimit({
      storeName: RATE_LIMIT_STORE_NAME,
      prefix: "feedback-app:",
      subject: String(user.id || clientIp),
      maxRequests: FEEDBACK_APP_RATE_LIMIT_MAX_REQUESTS,
      windowMs: FEEDBACK_APP_RATE_LIMIT_WINDOW_MS,
    });
    if (rate.limited) {
      return jsonResponse(request, 429, {
        error: "Rate limit exceeded",
        retryAfter: rate.retryAfterSeconds,
      });
    }
  }

  let repoPermissions: RepoPermissions;
  try {
    repoPermissions = await getRepoPermissions(clientAuth, repoSlug);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[feedback-app] Repo permission check failed:", msg);
    return jsonResponse(request, 502, { error: "Repository permission check failed" });
  }

  if (request.method === "GET" || mode === "capabilities") {
    return jsonResponse(request, 200, { can_link_parent: hasRepoWriteAccess(repoPermissions) });
  }

  if (!payload) {
    return jsonResponse(request, 400, { error: "Request body required" });
  }

  const permissionRequirement = getMutationPermissionRequirement(
    action,
    payload,
    repoPermissions,
  );
  if (!permissionRequirement.allowed) {
    logDeniedFeedbackMutation(
      action,
      repoSlug,
      user,
      repoPermissions,
      permissionRequirement.error,
    );
    return jsonResponse(request, 403, { error: permissionRequirement.error });
  }

  let installCred: string;
  try {
    installCred = await getInstallationCred();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[feedback-app] App credential unavailable:", msg);
    return jsonResponse(request, 502, { error: "Service temporarily unavailable" });
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
      logFeedbackBotMutation("comment_issue", repoSlug, user, {
        issueNumber: payload.issueNumber!,
        htmlUrl: data.html_url,
      });
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
          body: JSON.stringify({ state: payload.state! }),
          signal: AbortSignal.timeout(GH_TIMEOUT_MS),
        },
      );
      if (!resp.ok) {
        const txt = await resp.text();
        console.error("[feedback-app] GitHub issue update failed:", resp.status, sanitizeUpstreamError(txt));
        return jsonResponse(request, resp.status, { error: "Failed to update issue state" });
      }
      const data = await readCappedJson<{ html_url: string; state: "open" | "closed" }>(resp);
      logFeedbackBotMutation("update_issue_state", repoSlug, user, {
        issueNumber: payload.issueNumber!,
        htmlUrl: data.html_url,
        state: data.state,
      });
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
    logFeedbackBotMutation("create_issue", repoSlug, user, {
      createdIssueNumber: data.number,
      issueId: data.id,
      htmlUrl: data.html_url,
    });
    if ((payload.labels || []).length > 0) {
      logFeedbackBotMutation("set_labels", repoSlug, user, {
        createdIssueNumber: data.number,
        issueId: data.id,
        htmlUrl: data.html_url,
        labels: payload.labels ?? [],
      });
    }

    let warning: string | undefined;
    if (typeof payload.parentIssueNumber === "number" && payload.parentIssueNumber > 0) {
      try {
        await addSubIssue(installCred, repoSlug, payload.parentIssueNumber, data.id);
        logFeedbackBotMutation("link_parent_issue", repoSlug, user, {
          createdIssueNumber: data.number,
          issueId: data.id,
          htmlUrl: data.html_url,
          parentIssueNumber: payload.parentIssueNumber,
        });
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
