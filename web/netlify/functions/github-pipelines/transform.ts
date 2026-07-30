/**
 * Data transformation utilities for GitHub Pipelines Dashboard
 */
import type { WorkflowRun, Status, Conclusion } from "./types";
import { PR_FROM_COMMIT_RE } from "./constants";

/** YYYY-MM-DD in UTC */
export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Map GitHub's workflow_run shape to our WorkflowRun type */
export function normalizeRun(r: Record<string, unknown>, repo: string): WorkflowRun {
  let rawPRs = Array.isArray(r.pull_requests)
    ? (r.pull_requests as Array<{ number?: number; url?: string }>)
      .filter((pr) => typeof pr.number === "number")
      .map((pr) => ({ number: pr.number!, url: String(pr.url ?? "") }))
    : undefined;
  // For push events (merge commits), the pull_requests array is empty.
  // Extract the PR number from the commit message pattern "feat: … (#1234)".
  if ((!rawPRs || rawPRs.length === 0) && r.event === "push") {
    const headCommit = r.head_commit as { message?: string } | undefined;
    const msg = headCommit?.message ?? "";
    const m = PR_FROM_COMMIT_RE.exec(msg);
    if (m) {
      const num = Number(m[1]);
      if (num > 0) {
        rawPRs = [{ number: num, url: `https://github.com/${repo}/pull/${num}` }];
      }
    }
  }
  return {
    id: Number(r.id),
    repo,
    name: String(r.name ?? ""),
    workflowId: Number(r.workflow_id ?? 0),
    headBranch: String(r.head_branch ?? ""),
    status: (r.status as Status) ?? "completed",
    conclusion: (r.conclusion as Conclusion) ?? null,
    event: String(r.event ?? ""),
    runNumber: Number(r.run_number ?? 0),
    htmlUrl: String(r.html_url ?? ""),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
    pullRequests: rawPRs?.length ? rawPRs : undefined,
  };
}
