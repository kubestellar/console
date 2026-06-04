import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_ALLOWED_REPOS,
  getAllowedRepoSlugs,
  isAllowedRepo,
  isAllowedRepoSlug,
} from "../repo-allowlist";

describe("repo-allowlist", () => {
  it("includes the default KubeStellar repositories", () => {
    expect(DEFAULT_ALLOWED_REPOS).toContain("kubestellar/console");
    expect(DEFAULT_ALLOWED_REPOS).toContain("kubestellar/kubestellar");
  });

  it("matches repo checks case-insensitively", () => {
    expect(isAllowedRepo("KubeStellar", "Console")).toBe(true);
    expect(isAllowedRepoSlug("KUBESTELLAR/DOCS")).toBe(true);
  });

  it("prefers the first configured env allowlist", () => {
    vi.stubEnv("ISSUE_STATS_REPOS", "Acme/Alpha,Acme/Beta");
    vi.stubEnv("PIPELINE_REPOS", "kubestellar/console");

    expect(getAllowedRepoSlugs(["ISSUE_STATS_REPOS", "PIPELINE_REPOS"])).toEqual([
      "acme/alpha",
      "acme/beta",
    ]);

    vi.unstubAllEnvs();
  });
});
