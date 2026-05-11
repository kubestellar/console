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
 * The client credential passed in `X-KC-Client-Auth` is stored on
 * the user's device under an opaque key and obfuscated at rest so
 * it is not obviously readable from DevTools storage panels. The
 * obfuscation is not cryptographic — the real security property is
 * that the credential is a per-user bearer token GitHub can revoke
 * and that we verify it against GitHub on every call.
 *
 * Request:
 *   POST /api/feedback-app
 *   Headers:
 *     X-KC-Client-Auth: <per-user credential>
 *     Content-Type:     application/json
 *   Body:
 *     {
 *       "repoOwner": "kubestellar",
 *       "repoName":  "console",
 *       "title":     "...",
 *       "body":      "...",
 *       "labels":    ["bug", ...]
 *     }
 *
 * Response:
 *   200 { "number": 1234, "html_url": "..." }
 *   401 if the client credential is invalid or revoked
 *   403 if caller tries a repo outside the allow-list
 *   5xx on GitHub or signing errors
 *
 * Required Netlify env vars:
 *   KUBESTELLAR_CONSOLE_APP_ID
 *   KUBESTELLAR_CONSOLE_APP_INSTALLATION_ID
 *   KUBESTELLAR_CONSOLE_APP_PRIVATE_KEY   (PEM, PKCS#1 or PKCS#8)
 */

import { createPrivateKey, createSign } from "node:crypto";
import { buildCorsHeaders, handlePreflight } from "./_shared/cors";

const GITHUB_API = "https://api.github.com";
/** Only issues on these repos may be created via the proxy. */
const ALLOWED_REPOS = new Set([
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
const GH_TIMEOUT_MS = 20_000;
/** Non-obvious header name for the per-user client credential. */
const CLIENT_AUTH_HEADER = "x-kc-client-auth";

// See web/netlify/functions/_shared/cors.ts for allowlist rationale (#9879).
const CORS_OPTS = {
  methods: "GET, POST, OPTIONS",
  headers: `Content-Type, ${CLIENT_AUTH_HEADER}`,
} as const;

type FeedbackAppAction = "create_issue" | "comment_issue" | "update_issue_state";

interface IssueRequest {
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

let cachedInstallCred: CachedInstallCred | null = null;

function jsonResponse(
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

async function getInstallationCred(): Promise<string> {
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GH_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch(
      `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "KubeStellar-Console-FeedbackApp",
        },
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`installation credential exchange HTTP ${resp.status}: ${txt}`);
  }
  const data = (await resp.json()) as { token: string };
  cachedInstallCred = { value: data.token, fetchedAt: Date.now() };
  return data.token;
}

async function verifyClientAuth(
  credential: string,
): Promise<{ login: string; id: number }> {
  // Step 1: confirm the credential was issued BY the console's OAuth
  // App. GitHub's token-introspection endpoint uses Basic auth with
  // the OAuth app's client_id:client_secret and returns the token's
  // metadata if (and only if) the token belongs to that app. Without
  // this check, anyone could present a valid-but-unrelated GitHub
  // token (a PAT, a different app's OAuth token) and look legitimate.
  const clientId = process.env.CONSOLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.CONSOLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("OAuth app credentials not configured in Netlify env");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );
  const introspectController = new AbortController();
  const introspectTimeout = setTimeout(
    () => introspectController.abort(),
    GH_TIMEOUT_MS,
  );
  let user: { login: string; id: number };
  try {
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
        signal: introspectController.signal,
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
    user = { login: data.user.login, id: data.user.id };
  } finally {
    clearTimeout(introspectTimeout);
  }

  // Step 2: confirm the token still works against /user. Introspection
  // can succeed for a token that was later revoked by the user; /user
  // fails in that case. This is cheap and catches the race.
  const liveController = new AbortController();
  const liveTimeout = setTimeout(() => liveController.abort(), GH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${GITHUB_API}/user`, {
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "KubeStellar-Console-FeedbackApp",
      },
      signal: liveController.signal,
    });
    if (!resp.ok) {
      throw new Error(`liveness check HTTP ${resp.status}`);
    }
  } finally {
    clearTimeout(liveTimeout);
  }

  return user;
}

async function getRepoPermissions(
  credential: string,
  repoSlug: string,
): Promise<{ push: boolean }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${GITHUB_API}/repos/${repoSlug}`, {
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "KubeStellar-Console-FeedbackApp",
      },
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new Error(`repo permissions HTTP ${resp.status}`);
    }
    const data = (await resp.json()) as { permissions?: { push?: boolean } };
    return { push: data.permissions?.push === true };
  } finally {
    clearTimeout(timeout);
  }
}

async function addSubIssue(
  installCred: string,
  repoSlug: string,
  parentIssueNumber: number,
  subIssueId: number,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GH_TIMEOUT_MS);
  try {
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
        signal: controller.signal,
      },
    );
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`sub-issue link HTTP ${resp.status}: ${txt}`);
    }
  } finally {
    clearTimeout(timeout);
  }
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
    try {
      payload = (await request.json()) as IssueRequest;
    } catch {
      return jsonResponse(request, 400, { error: "Invalid JSON body" });
    }
    if (!payload.repoOwner || !payload.repoName) {
      return jsonResponse(request, 400, { error: "repoOwner and repoName are required" });
    }

    action = payload.action ?? "create_issue";
    if (action === "create_issue" && (!payload.title || !payload.body)) {
      return jsonResponse(request, 400, { error: "title and body are required for issue creation" });
    }
    if ((action === "comment_issue" || action === "update_issue_state") && typeof payload.issueNumber !== "number") {
      return jsonResponse(request, 400, { error: "issueNumber is required for this action" });
    }
    if (action === "comment_issue" && !payload.body) {
      return jsonResponse(request, 400, { error: "body is required for issue comments" });
    }
    if (action === "update_issue_state" && payload.state !== "open" && payload.state !== "closed") {
      return jsonResponse(request, 400, { error: "state must be 'open' or 'closed'" });
    }
  }

  const repoOwner = payload?.repoOwner ?? url.searchParams.get("repoOwner") ?? "";
  const repoName = payload?.repoName ?? url.searchParams.get("repoName") ?? "";
  if (!repoOwner || !repoName) {
    return jsonResponse(request, 400, { error: "repoOwner and repoName required" });
  }

  const repoSlug = `${repoOwner}/${repoName}`;
  if (!ALLOWED_REPOS.has(repoSlug)) {
    return jsonResponse(request, 403, { error: `Repo ${repoSlug} not allowed` });
  }

  let user: { login: string; id: number };
  try {
    user = await verifyClientAuth(clientAuth);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[feedback-app] Client auth failed:", msg);
    return jsonResponse(request, 401, { error: "Client authentication failed" });
  }

  if (request.method === "GET" || mode === "capabilities") {
    try {
      const permissions = await getRepoPermissions(clientAuth, repoSlug);
      return jsonResponse(request, 200, { can_link_parent: permissions.push });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[feedback-app] Repo capability check failed:", msg);
      return jsonResponse(request, 502, { error: "Repository capability check failed" });
    }
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
  const issueRequest = payload;

  // Footer proves which GitHub user the proxy authenticated. Localhost
  // users can't forge this because the login comes from GitHub's own
  // /user response against their client credential.
  const stampedBody = issueRequest.body
    ? `${issueRequest.body}\n\n---\n*Submitted by @${user.login} via KubeStellar Console (proxied by \`kubestellar-console-bot\`).*`
    : "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GH_TIMEOUT_MS);
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
          signal: controller.signal,
        },
      );
      if (!resp.ok) {
        const txt = await resp.text();
        console.error("[feedback-app] GitHub issue comment failed:", resp.status, txt);
        return jsonResponse(request, resp.status, {
          error: "Failed to add comment to issue",
        });
      }
      const data = (await resp.json()) as { html_url: string };
      return jsonResponse(request, 200, {
        html_url: data.html_url,
        submitter: user.login,
      });
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
          signal: controller.signal,
        },
      );
      if (!resp.ok) {
        const txt = await resp.text();
        console.error("[feedback-app] GitHub issue update failed:", resp.status, txt);
        return jsonResponse(request, resp.status, {
          error: "Failed to update issue state",
        });
      }
      const data = (await resp.json()) as { html_url: string; state: string };
      return jsonResponse(request, 200, {
        html_url: data.html_url,
        state: data.state,
        submitter: user.login,
      });
    }

    const issuePayload: Record<string, unknown> = {
      title: payload.title,
      body: stampedBody,
    };
    if (payload.labels && payload.labels.length > 0) {
      issuePayload.labels = payload.labels;
    }

    const resp = await fetch(
      `${GITHUB_API}/repos/${repoSlug}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${installCred}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "KubeStellar-Console-FeedbackApp",
        },
        body: JSON.stringify(issuePayload),
        signal: controller.signal,
      },
    );
    if (!resp.ok) {
      const txt = await resp.text();
      console.error("[feedback-app] GitHub issue create failed:", resp.status, txt);
      return jsonResponse(request, resp.status, {
        error: "Failed to create issue",
      });
    }
    const data = (await resp.json()) as { id: number; number: number; html_url: string };
    let warning: string | undefined;
    if (typeof issueRequest.parentIssueNumber === "number" && issueRequest.parentIssueNumber > 0) {
      try {
        const permissions = await getRepoPermissions(clientAuth, repoSlug);
        if (!permissions.push) {
          warning = `Issue #${data.number} was created, but parent issue linking requires push access to ${repoSlug}.`;
        } else {
          await addSubIssue(installCred, repoSlug, issueRequest.parentIssueNumber, data.id);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warning = `Issue #${data.number} was created, but it could not be linked to parent issue #${issueRequest.parentIssueNumber}: ${msg}`;
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
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse(request, 502, { error: `Feedback action failed: ${msg}` });
  } finally {
    clearTimeout(timeout);
  }
}
