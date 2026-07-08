// @vitest-environment node
/**
 * Unit tests for github-pipelines/helpers.ts pure utility functions.
 *
 * Run: cd web && npx vitest run netlify/functions/__tests__/github-pipelines-helpers.test.ts
 */
import { describe, expect, it, vi } from "vitest";
import { jsonResponse, isValidRepo, isAllowedRepo } from "../github-pipelines/helpers";

describe("jsonResponse", () => {
  it("returns a Response with JSON content-type", () => {
    const res = jsonResponse({ ok: true });
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("defaults to status 200", () => {
    const res = jsonResponse({ ok: true });
    expect(res.status).toBe(200);
  });

  it("accepts custom status", () => {
    const res = jsonResponse({ error: "not found" }, { status: 404 });
    expect(res.status).toBe(404);
  });

  it("serializes body as JSON", async () => {
    const data = { items: [1, 2, 3], nested: { a: "b" } };
    const res = jsonResponse(data);
    const parsed = await res.json();
    expect(parsed).toEqual(data);
  });

  it("merges custom headers with Content-Type", () => {
    const res = jsonResponse({}, { headers: { "X-Custom": "test" } });
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("X-Custom")).toBe("test");
  });

  it("handles null body", async () => {
    const res = jsonResponse(null);
    const text = await res.text();
    expect(text).toBe("null");
  });
});

describe("isValidRepo", () => {
  it("accepts owner/repo format", () => {
    expect(isValidRepo("kubestellar/console")).toBe(true);
  });

  it("accepts repos with dots, hyphens, underscores", () => {
    expect(isValidRepo("my-org/my_repo.v2")).toBe(true);
  });

  it("rejects null", () => {
    expect(isValidRepo(null)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidRepo("")).toBe(false);
  });

  it("rejects bare name without slash", () => {
    expect(isValidRepo("console")).toBe(false);
  });

  it("rejects paths with multiple slashes", () => {
    expect(isValidRepo("org/repo/extra")).toBe(false);
  });

  it("rejects special characters that could cause injection", () => {
    expect(isValidRepo("org/repo;rm -rf")).toBe(false);
    expect(isValidRepo("org/repo$(whoami)")).toBe(false);
  });
});

describe("isAllowedRepo", () => {
  it("rejects invalid repo format", () => {
    expect(isAllowedRepo(null)).toBe(false);
    expect(isAllowedRepo("")).toBe(false);
    expect(isAllowedRepo("no-slash")).toBe(false);
  });

  it("rejects valid-format repos not in allowlist", () => {
    expect(isAllowedRepo("evil-org/evil-repo")).toBe(false);
  });

  it("is case-insensitive", () => {
    // Test that case doesn't matter for allowed repos
    const result1 = isAllowedRepo("kubestellar/console");
    const result2 = isAllowedRepo("KubeStellar/Console");
    expect(result1).toBe(result2);
  });
});
