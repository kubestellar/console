/**
 * Zod schemas for GitHub Actions API responses.
 *
 * Covers the workflow-runs endpoint consumed by GitHubCIMonitor.tsx.
 * We intentionally use `.passthrough()` on the run object because the
 * GitHub API returns many fields we don't need to enumerate — we only
 * validate the structural shape the component relies on.
 */
import { z } from 'zod'

/** A single workflow run from the GitHub Actions API. */
export const GitHubWorkflowRunSchema = z.object({
  id: z.number().optional(),
  name: z.string().optional(),
  status: z.string().optional(),
  conclusion: z.string().nullable().optional(),
  html_url: z.string().optional(),
  head_branch: z.string().optional(),
  event: z.string().optional(),
  pull_requests: z.array(z.object({
    number: z.number(),
    url: z.string(),
  })).optional(),
  head_commit: z.object({
    message: z.string().optional(),
  }).nullable().optional(),
}).passthrough()

/** Response from /actions/runs endpoint. */
export const GitHubWorkflowRunsResponseSchema = z.object({
  workflow_runs: z.array(GitHubWorkflowRunSchema).optional(),
})
export type GitHubWorkflowRunsResponse = z.infer<typeof GitHubWorkflowRunsResponseSchema>
