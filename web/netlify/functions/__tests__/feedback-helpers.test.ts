// @vitest-environment node
/**
 * Unit tests for the shared feedback-helpers module.
 *
 * Covers the pure/testable exports:
 * - validateIssueRequest (complex input validator, 30+ branches)
 * - sanitizeUpstreamError (log-safe truncation utility)
 * - constants (ALLOWED_REPOS, rate-limit values, etc.)
 */
import { describe, expect, it } from "vitest";

import {
  ALLOWED_REPOS,
  CLIENT_AUTH_HEADER,
  FEEDBACK_APP_AUTH_FAILURE_RATE_LIMIT_MAX_REQUESTS,
  FEEDBACK_APP_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS,
  FEEDBACK_APP_PRE_AUTH_RATE_LIMIT_MAX_REQUESTS,
  FEEDBACK_APP_PRE_AUTH_RATE_LIMIT_WINDOW_MS,
  FEEDBACK_APP_RATE_LIMIT_MAX_REQUESTS,
  FEEDBACK_APP_RATE_LIMIT_WINDOW_MS,
  GH_TIMEOUT_MS,
  GITHUB_API,
  RATE_LIMIT_STORE_NAME,
  sanitizeUpstreamError,
  validateIssueRequest,
} from "../_shared/feedback-helpers";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("feedback-helpers constants", () => {
  it("GITHUB_API points to api.github.com", () => {
    expect(GITHUB_API).toBe("https://api.github.com");
  });

  it("ALLOWED_REPOS contains expected repos", () => {
    expect(ALLOWED_REPOS.has("kubestellar/console")).toBe(true);
    expect(ALLOWED_REPOS.has("kubestellar/docs")).toBe(true);
    expect(ALLOWED_REPOS.size).toBe(2);
  });

  it("ALLOWED_REPOS rejects unknown repos", () => {
    expect(ALLOWED_REPOS.has("evil/repo")).toBe(false);
    expect(ALLOWED_REPOS.has("kubestellar/console-kb")).toBe(false);
  });

  it("rate limit constants are sensible", () => {
    expect(FEEDBACK_APP_RATE_LIMIT_MAX_REQUESTS).toBe(50);
    expect(FEEDBACK_APP_RATE_LIMIT_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
    expect(FEEDBACK_APP_PRE_AUTH_RATE_LIMIT_MAX_REQUESTS).toBe(10);
    expect(FEEDBACK_APP_PRE_AUTH_RATE_LIMIT_WINDOW_MS).toBe(60_000);
    expect(FEEDBACK_APP_AUTH_FAILURE_RATE_LIMIT_MAX_REQUESTS).toBe(5);
    expect(FEEDBACK_APP_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });

  it("GH_TIMEOUT_MS is 20 seconds", () => {
    expect(GH_TIMEOUT_MS).toBe(20_000);
  });

  it("CLIENT_AUTH_HEADER is a non-obvious header name", () => {
    expect(CLIENT_AUTH_HEADER).toBe("x-kc-client-auth");
  });

  it("RATE_LIMIT_STORE_NAME is defined", () => {
    expect(RATE_LIMIT_STORE_NAME).toBe("feedback-app-rate-limit");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// sanitizeUpstreamError
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("sanitizeUpstreamError", () => {
  it("returns short strings unchanged", () => {
    expect(sanitizeUpstreamError("Not Found")).toBe("Not Found");
  });

  it("replaces newlines with spaces", () => {
    expect(sanitizeUpstreamError("line1\nline2\r\nline3")).toBe(
      "line1 line2 line3",
    );
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeUpstreamError("  hello  ")).toBe("hello");
  });

  it("truncates strings longer than 200 chars", () => {
    const long = "x".repeat(300);
    const result = sanitizeUpstreamError(long);
    expect(result.length).toBeLessThan(300);
    expect(result).toContain("…[truncated]");
    // First 200 chars preserved
    expect(result.startsWith("x".repeat(200))).toBe(true);
  });

  it("does not truncate exactly 200 char strings", () => {
    const exact = "a".repeat(200);
    expect(sanitizeUpstreamError(exact)).toBe(exact);
  });

  it("handles empty string", () => {
    expect(sanitizeUpstreamError("")).toBe("");
  });

  it("collapses multiple newlines into single space", () => {
    expect(sanitizeUpstreamError("a\n\n\nb")).toBe("a b");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// validateIssueRequest — valid inputs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateIssueRequest — valid inputs", () => {
  it("accepts minimal create_issue request", () => {
    const result = validateIssueRequest({
      repoOwner: "kubestellar",
      repoName: "console",
      title: "Bug report",
      body: "Something broke",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.action).toBe("create_issue");
      expect(result.value.repoOwner).toBe("kubestellar");
      expect(result.value.repoName).toBe("console");
      expect(result.value.title).toBe("Bug report");
      expect(result.value.body).toBe("Something broke");
    }
  });

  it("accepts create_issue with all optional fields", () => {
    const result = validateIssueRequest({
      action: "create_issue",
      repoOwner: "kubestellar",
      repoName: "docs",
      title: "Feature request",
      body: "Please add X",
      labels: ["enhancement", "feedback"],
      parentIssueNumber: 42,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.labels).toEqual(["enhancement", "feedback"]);
      expect(result.value.parentIssueNumber).toBe(42);
    }
  });

  it("accepts comment_issue request", () => {
    const result = validateIssueRequest({
      action: "comment_issue",
      repoOwner: "kubestellar",
      repoName: "console",
      issueNumber: 123,
      body: "My comment",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.action).toBe("comment_issue");
      expect(result.value.issueNumber).toBe(123);
    }
  });

  it("accepts update_issue_state request", () => {
    const result = validateIssueRequest({
      action: "update_issue_state",
      repoOwner: "kubestellar",
      repoName: "console",
      issueNumber: 456,
      state: "closed",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.action).toBe("update_issue_state");
      expect(result.value.state).toBe("closed");
    }
  });

  it("defaults action to create_issue when not provided", () => {
    const result = validateIssueRequest({
      repoOwner: "kubestellar",
      repoName: "console",
      title: "Title",
      body: "Body",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.action).toBe("create_issue");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// validateIssueRequest — invalid inputs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateIssueRequest — invalid inputs", () => {
  it("rejects null", () => {
    const result = validateIssueRequest(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("JSON object");
  });

  it("rejects arrays", () => {
    const result = validateIssueRequest([1, 2, 3]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("JSON object");
  });

  it("rejects primitives", () => {
    expect(validateIssueRequest(42).ok).toBe(false);
    expect(validateIssueRequest("string").ok).toBe(false);
    expect(validateIssueRequest(true).ok).toBe(false);
  });

  it("rejects missing repoOwner", () => {
    const result = validateIssueRequest({
      repoName: "console",
      title: "x",
      body: "y",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("repoOwner");
  });

  it("rejects empty repoOwner", () => {
    const result = validateIssueRequest({
      repoOwner: "  ",
      repoName: "console",
      title: "x",
      body: "y",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("repoOwner");
  });

  it("rejects missing repoName", () => {
    const result = validateIssueRequest({
      repoOwner: "kubestellar",
      title: "x",
      body: "y",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("repoName");
  });

  it("rejects empty repoName", () => {
    const result = validateIssueRequest({
      repoOwner: "kubestellar",
      repoName: "",
      title: "x",
      body: "y",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("repoName");
  });

  it("rejects invalid action", () => {
    const result = validateIssueRequest({
      action: "delete_issue",
      repoOwner: "kubestellar",
      repoName: "console",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("action");
  });

  it("rejects non-string title", () => {
    const result = validateIssueRequest({
      repoOwner: "kubestellar",
      repoName: "console",
      title: 123,
      body: "text",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("title");
  });

  it("rejects non-string body", () => {
    const result = validateIssueRequest({
      repoOwner: "kubestellar",
      repoName: "console",
      title: "Title",
      body: { nested: true },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("body");
  });

  it("rejects non-integer issueNumber", () => {
    const result = validateIssueRequest({
      action: "comment_issue",
      repoOwner: "kubestellar",
      repoName: "console",
      issueNumber: 1.5,
      body: "text",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("issueNumber");
  });

  it("rejects zero issueNumber", () => {
    const result = validateIssueRequest({
      action: "comment_issue",
      repoOwner: "kubestellar",
      repoName: "console",
      issueNumber: 0,
      body: "text",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("issueNumber");
  });

  it("rejects negative issueNumber", () => {
    const result = validateIssueRequest({
      action: "comment_issue",
      repoOwner: "kubestellar",
      repoName: "console",
      issueNumber: -5,
      body: "text",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("issueNumber");
  });

  it("rejects invalid state", () => {
    const result = validateIssueRequest({
      action: "update_issue_state",
      repoOwner: "kubestellar",
      repoName: "console",
      issueNumber: 1,
      state: "pending",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("state");
  });

  it("rejects non-array labels", () => {
    const result = validateIssueRequest({
      repoOwner: "kubestellar",
      repoName: "console",
      title: "T",
      body: "B",
      labels: "not-an-array",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("labels");
  });

  it("rejects labels with non-string elements", () => {
    const result = validateIssueRequest({
      repoOwner: "kubestellar",
      repoName: "console",
      title: "T",
      body: "B",
      labels: ["valid", 123],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("labels[1]");
  });

  it("rejects invalid parentIssueNumber", () => {
    const result = validateIssueRequest({
      repoOwner: "kubestellar",
      repoName: "console",
      title: "T",
      body: "B",
      parentIssueNumber: -1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("parentIssueNumber");
  });

  // Action-specific required field checks
  it("rejects create_issue without title", () => {
    const result = validateIssueRequest({
      action: "create_issue",
      repoOwner: "kubestellar",
      repoName: "console",
      body: "Body",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("title");
  });

  it("rejects create_issue without body", () => {
    const result = validateIssueRequest({
      action: "create_issue",
      repoOwner: "kubestellar",
      repoName: "console",
      title: "Title",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("body");
  });

  it("rejects create_issue with empty title", () => {
    const result = validateIssueRequest({
      action: "create_issue",
      repoOwner: "kubestellar",
      repoName: "console",
      title: "   ",
      body: "Body",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects create_issue with empty body", () => {
    const result = validateIssueRequest({
      action: "create_issue",
      repoOwner: "kubestellar",
      repoName: "console",
      title: "Title",
      body: "   ",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects comment_issue without issueNumber", () => {
    const result = validateIssueRequest({
      action: "comment_issue",
      repoOwner: "kubestellar",
      repoName: "console",
      body: "Comment",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("issueNumber");
  });

  it("rejects comment_issue without body", () => {
    const result = validateIssueRequest({
      action: "comment_issue",
      repoOwner: "kubestellar",
      repoName: "console",
      issueNumber: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("body");
  });

  it("rejects update_issue_state without issueNumber", () => {
    const result = validateIssueRequest({
      action: "update_issue_state",
      repoOwner: "kubestellar",
      repoName: "console",
      state: "open",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("issueNumber");
  });

  it("rejects update_issue_state without state", () => {
    const result = validateIssueRequest({
      action: "update_issue_state",
      repoOwner: "kubestellar",
      repoName: "console",
      issueNumber: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("state");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// validateIssueRequest — edge cases
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateIssueRequest — edge cases", () => {
  it("ignores extra unknown fields", () => {
    const result = validateIssueRequest({
      repoOwner: "kubestellar",
      repoName: "console",
      title: "Title",
      body: "Body",
      unknownField: "ignored",
      anotherOne: 99,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toHaveProperty("unknownField");
    }
  });

  it("accepts state: open for update_issue_state", () => {
    const result = validateIssueRequest({
      action: "update_issue_state",
      repoOwner: "kubestellar",
      repoName: "console",
      issueNumber: 10,
      state: "open",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts empty labels array", () => {
    const result = validateIssueRequest({
      repoOwner: "kubestellar",
      repoName: "console",
      title: "T",
      body: "B",
      labels: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.labels).toEqual([]);
  });

  it("accepts large issueNumber", () => {
    const result = validateIssueRequest({
      action: "comment_issue",
      repoOwner: "kubestellar",
      repoName: "console",
      issueNumber: 999999,
      body: "comment",
    });
    expect(result.ok).toBe(true);
  });
});
