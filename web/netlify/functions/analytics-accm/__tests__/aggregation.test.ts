import { describe, it, expect } from "vitest";
import {
  aggregateWeeklyActivity,
  aggregateCIPassRates,
  aggregateContributorGrowth,
} from "../aggregation";
import type { PRItem, IssueItem, WorkflowRunItem } from "../fetchers";

function makePR(overrides: Partial<PRItem> = {}): PRItem {
  return {
    number: 1,
    created_at: "2026-03-02T10:00:00Z",
    merged_at: null,
    labels: [],
    user: { login: "human-dev" },
    ...overrides,
  };
}

function makeIssue(overrides: Partial<IssueItem> = {}): IssueItem {
  return {
    number: 1,
    created_at: "2026-03-02T10:00:00Z",
    closed_at: null,
    labels: [],
    user: { login: "human-dev" },
    ...overrides,
  };
}

function makeRun(overrides: Partial<WorkflowRunItem> = {}): WorkflowRunItem {
  return {
    id: 1,
    created_at: "2026-03-02T10:00:00Z",
    conclusion: "success",
    ...overrides,
  };
}

describe("aggregateWeeklyActivity", () => {
  const weeks = ["2026-W09", "2026-W10"];

  it("returns one entry per requested week", () => {
    const result = aggregateWeeklyActivity([], [], weeks);
    expect(result).toHaveLength(2);
    expect(result[0].week).toBe("2026-W09");
    expect(result[1].week).toBe("2026-W10");
  });

  it("initializes all counts to zero when no data", () => {
    const result = aggregateWeeklyActivity([], [], weeks);
    expect(result[0].prsOpened).toBe(0);
    expect(result[0].prsMerged).toBe(0);
    expect(result[0].issuesOpened).toBe(0);
    expect(result[0].issuesClosed).toBe(0);
    expect(result[0].uniqueContributors).toBe(0);
  });

  it("counts PRs opened in the correct week", () => {
    // 2026-03-02 is Monday of W10
    const prs = [makePR({ created_at: "2026-03-02T10:00:00Z" })];
    const result = aggregateWeeklyActivity(prs, [], weeks);
    expect(result[1].prsOpened).toBe(1);
    expect(result[0].prsOpened).toBe(0);
  });

  it("counts PRs merged in the correct week", () => {
    const prs = [
      makePR({
        created_at: "2026-02-23T10:00:00Z", // W09
        merged_at: "2026-03-03T10:00:00Z", // W10
      }),
    ];
    const result = aggregateWeeklyActivity(prs, [], weeks);
    expect(result[0].prsOpened).toBe(1); // created in W09
    expect(result[1].prsMerged).toBe(1); // merged in W10
  });

  it("classifies AI vs human PRs", () => {
    const prs = [
      makePR({ user: { login: "Copilot" }, created_at: "2026-03-02T10:00:00Z" }),
      makePR({ user: { login: "dev-person" }, created_at: "2026-03-02T12:00:00Z" }),
    ];
    const result = aggregateWeeklyActivity(prs, [], weeks);
    expect(result[1].aiPrs).toBe(1);
    expect(result[1].humanPrs).toBe(1);
  });

  it("counts issues opened and closed in correct weeks", () => {
    const issues = [
      makeIssue({
        created_at: "2026-02-23T10:00:00Z", // W09
        closed_at: "2026-03-04T10:00:00Z", // W10
      }),
    ];
    const result = aggregateWeeklyActivity([], issues, weeks);
    expect(result[0].issuesOpened).toBe(1);
    expect(result[1].issuesClosed).toBe(1);
  });

  it("counts unique contributors per week", () => {
    const prs = [
      makePR({ user: { login: "alice" }, created_at: "2026-03-02T10:00:00Z" }),
      makePR({ user: { login: "bob" }, created_at: "2026-03-02T12:00:00Z" }),
      makePR({ user: { login: "alice" }, created_at: "2026-03-03T10:00:00Z" }), // duplicate
    ];
    const result = aggregateWeeklyActivity(prs, [], weeks);
    expect(result[1].uniqueContributors).toBe(2);
  });

  it("ignores data outside requested weeks", () => {
    const prs = [makePR({ created_at: "2026-01-01T10:00:00Z" })]; // W01
    const result = aggregateWeeklyActivity(prs, [], weeks);
    expect(result[0].prsOpened).toBe(0);
    expect(result[1].prsOpened).toBe(0);
  });
});

