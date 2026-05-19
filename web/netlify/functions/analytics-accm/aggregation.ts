/**
 * Analytics ACCM — Aggregation functions
 */

import { isoWeek, isAIContribution } from "./helpers";
import type {
  WeeklyActivity,
  CIPassRate,
  WorkflowWeekStats,
  ContributorGrowth,
} from "./helpers";
import type { PRItem, IssueItem, WorkflowRunItem } from "./fetchers";

// ---------------------------------------------------------------------------
// Weekly activity aggregation
// ---------------------------------------------------------------------------

export function aggregateWeeklyActivity(
  prs: PRItem[],
  issues: IssueItem[],
  weeks: string[],
): WeeklyActivity[] {
  const buckets = new Map<string, WeeklyActivity>();
  for (const week of weeks) {
    buckets.set(week, {
      week,
      prsOpened: 0,
      prsMerged: 0,
      issuesOpened: 0,
      issuesClosed: 0,
      aiPrs: 0,
      humanPrs: 0,
      aiIssues: 0,
      humanIssues: 0,
      uniqueContributors: 0,
    });
  }

  const weekContributors = new Map<string, Set<string>>();
  for (const week of weeks) {
    weekContributors.set(week, new Set());
  }

  for (const pr of prs) {
    const createdWeek = isoWeek(new Date(pr.created_at));
    const bucket = buckets.get(createdWeek);
    if (bucket) {
      bucket.prsOpened++;
      if (isAIContribution(pr.labels, pr.user.login)) {
        bucket.aiPrs++;
      } else {
        bucket.humanPrs++;
      }
      weekContributors.get(createdWeek)?.add(pr.user.login);
    }

    if (pr.merged_at) {
      const mergedWeek = isoWeek(new Date(pr.merged_at));
      const mBucket = buckets.get(mergedWeek);
      if (mBucket) mBucket.prsMerged++;
    }
  }

  for (const issue of issues) {
    const createdWeek = isoWeek(new Date(issue.created_at));
    const bucket = buckets.get(createdWeek);
    if (bucket) {
      bucket.issuesOpened++;
      if (isAIContribution(issue.labels, issue.user.login)) {
        bucket.aiIssues++;
      } else {
        bucket.humanIssues++;
      }
      weekContributors.get(createdWeek)?.add(issue.user.login);
    }

    if (issue.closed_at) {
      const closedWeek = isoWeek(new Date(issue.closed_at));
      const cBucket = buckets.get(closedWeek);
      if (cBucket) cBucket.issuesClosed++;
    }
  }

  for (const week of weeks) {
    const bucket = buckets.get(week);
    const contributors = weekContributors.get(week);
    if (bucket && contributors) {
      bucket.uniqueContributors = contributors.size;
    }
  }

  return weeks.map((w) => buckets.get(w)!);
}

// ---------------------------------------------------------------------------
// CI pass rate aggregation
// ---------------------------------------------------------------------------

export function aggregateCIPassRates(
  coverageRuns: WorkflowRunItem[],
  nightlyRuns: WorkflowRunItem[],
  weeks: string[],
): CIPassRate[] {
  function weekStats(
    runs: WorkflowRunItem[],
    week: string,
  ): WorkflowWeekStats {
    const weekRuns = runs.filter(
      (r) => isoWeek(new Date(r.created_at)) === week,
    );
    const total = weekRuns.length;
    const passed = weekRuns.filter((r) => r.conclusion === "success").length;
    const rate = total > 0 ? Math.round((passed / total) * 1000) / 10 : 0;
    return { total, passed, rate };
  }

  return weeks.map((week) => ({
    week,
    coverage: weekStats(coverageRuns, week),
    nightly: weekStats(nightlyRuns, week),
  }));
}

// ---------------------------------------------------------------------------
// Contributor growth aggregation
// ---------------------------------------------------------------------------

export function aggregateContributorGrowth(
  prs: PRItem[],
  issues: IssueItem[],
  weeks: string[],
): ContributorGrowth {
  const firstSeen = new Map<string, string>();

  for (const pr of prs) {
    const week = isoWeek(new Date(pr.created_at));
    const login = pr.user.login;
    const existing = firstSeen.get(login);
    if (!existing || week < existing) {
      firstSeen.set(login, week);
    }
  }
  for (const issue of issues) {
    const week = isoWeek(new Date(issue.created_at));
    const login = issue.user.login;
    const existing = firstSeen.get(login);
    if (!existing || week < existing) {
      firstSeen.set(login, week);
    }
  }

  const total = firstSeen.size;

  let runningTotal = 0;
  const earliestWeek = weeks[0] || "";
  for (const [, week] of firstSeen) {
    if (week < earliestWeek) runningTotal++;
  }

  const weekly = weeks.map((week) => {
    let newContributors = 0;
    for (const [, firstWeek] of firstSeen) {
      if (firstWeek === week) newContributors++;
    }
    runningTotal += newContributors;
    return { week, newContributors, totalToDate: runningTotal };
  });

  return { total, weekly };
}
