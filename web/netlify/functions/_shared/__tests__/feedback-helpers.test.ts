import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const APP_PRIVATE_KEY = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const CLIENT_ID = "console-client-id";
const CLIENT_SECRET = "console-client-secret";
const APP_ID = "12345";
const INSTALLATION_ID = "67890";
const INSTALL_TOKEN = "ghs_install_token";
const USER_TOKEN = "oauth-user-token";
const TEST_URL = "https://example.test/api/feedback-app";

async function loadModule() {
  vi.resetModules();
  return import("../feedback-helpers");
}

describe("feedback helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.KUBESTELLAR_CONSOLE_APP_ID = APP_ID;
    process.env.KUBESTELLAR_CONSOLE_APP_INSTALLATION_ID = INSTALLATION_ID;
    process.env.KUBESTELLAR_CONSOLE_APP_PRIVATE_KEY = APP_PRIVATE_KEY;
    process.env.CONSOLE_OAUTH_CLIENT_ID = CLIENT_ID;
    process.env.CONSOLE_OAUTH_CLIENT_SECRET = CLIENT_SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.KUBESTELLAR_CONSOLE_APP_ID;
    delete process.env.KUBESTELLAR_CONSOLE_APP_INSTALLATION_ID;
    delete process.env.KUBESTELLAR_CONSOLE_APP_PRIVATE_KEY;
    delete process.env.CONSOLE_OAUTH_CLIENT_ID;
    delete process.env.CONSOLE_OAUTH_CLIENT_SECRET;
  });

  it("validates issue request payloads and exposes stable shared constants", async () => {
    const module = await loadModule();

    expect(module.ALLOWED_REPOS.has("kubestellar/console")).toBe(true);
    expect(module.ALLOWED_REPOS.has("kubestellar/docs")).toBe(true);
    expect(module.CLIENT_AUTH_HEADER).toBe("x-kc-client-auth");
    expect(module.CORS_OPTS.headers).toContain(module.CLIENT_AUTH_HEADER);

    expect(module.validateIssueRequest(null)).toEqual({
      ok: false,
      error: "Request body must be a JSON object",
    });
    expect(module.validateIssueRequest({
      repoOwner: "kubestellar",
      repoName: "console",
      title: "Need tests",
      body: "Please add tests",
    })).toEqual({
      ok: true,
      value: {
        action: "create_issue",
        repoOwner: "kubestellar",
        repoName: "console",
        title: "Need tests",
        body: "Please add tests",
      },
    });
    expect(module.validateIssueRequest({
      action: "comment_issue",
      repoOwner: "kubestellar",
      repoName: "console",
    })).toEqual({
      ok: false,
      error: "issueNumber is required for this action",
    });
    expect(module.validateIssueRequest({
      action: "update_issue_state",
      repoOwner: "kubestellar",
      repoName: "console",
      issueNumber: 10,
      state: "closed",
    })).toEqual({
      ok: true,
      value: {
        action: "update_issue_state",
        repoOwner: "kubestellar",
        repoName: "console",
        issueNumber: 10,
        state: "closed",
      },
    });
  });

  it("builds JSON responses with CORS headers and sanitizes upstream errors", async () => {
    const module = await loadModule();
    const request = new Request(TEST_URL, { headers: { Origin: "http://localhost:5174" } });

    const response = module.jsonResponse(request, 201, { ok: true });
    expect(response.status).toBe(201);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5174");
    await expect(response.json()).resolves.toEqual({ ok: true });

    const sanitized = module.sanitizeUpstreamError(`${"line\n".repeat(60)}tail`);
    expect(sanitized).not.toContain("\n");
    expect(sanitized).toContain("…[truncated]");
  });

  it("fetches and caches a GitHub App installation credential", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      token: INSTALL_TOKEN,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const module = await loadModule();

    const first = await module.getInstallationCred();
    const second = await module.getInstallationCred();

    expect(first).toBe(INSTALL_TOKEN);
    expect(second).toBe(INSTALL_TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens`,
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Accept: "application/vnd.github+json",
      "User-Agent": "KubeStellar-Console-FeedbackApp",
    });
    expect(String(fetchMock.mock.calls[0]?.[1]?.headers?.Authorization)).toMatch(/^Bearer [A-Za-z0-9._-]+$/);
  });

  it("verifies client credentials via introspection and liveness checks", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        user: { login: "octocat", id: 7 },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const module = await loadModule();

    const user = await module.verifyClientAuth(USER_TOKEN);

    expect(user).toEqual({ login: "octocat", id: 7 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `https://api.github.com/applications/${CLIENT_ID}/token`,
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ access_token: USER_TOKEN }));
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("https://api.github.com/user");
  });

  it("surfaces invalid client credentials and missing app credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("missing", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const module = await loadModule();

    await expect(module.verifyClientAuth(USER_TOKEN)).rejects.toThrow(
      "credential not issued by console OAuth app",
    );

    delete process.env.KUBESTELLAR_CONSOLE_APP_ID;
    await expect(module.getInstallationCred()).rejects.toThrow(
      "App credentials not configured in Netlify env",
    );
  });

  it("reads repo permissions and links sub-issues via GitHub", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ permissions: { pull: true, push: true, admin: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const module = await loadModule();

    await expect(module.getRepoPermissions(USER_TOKEN, "kubestellar/console")).resolves.toEqual({
      pull: true,
      push: true,
      admin: true,
    });
    await expect(module.addSubIssue(INSTALL_TOKEN, "kubestellar/console", 16109, 999)).resolves.toBeUndefined();

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.github.com/repos/kubestellar/console");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "https://api.github.com/repos/kubestellar/console/issues/16109/sub_issues",
    );
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ sub_issue_id: 999 }));
  });
});
