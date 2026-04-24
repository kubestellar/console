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
  methods: "POST, OPTIONS",
  headers: `Content-Type, ${CLIENT_AUTH_HEADER}`,
} as const;

interface IssueRequest {
  repoOwner: string;
  repoName: string;
  title: string;
  body: string;
  labels?: string[];
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

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return handlePreflight(request, CORS_OPTS);
  }
  if (request.method !== "POST") {
    return jsonResponse(request, 405, { error: "Method not allowed" });
  }

  const clientAuth = request.headers.get(CLIENT_AUTH_HEADER);
  if (!clientAuth) {
    return jsonResponse(request, 401, { error: "Missing client credential" });
  }

  let payload: IssueRequest;
  try {
    payload = (await request.json()) as IssueRequest;
  } catch {
    return jsonResponse(request, 400, { error: "Invalid JSON body" });
  }
  if (!payload.repoOwner || !payload.repoName || !payload.title || !payload.body) {
    return jsonResponse(request, 400, { error: "repoOwner, repoName, title, body required" });
  }

  const repoSlug = `${payload.repoOwner}/${payload.repoName}`;
  if (!ALLOWED_REPOS.has(repoSlug)) {
    return jsonResponse(request, 403, { error: `Repo ${repoSlug} not allowed` });
  }

  let user: { login: string; id: number };
  try {
    user = await verifyClientAuth(clientAuth);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse(request, 401, { error: `Client auth invalid: ${msg}` });
  }

  let installCred: string;
  try {
    installCred = await getInstallationCred();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse(request, 502, { error: `App credential unavailable: ${msg}` });
  }

  // Footer proves which GitHub user the proxy authenticated. Localhost
  // users can't forge this because the login comes from GitHub's own
  // /user response against their client credential.
  const stampedBody = `${payload.body}\n\n---\n*Submitted by @${user.login} via KubeStellar Console (proxied by \`kubestellar-console-bot\`).*`;

  const issuePayload: Record<string, unknown> = {
    title: payload.title,
    body: stampedBody,
  };
  if (payload.labels && payload.labels.length > 0) {
    issuePayload.labels = payload.labels;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GH_TIMEOUT_MS);
  try {
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
      return jsonResponse(request, resp.status, {
        error: `GitHub issue create failed: ${txt}`,
      });
    }
    const data = (await resp.json()) as { number: number; html_url: string };
    return jsonResponse(request, 200, {
      number: data.number,
      html_url: data.html_url,
      submitter: user.login,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse(request, 502, { error: `Issue creation failed: ${msg}` });
  } finally {
    clearTimeout(timeout);
  }
}
