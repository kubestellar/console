import { describe, expect, it } from "vitest";

import {
  ALLOWED_ACMM_REPOS,
  getAllowedACMMRepos,
  isAllowedACMMRepo,
} from "../_shared/acmm-allowed-repos";

describe("acmm-allowed-repos", () => {
  it("uses the default KubeStellar repo allowlist", () => {
    expect(getAllowedACMMRepos(undefined)).toEqual(ALLOWED_ACMM_REPOS);
    expect(isAllowedACMMRepo("kubestellar/console", undefined)).toBe(true);
    expect(isAllowedACMMRepo("kubestellar/galaxy", undefined)).toBe(true);
    expect(isAllowedACMMRepo("other/private-repo", undefined)).toBe(false);
  });

  it("supports an ACMM_REPOS environment override", () => {
    const envValue = "example/one, Example/Two, invalid repo";

    expect(getAllowedACMMRepos(envValue)).toEqual(
      new Set(["example/one", "example/two"]),
    );
    expect(isAllowedACMMRepo("example/two", envValue)).toBe(true);
    expect(isAllowedACMMRepo("kubestellar/console", envValue)).toBe(false);
  });
});
