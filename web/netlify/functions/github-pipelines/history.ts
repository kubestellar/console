/**
 * History blob management for GitHub Pipelines Dashboard
 */
import type { getStore } from "@netlify/blobs";
import type { HistoryBlob, WorkflowRun, Conclusion } from "./types";
import { HISTORY_KEY, HISTORY_RETENTION_DAYS, MS_PER_DAY } from "./constants";
import { dayKey } from "./transform";

export async function readHistory(
  store: ReturnType<typeof getStore>
): Promise<HistoryBlob> {
  try {
    const raw = await store.get(HISTORY_KEY);
    if (!raw) return { updatedAt: new Date(0).toISOString(), days: {} };
    return JSON.parse(raw) as HistoryBlob;
  } catch {
    return { updatedAt: new Date(0).toISOString(), days: {} };
  }
}

export async function writeHistory(
  store: ReturnType<typeof getStore>,
  history: HistoryBlob
): Promise<void> {
  // Trim to retention window
  const cutoff = new Date(Date.now() - HISTORY_RETENTION_DAYS * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
  for (const repo of Object.keys(history.days)) {
    for (const wf of Object.keys(history.days[repo])) {
      for (const d of Object.keys(history.days[repo][wf])) {
        if (d < cutoff) delete history.days[repo][wf][d];
      }
    }
  }
  history.updatedAt = new Date().toISOString();
  await store.set(HISTORY_KEY, JSON.stringify(history));
}

/** Merge a batch of runs into the history blob. Newest run per day wins. */
export function mergeIntoHistory(history: HistoryBlob, runs: WorkflowRun[]): void {
  for (const run of runs) {
    const day = dayKey(run.createdAt);
    if (!day) continue;
    const byRepo = (history.days[run.repo] ??= {});
    const byWf = (byRepo[run.name] ??= {});
    const existing = byWf[day];
    // When conclusion is null but status indicates activity, surface
    // "in_progress" so the matrix renders a blue dot, not grey.
    const conclusion: Conclusion =
      run.conclusion === null && (run.status === "in_progress" || run.status === "queued")
        ? "in_progress" as Conclusion
        : run.conclusion;
    // Newer run wins (higher ID ≈ newer). Failure trumps success for the same day
    // if one of the runs failed — CI health signal matters more than "latest".
    if (!existing || run.id > existing.runId) {
      byWf[day] = {
        runId: run.id,
        conclusion,
        htmlUrl: run.htmlUrl,
      };
    }
  }
}