describe("aggregateCIPassRates", () => {
  const weeks = ["2026-W09", "2026-W10"];

  it("returns one entry per requested week", () => {
    const result = aggregateCIPassRates([], [], weeks);
    expect(result).toHaveLength(2);
    expect(result[0].week).toBe("2026-W09");
  });

  it("returns zero rates when no runs exist", () => {
    const result = aggregateCIPassRates([], [], weeks);
    expect(result[0].coverage).toEqual({ total: 0, passed: 0, rate: 0 });
    expect(result[0].nightly).toEqual({ total: 0, passed: 0, rate: 0 });
  });

  it("calculates pass rate correctly", () => {
    const coverageRuns = [
      makeRun({ created_at: "2026-03-02T10:00:00Z", conclusion: "success" }),
      makeRun({ created_at: "2026-03-02T12:00:00Z", conclusion: "failure" }),
      makeRun({ created_at: "2026-03-03T10:00:00Z", conclusion: "success" }),
    ];
    const result = aggregateCIPassRates(coverageRuns, [], weeks);
    // W10: 3 runs, 2 passed = 66.7%
    expect(result[1].coverage.total).toBe(3);
    expect(result[1].coverage.passed).toBe(2);
    expect(result[1].coverage.rate).toBeCloseTo(66.7, 0);
  });

  it("separates coverage and nightly runs", () => {
    const coverageRuns = [
      makeRun({ created_at: "2026-03-02T10:00:00Z", conclusion: "success" }),
    ];
    const nightlyRuns = [
      makeRun({ created_at: "2026-03-02T10:00:00Z", conclusion: "failure" }),
    ];
    const result = aggregateCIPassRates(coverageRuns, nightlyRuns, weeks);
    expect(result[1].coverage.rate).toBe(100);
    expect(result[1].nightly.rate).toBe(0);
  });

  it("rounds rate to one decimal place", () => {
    const runs = [
      makeRun({ created_at: "2026-03-02T01:00:00Z", conclusion: "success" }),
      makeRun({ created_at: "2026-03-02T02:00:00Z", conclusion: "success" }),
      makeRun({ created_at: "2026-03-02T03:00:00Z", conclusion: "failure" }),
    ];
    const result = aggregateCIPassRates(runs, [], weeks);
    // 2/3 = 66.666... -> 66.7
    expect(result[1].coverage.rate).toBe(66.7);
  });
});

describe("aggregateContributorGrowth", () => {
  const weeks = ["2026-W09", "2026-W10", "2026-W11"];

  it("returns total unique contributors across all data", () => {
    const prs = [
      makePR({ user: { login: "alice" }, created_at: "2026-02-23T10:00:00Z" }),
      makePR({ user: { login: "bob" }, created_at: "2026-03-02T10:00:00Z" }),
    ];
    const result = aggregateContributorGrowth(prs, [], weeks);
    expect(result.total).toBe(2);
  });

  it("tracks new contributors per week", () => {
    const prs = [
      makePR({ user: { login: "alice" }, created_at: "2026-02-23T10:00:00Z" }), // W09
      makePR({ user: { login: "bob" }, created_at: "2026-03-02T10:00:00Z" }), // W10
    ];
    const result = aggregateContributorGrowth(prs, [], weeks);
    expect(result.weekly[0].newContributors).toBe(1); // alice in W09
    expect(result.weekly[1].newContributors).toBe(1); // bob in W10
    expect(result.weekly[2].newContributors).toBe(0); // nobody new in W11
  });

  it("tracks cumulative totalToDate", () => {
    const prs = [
      makePR({ user: { login: "alice" }, created_at: "2026-02-23T10:00:00Z" }),
      makePR({ user: { login: "bob" }, created_at: "2026-03-02T10:00:00Z" }),
    ];
    const result = aggregateContributorGrowth(prs, [], weeks);
    expect(result.weekly[0].totalToDate).toBe(1);
    expect(result.weekly[1].totalToDate).toBe(2);
    expect(result.weekly[2].totalToDate).toBe(2);
  });

  it("counts contributors from before the window in initial total", () => {
    const prs = [
      makePR({ user: { login: "early-bird" }, created_at: "2026-01-10T10:00:00Z" }), // before W09
      makePR({ user: { login: "alice" }, created_at: "2026-02-23T10:00:00Z" }), // W09
    ];
    const result = aggregateContributorGrowth(prs, [], weeks);
    // early-bird counted in running total before window starts
    expect(result.weekly[0].totalToDate).toBe(2); // early-bird + alice
  });

  it("deduplicates the same contributor appearing in PRs and issues", () => {
    const prs = [makePR({ user: { login: "alice" }, created_at: "2026-02-23T10:00:00Z" })];
    const issues = [makeIssue({ user: { login: "alice" }, created_at: "2026-03-02T10:00:00Z" })];
    const result = aggregateContributorGrowth(prs, issues, weeks);
    expect(result.total).toBe(1);
  });

  it("uses earliest appearance when contributor has multiple items", () => {
    const prs = [
      makePR({ user: { login: "alice" }, created_at: "2026-03-02T10:00:00Z" }), // W10
      makePR({ user: { login: "alice" }, created_at: "2026-02-23T10:00:00Z" }), // W09 (earlier)
    ];
    const result = aggregateContributorGrowth(prs, [], weeks);
    expect(result.weekly[0].newContributors).toBe(1); // first seen in W09
    expect(result.weekly[1].newContributors).toBe(0); // not new in W10
  });

  it("returns empty weekly array for empty weeks input", () => {
    const result = aggregateContributorGrowth([], [], []);
    expect(result.total).toBe(0);
    expect(result.weekly).toHaveLength(0);
  });
});
