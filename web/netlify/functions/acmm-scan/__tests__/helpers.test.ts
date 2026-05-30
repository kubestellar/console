import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DetectionHint } from "../criteria";
import {
  AI_LABEL,
  ALLOWED_ORIGINS,
  corsHeaders,
  corsOrigin,
  isAIContribution,
  isoWeek,
  lastNWeeks,
  matchesHint,
} from "../helpers";

const EXPECTED_CORS_HEADER_KEYS = [
  "Access-Control-Allow-Origin",
  "Access-Control-Allow-Methods",
  "Access-Control-Allow-Headers",
  "Cache-Control",
  "Vary",
];

describe("corsOrigin", () => {
  it("returns allowed origins unchanged", () => {
    expect(corsOrigin(ALLOWED_ORIGINS[0])).toBe(ALLOWED_ORIGINS[0]);
    expect(corsOrigin(ALLOWED_ORIGINS[1])).toBe(ALLOWED_ORIGINS[1]);
  });

  it("allows localhost and kubestellar domains", () => {
    expect(corsOrigin("http://localhost:5174")).toBe("http://localhost:5174");
    expect(corsOrigin("https://console-preview.kubestellar.io")).toBe(
      "https://console-preview.kubestellar.io",
    );
  });

  it("falls back to the default origin for unknown or missing origins", () => {
    expect(corsOrigin("https://example.com")).toBe(ALLOWED_ORIGINS[0]);
    expect(corsOrigin(null)).toBe(ALLOWED_ORIGINS[0]);
  });
});

describe("corsHeaders", () => {
  it("returns the expected CORS header keys", () => {
    const headers = corsHeaders("https://console.kubestellar.io");

    expect(Object.keys(headers)).toEqual(EXPECTED_CORS_HEADER_KEYS);
    expect(headers["Access-Control-Allow-Origin"]).toBe(
      "https://console.kubestellar.io",
    );
  });
});

describe("isoWeek", () => {
  it("formats known dates as ISO week strings", () => {
    expect(isoWeek(new Date("2024-01-04T12:00:00Z"))).toBe("2024-W01");
    expect(isoWeek(new Date("2024-12-31T12:00:00Z"))).toBe("2025-W01");
    expect(isoWeek(new Date("2023-01-01T12:00:00Z"))).toBe("2022-W52");
  });
});

describe("lastNWeeks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-02-12T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the requested number of ISO weeks in ascending order", () => {
    expect(lastNWeeks(4)).toEqual([
      "2025-W04",
      "2025-W05",
      "2025-W06",
      "2025-W07",
    ]);
  });
});

describe("matchesHint", () => {
  it("matches exact and nested paths for path hints", () => {
    const exactHint: DetectionHint = {
      type: "path",
      pattern: ".github/copilot-instructions.md",
    };
    const nestedHint: DetectionHint = {
      type: "path",
      pattern: "docs/security/SECURITY-AI.md",
    };

    expect(
      matchesHint(new Set([".github/copilot-instructions.md"]), exactHint),
    ).toBe(true);
    expect(
      matchesHint(
        new Set(["nested/docs/security/SECURITY-AI.md"]),
        nestedHint,
      ),
    ).toBe(true);
  });

  it("matches any-of hints against any listed pattern", () => {
    const hint: DetectionHint = {
      type: "any-of",
      pattern: ["README.md", "docs/prompts/"],
    };

    expect(matchesHint(new Set(["docs/prompts/guide.md"]), hint)).toBe(true);
    expect(matchesHint(new Set(["README.md"]), hint)).toBe(true);
  });

  it("matches directory patterns with a trailing slash", () => {
    const hint: DetectionHint = {
      type: "any-of",
      pattern: [".github/workflows/"],
    };

    expect(matchesHint(new Set([".github/workflows"]), hint)).toBe(true);
    expect(
      matchesHint(new Set(["nested/.github/workflows/build.yml"]), hint),
    ).toBe(true);
  });

  it("matches glob hints using wildcard patterns", () => {
    const hint: DetectionHint = {
      type: "glob",
      pattern: "src/**/*.test.ts",
    };

    expect(
      matchesHint(new Set(["src/components/cards/CardWrapper.test.ts"]), hint),
    ).toBe(true);
    expect(
      matchesHint(new Set(["src/components/cards/CardWrapper.tsx"]), hint),
    ).toBe(false);
  });
});

describe("isAIContribution", () => {
  it("recognizes known AI and bot authors", () => {
    expect(isAIContribution([], "Copilot")).toBe(true);
    expect(isAIContribution([], "renovate[bot]")).toBe(true);
  });

  it("recognizes AI labels", () => {
    expect(isAIContribution([{ name: AI_LABEL }], "human-author")).toBe(true);
  });

  it("does not mark unlabeled human authors as AI contributions", () => {
    expect(isAIContribution([{ name: "documentation" }], "human-author")).toBe(
      false,
    );
  });
});
