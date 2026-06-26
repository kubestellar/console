// @vitest-environment node
/**
 * Unit tests for the shared repo-allowlist module.
 *
 * This module is security-critical: it prevents authenticated server-side
 * GitHub API calls from being directed at arbitrary repositories (SSRF-like
 * attack vector). Every code path needs regression coverage.
 */
import { describe, expect, it, afterEach } from "vitest";

import {
  DEFAULT_ALLOWED_REPOS,
  getAllowedRepoSlugs,
  isAllowedRepo,
  isAllowedRepoSlug,
} from "../_shared/repo-allowlist";

// ── DEFAULT_ALLOWED_REPOS ───────────────────────────────────────────────

describe("DEFAULT_ALLOWED_REPOS", () => {
  it("contains expected KubeStellar repos", () => {
    expect(DEFAULT_ALLOWED_REPOS).toContain("kubestellar/kubestellar");
    expect(DEFAULT_ALLOWED_REPOS).toContain("kubestellar/console");
    expect(DEFAULT_ALLOWED_REPOS).toContain("kubestellar/docs");
    expect(DEFAULT_ALLOWED_REPOS).toContain("kubestellar/console-kb");
    expect(DEFAULT_ALLOWED_REPOS).toContain("kubestellar/console-marketplace");
    expect(DEFAULT_ALLOWED_REPOS).toContain("kubestellar/kubestellar-mcp");
    expect(DEFAULT_ALLOWED_REPOS).toContain("kubestellar/homebrew-tap");
  });

  it("has exactly 7 entries", () => {
    expect(DEFAULT_ALLOWED_REPOS).toHaveLength(7);
  });
});

// ── isAllowedRepoSlug ───────────────────────────────────────────────────

describe("isAllowedRepoSlug", () => {
  it("accepts an allowed slug", () => {
    expect(isAllowedRepoSlug("kubestellar/console")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isAllowedRepoSlug("KubeStellar/Console")).toBe(true);
    expect(isAllowedRepoSlug("KUBESTELLAR/CONSOLE")).toBe(true);
  });

  it("trims whitespace", () => {
    expect(isAllowedRepoSlug("  kubestellar/console  ")).toBe(true);
  });

  it("rejects disallowed repos", () => {
    expect(isAllowedRepoSlug("evil-org/malicious-repo")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isAllowedRepoSlug("")).toBe(false);
  });

  it("rejects slug without owner/repo separator", () => {
    expect(isAllowedRepoSlug("kubestellar")).toBe(false);
  });

  it("accepts custom allowlist", () => {
    const customList = ["myorg/myrepo"];
    expect(isAllowedRepoSlug("myorg/myrepo", customList)).toBe(true);
    expect(isAllowedRepoSlug("kubestellar/console", customList)).toBe(false);
  });
});

// ── isAllowedRepo ───────────────────────────────────────────────────────

describe("isAllowedRepo", () => {
  it("accepts allowed owner/repo pair", () => {
    expect(isAllowedRepo("kubestellar", "console")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isAllowedRepo("KubeStellar", "Console")).toBe(true);
  });

  it("rejects disallowed repos", () => {
    expect(isAllowedRepo("evil-org", "malicious")).toBe(false);
  });

  it("works with custom allowlist", () => {
    const customList = ["myorg/allowed"];
    expect(isAllowedRepo("myorg", "allowed", customList)).toBe(true);
    expect(isAllowedRepo("myorg", "denied", customList)).toBe(false);
  });
});

// ── getAllowedRepoSlugs ─────────────────────────────────────────────────

describe("getAllowedRepoSlugs", () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("returns DEFAULT_ALLOWED_REPOS when no env vars are set", () => {
    delete process.env.PIPELINE_REPOS;
    delete process.env.ALLOWED_REPOS;
    const result = getAllowedRepoSlugs(["PIPELINE_REPOS", "ALLOWED_REPOS"]);
    expect(result).toEqual(DEFAULT_ALLOWED_REPOS);
  });

  it("returns DEFAULT_ALLOWED_REPOS when envVarNames is empty", () => {
    const result = getAllowedRepoSlugs([]);
    expect(result).toEqual(DEFAULT_ALLOWED_REPOS);
  });

  it("returns DEFAULT_ALLOWED_REPOS when called with no arguments", () => {
    const result = getAllowedRepoSlugs();
    expect(result).toEqual(DEFAULT_ALLOWED_REPOS);
  });

  it("parses comma-separated env var value", () => {
    process.env.PIPELINE_REPOS = "org/repo1,org/repo2,org/repo3";
    const result = getAllowedRepoSlugs(["PIPELINE_REPOS"]);
    expect(result).toEqual(["org/repo1", "org/repo2", "org/repo3"]);
  });

  it("normalizes to lowercase", () => {
    process.env.PIPELINE_REPOS = "Org/Repo1,ORG/REPO2";
    const result = getAllowedRepoSlugs(["PIPELINE_REPOS"]);
    expect(result).toEqual(["org/repo1", "org/repo2"]);
  });

  it("trims whitespace from entries", () => {
    process.env.PIPELINE_REPOS = " org/repo1 , org/repo2 ";
    const result = getAllowedRepoSlugs(["PIPELINE_REPOS"]);
    expect(result).toEqual(["org/repo1", "org/repo2"]);
  });

  it("filters out invalid slugs (no slash)", () => {
    process.env.PIPELINE_REPOS = "org/valid,invalid,another/valid";
    const result = getAllowedRepoSlugs(["PIPELINE_REPOS"]);
    expect(result).toEqual(["org/valid", "another/valid"]);
  });

  it("uses first non-empty env var from list", () => {
    delete process.env.FIRST_VAR;
    process.env.SECOND_VAR = "org/from-second";
    const result = getAllowedRepoSlugs(["FIRST_VAR", "SECOND_VAR"]);
    expect(result).toEqual(["org/from-second"]);
  });

  it("falls back to defaults when env var is empty string", () => {
    process.env.PIPELINE_REPOS = "";
    const result = getAllowedRepoSlugs(["PIPELINE_REPOS"]);
    expect(result).toEqual(DEFAULT_ALLOWED_REPOS);
  });
});
