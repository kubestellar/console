import { describe, it, expect } from "vitest";
import { jsonResponse, isValidRepo, isAllowedRepo } from "../helpers";

describe("jsonResponse", () => {
  it("returns Response with JSON content-type", () => {
    const res = jsonResponse({ ok: true });
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("defaults to status 200", () => {
    const res = jsonResponse({ ok: true });
    expect(res.status).toBe(200);
  });

  it("allows custom status", () => {
    const res = jsonResponse({ error: "not found" }, { status: 404 });
    expect(res.status).toBe(404);
  });

  it("serializes body as JSON", async () => {
    const data = { items: [1, 2, 3], nested: { key: "value" } };
    const res = jsonResponse(data);
    const body = await res.json();
    expect(body).toEqual(data);
  });

  it("merges custom headers with content-type", () => {
    const res = jsonResponse({}, { headers: { "X-Custom": "test" } });
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("X-Custom")).toBe("test");
  });

  it("handles null body", async () => {
    const res = jsonResponse(null);
    const body = await res.json();
    expect(body).toBeNull();
  });
});

describe("isValidRepo", () => {
  it("accepts valid owner/repo format", () => {
    expect(isValidRepo("kubestellar/console")).toBe(true);
    expect(isValidRepo("my-org/my.repo")).toBe(true);
    expect(isValidRepo("org_name/repo-name")).toBe(true);
  });

  it("rejects null or empty", () => {
    expect(isValidRepo(null)).toBe(false);
    expect(isValidRepo("")).toBe(false);
  });

  it("rejects strings without slash", () => {
    expect(isValidRepo("just-a-name")).toBe(false);
  });

  it("rejects strings with multiple slashes", () => {
    expect(isValidRepo("org/repo/extra")).toBe(false);
  });

  it("rejects strings with invalid characters", () => {
    expect(isValidRepo("org/repo name")).toBe(false);
    expect(isValidRepo("org/<script>")).toBe(false);
  });
});

describe("isAllowedRepo", () => {
  it("accepts repos in the default allowlist", () => {
    expect(isAllowedRepo("kubestellar/console")).toBe(true);
    expect(isAllowedRepo("kubestellar/docs")).toBe(true);
  });

  it("rejects repos not in the allowlist", () => {
    expect(isAllowedRepo("evil-org/malicious")).toBe(false);
    expect(isAllowedRepo("kubestellar/nonexistent-repo")).toBe(false);
  });

  it("rejects null input", () => {
    expect(isAllowedRepo(null)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isAllowedRepo("KubeStellar/Console")).toBe(true);
    expect(isAllowedRepo("KUBESTELLAR/CONSOLE")).toBe(true);
  });

  it("rejects invalid format even if substring matches", () => {
    expect(isAllowedRepo("kubestellar/console/extra")).toBe(false);
  });
});
