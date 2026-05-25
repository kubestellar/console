/**
 * Vitest unit tests for feedback-app.mts Netlify function (#15621, Part of #4189).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertResponseHasNoSecrets,
  makeNetlifyRequest,
  readJson,
} from "./netlify-handler-helpers";

// Named constants for HTTP status codes to avoid magic numbers
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_CREATED = 201;
const HTTP_STATUS_NO_CONTENT = 204;
const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_METHOD_NOT_ALLOWED = 405;
const HTTP_STATUS_REQUEST_TOO_LARGE = 413;
const HTTP_STATUS_RATE_LIMITED = 429;
const HTTP_STATUS_BAD_GATEWAY = 502;

// Hoisted mock functions for feedback-helpers
const {
  mockVerifyClientAuth,
  mockGetInstallationCred,
  mockGetRepoPermissions,
  mockAddSubIssue,
} = vi.hoisted(() => ({
  mockVerifyClientAuth: vi.fn(),
  mockGetInstallationCred: vi.fn(),
  mockGetRepoPermissions: vi.fn(),
  mockAddSubIssue: vi.fn(),
}));

vi.mock("../_shared/feedback-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_shared/feedback-helpers")>();
  return {
    ...actual,
    verifyClientAuth: mockVerifyClientAuth,
    getInstallationCred: mockGetInstallationCred,
    getRepoPermissions: mockGetRepoPermissions,
    addSubIssue: mockAddSubIssue,
  };
});

// Hoisted mock functions for rate limit
const { mockEnforceSimpleRateLimit } = vi.hoisted(() => ({
  mockEnforceSimpleRateLimit: vi.fn(),
}));

vi.mock("../_shared/rate-limit", () => ({
  enforceSimpleRateLimit: mockEnforceSimpleRateLimit,
}));

import handler from "../feedback-app.mts";

describe("feedback-app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnforceSimpleRateLimit.mockResolvedValue({ limited: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // CORS preflight and methods validations
  it("returns 204 for OPTIONS preflight", async () => {
    const res = await handler(
      makeNetlifyRequest("/feedback-app", { method: "OPTIONS" })
    );
    expect(res.status).toBe(HTTP_STATUS_NO_CONTENT);
  });

  it("returns 405 for non-GET/POST methods", async () => {
    const res = await handler(
      makeNetlifyRequest("/feedback-app", { method: "PUT" })
    );
    expect(res.status).toBe(HTTP_STATUS_METHOD_NOT_ALLOWED);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("Method not allowed");
  });

  // Authentication checks
  it("returns 401 when x-kc-client-auth header is missing", async () => {
    const res = await handler(
      makeNetlifyRequest("/feedback-app", {
        method: "GET",
        headers: {},
      })
    );
    expect(res.status).toBe(HTTP_STATUS_UNAUTHORIZED);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("Missing client credential");
  });

  it("returns 401 when client auth fails", async () => {
    mockVerifyClientAuth.mockRejectedValue(new Error("Invalid token"));
    const res = await handler(
      makeNetlifyRequest("/feedback-app", {
        method: "GET",
        headers: { "x-kc-client-auth": "invalid_auth_token" },
        search: "repoOwner=kubestellar&repoName=console",
      })
    );
    expect(res.status).toBe(HTTP_STATUS_UNAUTHORIZED);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("Client authentication failed");
  });

  // Repository Allowlist constraints
  it("returns 403 when repository is not in allowlist", async () => {
    mockVerifyClientAuth.mockResolvedValue({ login: "user1", id: 1234 });
    const res = await handler(
      makeNetlifyRequest("/feedback-app", {
        method: "GET",
        headers: { "x-kc-client-auth": "valid_token" },
        search: "repoOwner=malicious&repoName=repo",
      })
    );
    expect(res.status).toBe(HTTP_STATUS_FORBIDDEN);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("Repository not allowed");
  });

  // Body and input validation checks
  it("returns 413 for oversized request body based on content-length header", async () => {
    mockVerifyClientAuth.mockResolvedValue({ login: "user1", id: 1234 });
    const hugeLength = 200_000;
    const res = await handler(
      makeNetlifyRequest("/feedback-app", {
        method: "POST",
        headers: {
          "x-kc-client-auth": "valid_token",
          "content-length": String(hugeLength),
        },
      })
    );
    expect(res.status).toBe(HTTP_STATUS_REQUEST_TOO_LARGE);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("Request body too large");
  });

  it("returns 413 when request body text is oversized", async () => {
    mockVerifyClientAuth.mockResolvedValue({ login: "user1", id: 1234 });
    const largeBodyText = "a".repeat(102_401);
    const req = new Request("https://example.test/feedback-app", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5174",
        "x-kc-client-auth": "valid_token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repoOwner: "kubestellar",
        repoName: "console",
        title: "Test",
        body: largeBodyText,
      }),
    });
    const res = await handler(req);
    expect(res.status).toBe(HTTP_STATUS_REQUEST_TOO_LARGE);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("Request body too large");
  });

  it("returns 400 when title is missing in create_issue action", async () => {
    mockVerifyClientAuth.mockResolvedValue({ login: "user1", id: 1234 });
    const req = new Request("https://example.test/feedback-app", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5174",
        "x-kc-client-auth": "valid_token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repoOwner: "kubestellar",
        repoName: "console",
        action: "create_issue",
        body: "Some body",
      }),
    });
    const res = await handler(req);
    expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toContain("title and body are required");
  });

  it("returns 400 when action field is invalid", async () => {
    mockVerifyClientAuth.mockResolvedValue({ login: "user1", id: 1234 });
    const req = new Request("https://example.test/feedback-app", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5174",
        "x-kc-client-auth": "valid_token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repoOwner: "kubestellar",
        repoName: "console",
        action: "invalid_action",
      }),
    });
    const res = await handler(req);
    expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toContain("action must be one of");
  });

  // Rate Limiting checks
  it("returns 429 when rate limit is exceeded", async () => {
    mockVerifyClientAuth.mockResolvedValue({ login: "user1", id: 1234 });
    mockEnforceSimpleRateLimit.mockResolvedValue({ limited: true, retryAfterSeconds: 300 });

    const req = new Request("https://example.test/feedback-app", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5174",
        "x-kc-client-auth": "valid_token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repoOwner: "kubestellar",
        repoName: "console",
        title: "Test",
        body: "Some body",
      }),
    });
    const res = await handler(req);
    expect(res.status).toBe(HTTP_STATUS_RATE_LIMITED);
    const body = await readJson<{ error: string; retryAfter: number }>(res);
    expect(body.error).toBe("Rate limit exceeded");
    expect(body.retryAfter).toBe(300);
  });

  // Valid Action scenarios: create_issue
  it("creates issue successfully without parent link", async () => {
    mockVerifyClientAuth.mockResolvedValue({ login: "user1", id: 1234 });
    mockGetInstallationCred.mockResolvedValue("mock_install_token");

    const expectedIssueId = 9999;
    const expectedIssueNumber = 42;
    const expectedHtmlUrl = "https://github.com/kubestellar/console/issues/42";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: expectedIssueId,
          number: expectedIssueNumber,
          html_url: expectedHtmlUrl,
        }),
        {
          status: HTTP_STATUS_CREATED,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("https://example.test/feedback-app", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5174",
        "x-kc-client-auth": "valid_token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repoOwner: "kubestellar",
        repoName: "console",
        action: "create_issue",
        title: "Test Issue",
        body: "Issue content description",
      }),
    });
    const res = await handler(req);
    expect(res.status).toBe(HTTP_STATUS_OK);
    const body = await readJson<{ id: number; number: number; html_url: string; submitter: string }>(res);
    expect(body.id).toBe(expectedIssueId);
    expect(body.number).toBe(expectedIssueNumber);
    expect(body.html_url).toBe(expectedHtmlUrl);
    expect(body.submitter).toBe("user1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCallUrl = fetchMock.mock.calls[0][0];
    const firstCallInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(firstCallUrl).toBe("https://api.github.com/repos/kubestellar/console/issues");
    expect(firstCallInit.method).toBe("POST");
    expect(firstCallInit.headers).toMatchObject({
      Authorization: "Bearer mock_install_token",
    });
    const sentBody = JSON.parse(firstCallInit.body as string);
    expect(sentBody.title).toBe("Test Issue");
    expect(sentBody.body).toContain("Issue content description");
    expect(sentBody.body).toContain("Submitted by @user1 via KubeStellar Console");
  });

  it("creates issue and links to parent when user has push permissions", async () => {
    mockVerifyClientAuth.mockResolvedValue({ login: "user1", id: 1234 });
    mockGetInstallationCred.mockResolvedValue("mock_install_token");
    mockGetRepoPermissions.mockResolvedValue({ push: true });

    const expectedIssueId = 9999;
    const expectedIssueNumber = 42;
    const expectedHtmlUrl = "https://github.com/kubestellar/console/issues/42";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: expectedIssueId,
          number: expectedIssueNumber,
          html_url: expectedHtmlUrl,
        }),
        {
          status: HTTP_STATUS_CREATED,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("https://example.test/feedback-app", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5174",
        "x-kc-client-auth": "valid_token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repoOwner: "kubestellar",
        repoName: "console",
        action: "create_issue",
        title: "Test Issue",
        body: "Issue content",
        parentIssueNumber: 100,
      }),
    });
    const res = await handler(req);
    expect(res.status).toBe(HTTP_STATUS_OK);
    const body = await readJson<{ id: number; number: number; html_url: string; warning?: string }>(res);
    expect(body.id).toBe(expectedIssueId);
    expect(body.warning).toBeUndefined();

    expect(mockGetRepoPermissions).toHaveBeenCalledWith("valid_token", "kubestellar/console");
    expect(mockAddSubIssue).toHaveBeenCalledWith("mock_install_token", "kubestellar/console", 100, expectedIssueId);
  });

  it("creates issue and returns warning if parent issue link is attempted but user has no push permissions", async () => {
    mockVerifyClientAuth.mockResolvedValue({ login: "user1", id: 1234 });
    mockGetInstallationCred.mockResolvedValue("mock_install_token");
    mockGetRepoPermissions.mockResolvedValue({ push: false });

    const expectedIssueId = 9999;
    const expectedIssueNumber = 42;
    const expectedHtmlUrl = "https://github.com/kubestellar/console/issues/42";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: expectedIssueId,
          number: expectedIssueNumber,
          html_url: expectedHtmlUrl,
        }),
        {
          status: HTTP_STATUS_CREATED,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("https://example.test/feedback-app", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5174",
        "x-kc-client-auth": "valid_token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repoOwner: "kubestellar",
        repoName: "console",
        action: "create_issue",
        title: "Test Issue",
        body: "Issue content",
        parentIssueNumber: 100,
      }),
    });
    const res = await handler(req);
    expect(res.status).toBe(HTTP_STATUS_OK);
    const body = await readJson<{ id: number; number: number; html_url: string; warning?: string }>(res);
    expect(body.warning).toContain("parent issue linking requires push access");
    expect(mockAddSubIssue).not.toHaveBeenCalled();
  });

  // Valid Action scenarios: comment_issue
  it("adds comment to issue successfully", async () => {
    mockVerifyClientAuth.mockResolvedValue({ login: "user2", id: 5678 });
    mockGetInstallationCred.mockResolvedValue("mock_install_token");

    const expectedHtmlUrl = "https://github.com/kubestellar/console/issues/42#issuecomment-123456";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          html_url: expectedHtmlUrl,
        }),
        {
          status: HTTP_STATUS_CREATED,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("https://example.test/feedback-app", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5174",
        "x-kc-client-auth": "valid_token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repoOwner: "kubestellar",
        repoName: "console",
        action: "comment_issue",
        issueNumber: 42,
        body: "Adding a new comment",
      }),
    });
    const res = await handler(req);
    expect(res.status).toBe(HTTP_STATUS_OK);
    const body = await readJson<{ html_url: string; submitter: string }>(res);
    expect(body.html_url).toBe(expectedHtmlUrl);
    expect(body.submitter).toBe("user2");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCallUrl = fetchMock.mock.calls[0][0];
    const firstCallInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(firstCallUrl).toBe("https://api.github.com/repos/kubestellar/console/issues/42/comments");
    expect(firstCallInit.method).toBe("POST");
    const sentBody = JSON.parse(firstCallInit.body as string);
    expect(sentBody.body).toContain("Adding a new comment");
    expect(sentBody.body).toContain("Submitted by @user2 via KubeStellar Console");
  });

  // Valid Action scenarios: update_issue_state
  it("updates issue state successfully", async () => {
    mockVerifyClientAuth.mockResolvedValue({ login: "user3", id: 8901 });
    mockGetInstallationCred.mockResolvedValue("mock_install_token");

    const expectedHtmlUrl = "https://github.com/kubestellar/console/issues/42";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          html_url: expectedHtmlUrl,
          state: "closed",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("https://example.test/feedback-app", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5174",
        "x-kc-client-auth": "valid_token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repoOwner: "kubestellar",
        repoName: "console",
        action: "update_issue_state",
        issueNumber: 42,
        state: "closed",
      }),
    });
    const res = await handler(req);
    expect(res.status).toBe(HTTP_STATUS_OK);
    const body = await readJson<{ html_url: string; state: string; submitter: string }>(res);
    expect(body.html_url).toBe(expectedHtmlUrl);
    expect(body.state).toBe("closed");
    expect(body.submitter).toBe("user3");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCallUrl = fetchMock.mock.calls[0][0];
    const firstCallInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(firstCallUrl).toBe("https://api.github.com/repos/kubestellar/console/issues/42");
    expect(firstCallInit.method).toBe("PATCH");
    const sentBody = JSON.parse(firstCallInit.body as string);
    expect(sentBody.state).toBe("closed");
  });

  // Capabilities checking (GET mode)
  it("checks capabilities and returns can_link_parent true when user has push permissions", async () => {
    mockVerifyClientAuth.mockResolvedValue({ login: "user1", id: 1234 });
    mockGetRepoPermissions.mockResolvedValue({ push: true });

    const res = await handler(
      makeNetlifyRequest("/feedback-app", {
        method: "GET",
        headers: { "x-kc-client-auth": "valid_token" },
        search: "repoOwner=kubestellar&repoName=console",
      })
    );
    expect(res.status).toBe(HTTP_STATUS_OK);
    const body = await readJson<{ can_link_parent: boolean }>(res);
    expect(body.can_link_parent).toBe(true);
    expect(mockGetRepoPermissions).toHaveBeenCalledWith("valid_token", "kubestellar/console");
  });

  // Security sanitization and error handling checks
  it("handles GitHub API 4xx/5xx responses safely without leaking credentials", async () => {
    mockVerifyClientAuth.mockResolvedValue({ login: "user1", id: 1234 });
    mockGetInstallationCred.mockResolvedValue("mock_install_token");

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("Invalid token mock_install_token or something else", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("https://example.test/feedback-app", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5174",
        "x-kc-client-auth": "valid_token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repoOwner: "kubestellar",
        repoName: "console",
        action: "create_issue",
        title: "Test Issue",
        body: "Issue content",
      }),
    });
    const res = await handler(req);
    expect(res.status).toBe(HTTP_STATUS_BAD_REQUEST);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("Failed to create issue");
    assertResponseHasNoSecrets(JSON.stringify(body), ["mock_install_token", "valid_token"]);
  });

  it("handles native fetch rejection safely returning 502 without leaking credentials", async () => {
    mockVerifyClientAuth.mockResolvedValue({ login: "user1", id: 1234 });
    mockGetInstallationCred.mockResolvedValue("mock_install_token");

    const fetchMock = vi.fn().mockRejectedValue(new Error("Native fetch failed with mock_install_token"));
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("https://example.test/feedback-app", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5174",
        "x-kc-client-auth": "valid_token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repoOwner: "kubestellar",
        repoName: "console",
        action: "create_issue",
        title: "Test Issue",
        body: "Issue content",
      }),
    });
    const res = await handler(req);
    expect(res.status).toBe(HTTP_STATUS_BAD_GATEWAY);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("Feedback action failed");
    assertResponseHasNoSecrets(JSON.stringify(body), ["mock_install_token", "valid_token"]);
  });
});
