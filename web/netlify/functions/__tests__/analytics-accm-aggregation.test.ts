// @vitest-environment node
/**
 * Unit tests for analytics-accm/aggregation.ts pure aggregation functions.
 *
 * Run: cd web && npx vitest run netlify/functions/__tests__/analytics-accm-aggregation.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  aggregateWeeklyActivity,
  aggregateCIPassRates,
  aggregateContributorGrowth,
} from "../analytics-accm/aggregation";
import type { PRItem, IssueItem, WorkflowRunItem } from "../analytics-accm/fetchers";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WEEK_25 = "2026-W25";
const WEEK_26 = "2026-W26";

function makePR(overrides: Partial<PRItem> = {}): PRItem {
  return {
    created_at: "2026-06-15T10:00:00Z", // W25
    merged_at: null,
    user: { login: "dev1" },
    labels: [],
    ...overrides,
  };
}

function makeIssue(overrides: Partial<IssueItem> = {}): IssueItem {
  return {
    created_at: "2026-06-15T10:00:00Z", // W25
    closed_at: null,
    user: { login: "dev1" },
    labels: [],
    ...overrides,
  };
}

function makeWorkflowRun(overrides: Partial<WorkflowRunItem> = {}): WorkflowRunItem {
  return {
    created_at: "2026-06-15T10:00:00Z",
    conclusion: "success",
    status: "completed",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// aggregateWeeklyActivity
// ---------------------------------------------------------------------------

describe("aggregateWeeklyActivity", () => {
  it("returns empty buckets when no PRs or issues exist", () => {
    const result = aggregateWeeklyActivity([], [], [WEEK_25, WEEK_26]);
    expect(result).toHaveLength(2);
    expect(result[0].prsOpened).toBe(0);
    expect(result[0].issuesOpened).toBe(0);
    expect(result[0].uniqueContributors).toBe(0);
  });

  it("counts PRs opened in the correct week bucket", () => {
    const prs = [makePR(), makePR({ user: { login: "dev2" } })];
    const result = aggregateWeeklyActivity(prs, [], [WEEK_25]);
    expect(result[0].prsOpened).toBe(2);
  });

  it("counts merged PRs in the merge week (not creation week)", () => {
    const prs = [
      makePR({
        created_at: "2026-06-15T10:00:00Z", // W25
        merged_at: "2026-06-22T10:00:00Z", // W26
      }),
    ];
    const result = aggregateWeeklyActivity(prs, [], [WEEK_25, WEEK_26]);
    expect(result[0].prsOpened).toBe(1);
    expect(result[0].prsMerged).toBe(0);
    expect(result[1].prsMerged).toBe(1);
  });

  it("classifies AI vs human PRs", () => {
    const prs = [
      makePR({ user: { login: "Copilot" } }), // AI author
      makePR({ user: { login: "human-dev" } }), // Human
      makePR({ labels: [{ name: "ai-generated" }], user: { login: "someone" } }), // AI label
    ];
    const result = aggregateWeeklyActivity(prs, [], [WEEK_25]);
    expect(result[0].aiPrs).toBe(2);
    expect(result[0].humanPrs).toBe(1);
  });

  it("counts issues opened and closed in correct week buckets", () => {
    const issues = [
      makeIssue({
        created_at: "2026-06-15T10:00:00Z",
        closed_at: "2026-06-22T10:00:00Z",
      }),
    ];
    const result = aggregateWeeklyActivity([], issues, [WEEK_25, WEEK_26]);
    expect(result[0].issuesOpened).toBe(1);
    expect(result[0].issuesClosed).toBe(0);
    expect(result[1].issuesClosed).toBe(1);
  });

  it("tracks unique contributors per week", () => {
    const prs = [
      makePR({ user: { login: "dev1" } }),
      makePR({ user: { login: "dev1" } }), // duplicate
      makePR({ user: { login: "dev2" } }),
    ];
    const result = aggregateWeeklyActivity(prs, [], [WEEK_25]);
    expect(result[0].uniqueContributors).toBe(2);
  });

  it("ignores items that fall outside provided weeks", () => {
    const prs = [makePR({ created_at: "2020-01-01T00:00:00Z" })];
    const result = aggregateWeeklyActivity(prs, [], [WEEK_25]);
    expect(result[0].prsOpened).toBe(0);
  });

  it("preserves week order from input", () => {
    const result = aggregateWeeklyActivity([], [], [WEEK_26, WEEK_25]);
    expect(result[0].week).toBe(WEEK_26);
    expect(result[1].week).toBe(WEEK_25);
  });
});

// ---------------------------------------------------------------------------
// aggregateCIPassRates
// ---------------------------------------------------------------------------

describe("aggregateCIPassRates", () => {
  it("returns zero stats when no runs exist", () => {
    const result = aggregateCIPassRates([], [], [WEEK_25]);
    expect(result[0].coverage).toEqual({ total: 0, passed: 0, rate: 0 });
    expect(result[0].nightly).toEqual({ total: 0, passed: 0, rate: 0 });
  });

  it("calculates pass rate correctly", () => {
    const runs = [
      makeWorkflowRun({ conclusion: "success" }),
      makeWorkflowRun({ conclusion: "success" }),
      makeWorkflowRun({ conclusion: "failure" }),
    ];
    const result = aggregateCIPassRates(runs, [], [WEEK_25]);
    expect(result[0].coverage.total).toBe(3);
    expect(result[0].coverage.passed).toBe(2);
    expect(result[0].coverage.rate).toBeCloseTo(66.7, 0);
  });

  it("100% pass rate for all-success runs", () => {
    const runs = [
      makeWorkflowRun({ conclusion: "success" }),
      makeWorkflowRun({ conclusion: "success" }),
    ];
    const result = aggregateCIPassRates(runs, [], [WEEK_25]);
    expect(result[0].coverage.rate).toBe(100);
  });

  it("separates coverage and nightly runs", () => {
    const coverageRuns = [makeWorkflowRun({ conclusion: "success" })];
    const nightlyRuns = [makeWorkflowRun({ conclusion: "failure" })];
    const result = aggregateCIPassRates(coverageRuns, nightlyRuns, [WEEK_25]);
    expect(result[0].coverage.passed).toBe(1);
    expect(result[0].nightly.passed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// aggregateContributorGrowth
// ---------------------------------------------------------------------------

describe("aggregateContributorGrowth", () => {
  it("returns zero growth when no contributions exist", () => {
    const result = aggregateContributorGrowth([], [], [WEEK_25]);
    expect(result.total).toBe(0);
    expect(result.weekly).toHaveLength(1);
    expect(result.weekly[0].newContributors).toBe(0);
    expect(result.weekly[0].totalToDate).toBe(0);
  });

  it("counts total unique contributors across PRs and issues", () => {
    const prs = [makePR({ user: { login: "dev1" } })];
    const issues = [
      makeIssue({ user: { login: "dev2" } }),
      makeIssue({ user: { login: "dev1" } }), // duplicate
    ];
    const result = aggregateContributorGrowth(prs, issues, [WEEK_25]);
    expect(result.total).toBe(2);
  });

  it("tracks new contributors per week", () => {
    const prs = [
      makePR({ created_at: "2026-06-15T10:00:00Z", user: { login: "dev1" } }), // W25
      makePR({ created_at: "2026-06-22T10:00:00Z", user: { login: "dev2" } }), // W26
    ];
    const result = aggregateContributorGrowth(prs, [], [WEEK_25, WEEK_26]);
    expect(result.weekly[0].newContributors).toBe(1);
    expect(result.weekly[1].newContributors).toBe(1);
  });

  it("accumulates totalToDate across weeks", () => {
    const prs = [
      makePR({ created_at: "2026-06-15T10:00:00Z", user: { login: "dev1" } }),
      makePR({ created_at: "2026-06-22T10:00:00Z", user: { login: "dev2" } }),
    ];
    const result = aggregateContributorGrowth(prs, [], [WEEK_25, WEEK_26]);
    expect(result.weekly[0].totalToDate).toBe(1);
    expect(result.weekly[1].totalToDate).toBe(2);
  });

  it("attributes contributors to their earliest activity week", () => {
    const prs = [
      makePR({ created_at: "2026-06-22T10:00:00Z", user: { login: "dev1" } }), // W26
    ];
    const issues = [
      makeIssue({ created_at: "2026-06-15T10:00:00Z", user: { login: "dev1" } }), // W25 (earlier)
    ];
    const result = aggregateContributorGrowth(prs, issues, [WEEK_25, WEEK_26]);
    // dev1 should appear in W25, not W26
    expect(result.weekly[0].newContributors).toBe(1);
    expect(result.weekly[1].newContributors).toBe(0);
  });

  it("counts pre-window contributors in running total", () => {
    // dev1 contributed before our window
    const prs = [
      makePR({ created_at: "2020-01-06T10:00:00Z", user: { login: "old-dev" } }),
      makePR({ created_at: "2026-06-15T10:00:00Z", user: { login: "new-dev" } }),
    ];
    const result = aggregateContributorGrowth(prs, [], [WEEK_25]);
    // old-dev should be counted in pre-window total
    expect(result.weekly[0].totalToDate).toBe(2); // 1 pre-window + 1 new
  });
});
