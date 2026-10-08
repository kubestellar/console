// Fetches recent GitHub Actions workflow runs for the configured repos.
// Extracted from GitHubCIMonitor.tsx (issue #24058).
import { FETCH_EXTERNAL_TIMEOUT_MS } from '../../../lib/constants'
import { GitHubWorkflowRunsResponseSchema } from '../../../lib/schemas'
import { validateResponse } from '../../../lib/schemas/validate'
import { DEMO_WORKFLOWS, type WorkflowRun } from './GitHubCIMonitor.constants'

export interface GitHubCIData {
  workflows: WorkflowRun[]
  isDemo: boolean
}

export async function fetchGitHubCIWorkflows(repos: string[]): Promise<GitHubCIData> {
  const allRuns: WorkflowRun[] = []
  for (const repo of repos) {
    try {
      const response = await fetch(`/api/github/repos/${repo}/actions/runs?per_page=10`, {
        headers: { Accept: 'application/vnd.github.v3+json' },
        signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) })
      if (response.status === 401 || response.status === 403) {
        // Token invalid or missing — fall back to demo data
        return { workflows: DEMO_WORKFLOWS, isDemo: true }
      }
      if (!response.ok) continue // Skip this repo on other errors
      // Use .catch() directly to prevent Firefox from firing unhandledrejection
      // before the outer try/catch processes the rejection (Firefox-specific timing issue).
      const rawGH = await response.json().catch(() => null)
      const data = validateResponse(GitHubWorkflowRunsResponseSchema, rawGH, `/api/github/repos/${repo}/actions/runs`)
      if (!data) continue
      const prFromCommit = /\(#(\d+)\)\s*$/
      const runs = (data.workflow_runs || []).map((run: Record<string, unknown>) => {
        const prs = run.pull_requests as { number: number; url: string }[] | undefined
        let prNumber: number | undefined
        let prUrl: string | undefined
        if (prs && prs.length > 0) {
          prNumber = prs[0].number
          prUrl = `https://github.com/${repo}/pull/${prs[0].number}`
        } else if (run.event === 'push') {
          const msg = (run.head_commit as { message?: string } | undefined)?.message ?? ''
          const m = prFromCommit.exec(msg)
          if (m) {
            prNumber = parseInt(m[1], 10)
            prUrl = `https://github.com/${repo}/pull/${m[1]}`
          }
        }
        return {
          id: String(run.id),
          name: run.name as string,
          repo,
          status: run.status as WorkflowRun['status'],
          conclusion: run.conclusion as WorkflowRun['conclusion'],
          branch: (run.head_branch || 'unknown') as string,
          event: (run.event || 'unknown') as string,
          runNumber: run.run_number as number,
          createdAt: run.created_at as string,
          updatedAt: run.updated_at as string,
          url: (run.html_url || '#') as string,
          prNumber,
          prUrl,
        }
      })
      allRuns.push(...runs)
    } catch {
      // Network error for this repo — skip it
      continue
    }
  }

  if (allRuns.length > 0) {
    return { workflows: allRuns, isDemo: false }
  }
  return { workflows: DEMO_WORKFLOWS, isDemo: true }
}
