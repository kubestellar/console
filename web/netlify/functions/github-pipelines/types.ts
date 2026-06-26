/**
 * Type definitions for GitHub Pipelines Dashboard
 */

export type Conclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "neutral"
  | "stale"
  | null;

export type Status = "queued" | "in_progress" | "completed" | "waiting" | "pending";

export interface PullRequestRef {
  number: number;
  url: string;
}

export interface WorkflowRun {
  id: number;
  repo: string;
  name: string;
  workflowId: number;
  headBranch: string;
  status: Status;
  conclusion: Conclusion;
  event: string;
  runNumber: number;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  pullRequests?: PullRequestRef[];
}

export interface JobStep {
  name: string;
  status: Status;
  conclusion: Conclusion;
  number: number;
  startedAt?: string;
  completedAt?: string;
}

export interface Job {
  id: number;
  name: string;
  status: Status;
  conclusion: Conclusion;
  startedAt: string | null;
  completedAt: string | null;
  htmlUrl: string;
  steps: JobStep[];
}

export interface CachedView<T> {
  payload: T;
  fetchedAt: number;
}

/** Rolling long-term history, keyed by repo → workflow → YYYY-MM-DD */
export interface HistoryBlob {
  /** ISO string of the most recent write — used for cache-coherence */
  updatedAt: string;
  /** repo/owner → workflow name → date → summary */
  days: Record<string, Record<string, Record<string, HistoryDay>>>;
}

export interface HistoryDay {
  runId: number;
  conclusion: Conclusion;
  htmlUrl: string;
}

// ---------------------------------------------------------------------------
// Pulse view
// ---------------------------------------------------------------------------

export interface PulsePayload {
  /** The latest completed Release workflow run on kubestellar/console */
  lastRun: {
    conclusion: Conclusion;
    createdAt: string;
    htmlUrl: string;
    runNumber: number;
    releaseTag: string | null;
    weeklyTag?: string | null;
  } | null;
  /** Consecutive conclusions of the same kind, counting back from lastRun */
  streak: number;
  streakKind: "success" | "failure" | "mixed";
  /** The last 14 nightly conclusions, oldest → newest */
  recent: Array<{ conclusion: Conclusion; createdAt: string; htmlUrl: string }>;
  /** Cron expression from the workflow, best-effort */
  nextCron: string;
}

// ---------------------------------------------------------------------------
// Matrix view
// ---------------------------------------------------------------------------

export interface MatrixCell {
  date: string; // YYYY-MM-DD
  conclusion: Conclusion;
  htmlUrl: string;
}

export interface MatrixWorkflow {
  repo: string;
  name: string;
  cells: MatrixCell[];
}

export interface MatrixPayload {
  days: number;
  range: string[]; // YYYY-MM-DD, oldest → newest
  workflows: MatrixWorkflow[];
}

// ---------------------------------------------------------------------------
// Flow view
// ---------------------------------------------------------------------------

export interface FlowRun {
  run: WorkflowRun;
  jobs: Job[];
}

export interface FlowPayload {
  runs: FlowRun[];
}

// ---------------------------------------------------------------------------
// Failures view
// ---------------------------------------------------------------------------

export interface FailureRow {
  repo: string;
  runId: number;
  workflow: string;
  htmlUrl: string;
  branch: string;
  event: string;
  conclusion: Conclusion;
  createdAt: string;
  durationMs: number;
  /** First failed step (name + job id for log drill-down) */
  failedStep: { jobId: number; jobName: string; stepName: string } | null;
  pullRequests?: PullRequestRef[];
}

export interface FailuresPayload {
  runs: FailureRow[];
}
