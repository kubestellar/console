/**
 * Shared helpers for the feedback-app Netlify Function.
 *
 * Extracted from feedback-app.mts to keep the main handler under 300 LOC.
 * Contains: GitHub API calls, JWT signing, credential caching, input
 * validation, and response utilities.
 */

import { createPrivateKey, createSign } from "node:crypto";
import { buildCorsHeaders } from "./cors";

// ─── Constants ────────────────────────────────────────────────────────────────

export const GITHUB_API = "https://api.github.com";

/** Only issues on these repos may be created via the proxy. */
export const ALLOWED_REPOS = new Set([
  "kubestellar/console",
  "kubestellar/docs",
]);

/** App JWT validity window (GitHub caps at 10 min; use 9). */
const APP_JWT_TTL_SEC = 9 * 60;
/** Clock-skew allowance when signing the App JWT. */
const APP_JWT_SKEW_SEC = 60;
/** Installation token cache TTL — tokens live 60 min, refresh at 55. */
const INSTALL_TOKEN_TTL_MS = 55 * 60 * 1000;
/** HTTP timeout for GitHub API calls. */
export const GH_TIMEOUT_MS = 20_000;
/** Feedback-app rate limiting lives in a separate blob store. */
export const RATE_LIMIT_STORE_NAME = "feedback-app-rate-limit";
/** Maximum POST mutations per authenticated user per day. */
export const FEEDBACK_APP_RATE_LIMIT_MAX_REQUESTS = 50;
/** Rate-limit window for feedback POSTs (24h). */
export const FEEDBACK_APP_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Non-obvious header name for the per-user client credential. */
export const CLIENT_AUTH_HEADER = "x-kc-client-auth";
/** Maximum chars of upstream response body to log (defense-in-depth). */
const MAX_LOG_BODY_CHARS = 200;

