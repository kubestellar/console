import { describe, it, expect } from "vitest";
import { dayKey, normalizeRun } from "../transform";

describe("dayKey", () => {
  it("extracts YYYY-MM-DD from full ISO timestamp", () => {
    expect(dayKey("2026-07-03T15:30:00Z")).toBe("2026-07-03");
  });

  it("works with date-only strings", () => {
    expect(dayKey("2026-01-15")).toBe("2026-01-15");
  });

  it("handles timestamps with timezone offset", () => {
    expect(dayKey("2026-12-31T23:59:59+05:00")).toBe("2026-12-31");
  });
});

describe("normalizeRun", () => {
  const repo = "kubestellar/console";

  function makeRawRun(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 12345,
      name: "Build",
      workflow_id: 100,
      head_branch: "main",
      status: "completed",
      conclusion: "success",
      event: "push",
      run_number: 42,
      html_url: "https://github.com/kubestellar/console/actions/runs/12345",
      created_at: "2026-07-01T10:00:00Z",
      updated_at: "2026-07-01T10:05:00Z",
      pull_requests: [],
      ...overrides,
    };
  }

  it("maps all basic fields correctly", () => {
    const raw = makeRawRun();
    const result = normalizeRun(raw, repo);
    expect(result.id).toBe(12345);
    expect(result.repo).toBe(repo);
    expect(result.name).toBe("Build");
    expect(result.workflowId).toBe(100);
    expect(result.headBranch).toBe("main");
    expect(result.status).toBe("completed");
    expect(result.conclusion).toBe("success");
    expect(result.event).toBe("push");
    expect(result.runNumber).toBe(42);
    expect(result.createdAt).toBe("2026-07-01T10:00:00Z");
    expect(result.updatedAt).toBe("2026-07-01T10:05:00Z");
  });

  it("extracts pull_requests when present", () => {
    const raw = makeRawRun({
      pull_requests: [
        { number: 123, url: "https://api.github.com/repos/kubestellar/console/pulls/123" },
      ],
    });
    const result = normalizeRun(raw, repo);
    expect(result.pullRequests).toEqual([
      { number: 123, url: "https://api.github.com/repos/kubestellar/console/pulls/123" },
    ]);
  });

  it("sets pullRequests undefined when array is empty", () => {
    const raw = makeRawRun({ pull_requests: [] });
    const result = normalizeRun(raw, repo);
    expect(result.pullRequests).toBeUndefined();
  });

  it("extracts PR number from commit message for push events", () => {
    const raw = makeRawRun({
      event: "push",
      pull_requests: [],
      head_commit: { message: "feat: add new feature (#456)" },
    });
    const result = normalizeRun(raw, repo);
    expect(result.pullRequests).toEqual([
      { number: 456, url: `https://github.com/${repo}/pull/456` },
    ]);
  });

  it("does not extract PR from commit message for non-push events", () => {
    const raw = makeRawRun({
      event: "pull_request",
      pull_requests: [],
      head_commit: { message: "feat: add new feature (#456)" },
    });
    const result = normalizeRun(raw, repo);
    expect(result.pullRequests).toBeUndefined();
  });

  it("handles missing head_commit gracefully", () => {
    const raw = makeRawRun({
      event: "push",
      pull_requests: [],
    });
    const result = normalizeRun(raw, repo);
    expect(result.pullRequests).toBeUndefined();
  });

  it("filters out pull_requests entries without a valid number", () => {
    const raw = makeRawRun({
      pull_requests: [
        { number: 10, url: "http://example.com" },
        { url: "http://example.com" }, // no number
        { number: "not-a-number", url: "http://example.com" },
      ],
    });
    const result = normalizeRun(raw, repo);
    expect(result.pullRequests).toEqual([{ number: 10, url: "http://example.com" }]);
  });

  it("defaults missing fields to safe values", () => {
    const raw = { id: 1 }; // minimal
    const result = normalizeRun(raw, repo);
    expect(result.name).toBe("");
    expect(result.workflowId).toBe(0);
    expect(result.headBranch).toBe("");
    expect(result.status).toBe("completed");
    expect(result.conclusion).toBeNull();
    expect(result.event).toBe("");
    expect(result.runNumber).toBe(0);
    expect(result.htmlUrl).toBe("");
    expect(result.createdAt).toBe("");
    expect(result.updatedAt).toBe("");
  });

  it("prefers actual pull_requests over commit message extraction", () => {
    const raw = makeRawRun({
      event: "push",
      pull_requests: [{ number: 789, url: "https://example.com" }],
      head_commit: { message: "fix: something (#111)" },
    });
    const result = normalizeRun(raw, repo);
    expect(result.pullRequests).toEqual([{ number: 789, url: "https://example.com" }]);
  });
});