/** CORS options for feedback-app. */
export const CORS_OPTS = {
  methods: "GET, POST, OPTIONS",
  headers: `Content-Type, ${CLIENT_AUTH_HEADER}`,
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export type FeedbackAppAction = "create_issue" | "comment_issue" | "update_issue_state";

export interface IssueRequest {
  action?: FeedbackAppAction;
  repoOwner: string;
  repoName: string;
  issueNumber?: number;
  title?: string;
  body?: string;
  state?: "open" | "closed";
  labels?: string[];
  parentIssueNumber?: number;
}

interface CachedInstallCred {
  value: string;
  fetchedAt: number;
}

// ─── Input Validation ─────────────────────────────────────────────────────────

const VALID_ACTIONS: ReadonlySet<string> = new Set([
  "create_issue",
  "comment_issue",
  "update_issue_state",
]);

/**
 * Validates and narrows a parsed JSON body into a typed IssueRequest.
 * Returns an error message string if invalid, or the validated request.
 */
export function validateIssueRequest(
  raw: unknown,
): { ok: true; value: IssueRequest } | { ok: false; error: string } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  const obj = raw as Record<string, unknown>;

  // repoOwner / repoName — required strings
  if (typeof obj.repoOwner !== "string" || obj.repoOwner.trim() === "") {
    return { ok: false, error: "repoOwner must be a non-empty string" };
  }
  if (typeof obj.repoName !== "string" || obj.repoName.trim() === "") {
    return { ok: false, error: "repoName must be a non-empty string" };
  }

  // action — optional, must be one of the known actions
  let action: FeedbackAppAction = "create_issue";
  if (obj.action !== undefined) {
    if (typeof obj.action !== "string" || !VALID_ACTIONS.has(obj.action)) {
      return { ok: false, error: `action must be one of: ${[...VALID_ACTIONS].join(", ")}` };
    }
    action = obj.action as FeedbackAppAction;
  }

  // title — string if present
  if (obj.title !== undefined && typeof obj.title !== "string") {
    return { ok: false, error: "title must be a string" };
  }

  // body — string if present
  if (obj.body !== undefined && typeof obj.body !== "string") {
    return { ok: false, error: "body must be a string" };
  }

  // issueNumber — number if present
  if (obj.issueNumber !== undefined) {
    if (typeof obj.issueNumber !== "number" || !Number.isInteger(obj.issueNumber) || obj.issueNumber <= 0) {
      return { ok: false, error: "issueNumber must be a positive integer" };
    }
  }

  // state — "open" | "closed" if present
  if (obj.state !== undefined && obj.state !== "open" && obj.state !== "closed") {
    return { ok: false, error: "state must be 'open' or 'closed'" };
  }

  // labels — string[] if present
  if (obj.labels !== undefined) {
    if (!Array.isArray(obj.labels)) {
      return { ok: false, error: "labels must be an array of strings" };
    }
    for (let i = 0; i < obj.labels.length; i++) {
      if (typeof obj.labels[i] !== "string") {
        return { ok: false, error: `labels[${i}] must be a string` };
      }
    }
  }

  // parentIssueNumber — number if present
  if (obj.parentIssueNumber !== undefined) {
    if (typeof obj.parentIssueNumber !== "number" || !Number.isInteger(obj.parentIssueNumber) || obj.parentIssueNumber <= 0) {
      return { ok: false, error: "parentIssueNumber must be a positive integer" };
    }
  }

  // Action-specific required field checks
  if (action === "create_issue") {
    if (!obj.title || (typeof obj.title === "string" && obj.title.trim() === "")) {
      return { ok: false, error: "title and body are required for issue creation" };
    }
    if (!obj.body || (typeof obj.body === "string" && obj.body.trim() === "")) {
      return { ok: false, error: "title and body are required for issue creation" };
    }
  }
  if ((action === "comment_issue" || action === "update_issue_state") && typeof obj.issueNumber !== "number") {
    return { ok: false, error: "issueNumber is required for this action" };
  }
  if (action === "comment_issue" && !obj.body) {
    return { ok: false, error: "body is required for issue comments" };
  }
  if (action === "update_issue_state" && obj.state !== "open" && obj.state !== "closed") {
    return { ok: false, error: "state must be 'open' or 'closed'" };
  }

  return {
    ok: true,
    value: {
      action,
      repoOwner: obj.repoOwner as string,
      repoName: obj.repoName as string,
      ...(typeof obj.issueNumber === "number" ? { issueNumber: obj.issueNumber } : {}),
      ...(typeof obj.title === "string" ? { title: obj.title } : {}),
      ...(typeof obj.body === "string" ? { body: obj.body } : {}),
      ...(obj.state === "open" || obj.state === "closed" ? { state: obj.state } : {}),
      ...(Array.isArray(obj.labels) ? { labels: obj.labels as string[] } : {}),
      ...(typeof obj.parentIssueNumber === "number" ? { parentIssueNumber: obj.parentIssueNumber } : {}),
    },
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Truncate upstream error body for logging — never log full external responses. */
export function sanitizeUpstreamError(text: string): string {
  const oneLine = text.replace(/[\r\n]+/g, " ").trim();
  return oneLine.length > MAX_LOG_BODY_CHARS
    ? oneLine.slice(0, MAX_LOG_BODY_CHARS) + "…[truncated]"
    : oneLine;
}

export function jsonResponse(
  request: Request,
  status: number,
  body: unknown,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...buildCorsHeaders(request, CORS_OPTS),
    },
  });
}

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

// ─── GitHub App JWT ───────────────────────────────────────────────────────────

function signAppJwt(appId: string, privateKeyPem: string): string {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - APP_JWT_SKEW_SEC,
    exp: now + APP_JWT_TTL_SEC,
    iss: appId,
  };
  const encode = (obj: unknown) =>
    base64url(Buffer.from(JSON.stringify(obj), "utf8"));
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const key = createPrivateKey({ key: privateKeyPem, format: "pem" });
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(key);
  return `${signingInput}.${base64url(signature)}`;
}

// ─── Installation Credential ──────────────────────────────────────────────────

let cachedInstallCred: CachedInstallCred | null = null;

export async function getInstallationCred(): Promise<string> {
  if (
    cachedInstallCred &&
    Date.now() - cachedInstallCred.fetchedAt < INSTALL_TOKEN_TTL_MS
  ) {
    return cachedInstallCred.value;
  }

  const appId = process.env.KUBESTELLAR_CONSOLE_APP_ID;
  const installationId = process.env.KUBESTELLAR_CONSOLE_APP_INSTALLATION_ID;
  const privateKey = process.env.KUBESTELLAR_CONSOLE_APP_PRIVATE_KEY;
  if (!appId || !installationId || !privateKey) {
    throw new Error("App credentials not configured in Netlify env");
  }

  const jwt = signAppJwt(appId, privateKey);
  const resp = await fetch(
    `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "KubeStellar-Console-FeedbackApp",
      },
      signal: AbortSignal.timeout(GH_TIMEOUT_MS),
    },
  );

  if (!resp.ok) {
    const txt = await resp.text();
    const reqId = Date.now();
    console.error(`[feedback-app] installation credential exchange failed (req=${reqId}): HTTP ${resp.status} — ${sanitizeUpstreamError(txt)}`);
    throw new Error(`Upstream service error (req=${reqId})`);
  }
  const data = (await resp.json()) as { token: string };
  cachedInstallCred = { value: data.token, fetchedAt: Date.now() };
  return data.token;
}

// ─── Client Auth Verification ─────────────────────────────────────────────────

export async function verifyClientAuth(
  credential: string,
): Promise<{ login: string; id: number }> {
  const clientId = process.env.CONSOLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.CONSOLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("OAuth app credentials not configured in Netlify env");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );
  const resp = await fetch(
    `${GITHUB_API}/applications/${clientId}/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "KubeStellar-Console-FeedbackApp",
      },
      body: JSON.stringify({ access_token: credential }),
      signal: AbortSignal.timeout(GH_TIMEOUT_MS),
    },
  );
  if (resp.status === 404 || resp.status === 422) {
    throw new Error("credential not issued by console OAuth app");
  }
  if (!resp.ok) {
    throw new Error(`introspection HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as {
    user?: { login?: string; id?: number };
  };
  if (!data.user?.login || typeof data.user.id !== "number") {
    throw new Error("introspection response missing user");
  }
  const user = { login: data.user.login, id: data.user.id };

  // Confirm the token still works against /user (catches revoked tokens)
  const liveResp = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "KubeStellar-Console-FeedbackApp",
    },
    signal: AbortSignal.timeout(GH_TIMEOUT_MS),
  });
  if (!liveResp.ok) {
    throw new Error(`liveness check HTTP ${liveResp.status}`);
  }

  return user;
}

// ─── Repository Permissions ───────────────────────────────────────────────────

export async function getRepoPermissions(
  credential: string,
  repoSlug: string,
): Promise<{ push: boolean }> {
  const resp = await fetch(`${GITHUB_API}/repos/${repoSlug}`, {
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "KubeStellar-Console-FeedbackApp",
    },
    signal: AbortSignal.timeout(GH_TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`repo permissions HTTP ${resp.status}`);
  }
  const data = (await resp.json()) as { permissions?: { push?: boolean } };
  return { push: data.permissions?.push === true };
}

// ─── Sub-Issue Linking ────────────────────────────────────────────────────────

export async function addSubIssue(
  installCred: string,
  repoSlug: string,
  parentIssueNumber: number,
  subIssueId: number,
): Promise<void> {
  const resp = await fetch(
    `${GITHUB_API}/repos/${repoSlug}/issues/${parentIssueNumber}/sub_issues`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${installCred}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        "Content-Type": "application/json",
        "User-Agent": "KubeStellar-Console-FeedbackApp",
      },
      body: JSON.stringify({ sub_issue_id: subIssueId }),
      signal: AbortSignal.timeout(GH_TIMEOUT_MS),
    },
  );
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`sub-issue link HTTP ${resp.status}: ${txt}`);
  }
}
