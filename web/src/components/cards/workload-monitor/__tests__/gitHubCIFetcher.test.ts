import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchGitHubCIWorkflows } from '../gitHubCIFetcher'
import { DEMO_WORKFLOWS } from '../GitHubCIMonitor.constants'

const PR_NUMBER = 42
const RUN_NUMBER = 7

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('fetchGitHubCIWorkflows', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('falls back to demo workflows on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 401)))
    const result = await fetchGitHubCIWorkflows(['org/repo'])
    expect(result).toEqual({ workflows: DEMO_WORKFLOWS, isDemo: true })
  })

  it('falls back to demo workflows when no runs are returned', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const result = await fetchGitHubCIWorkflows(['org/repo'])
    expect(result.isDemo).toBe(true)
  })

  it('maps workflow runs and extracts PR number from push commit message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      total_count: 1,
      workflow_runs: [{
        id: 1,
        name: 'CI',
        status: 'completed',
        conclusion: 'success',
        head_branch: 'main',
        event: 'push',
        run_number: RUN_NUMBER,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:01:00Z',
        html_url: 'https://github.com/org/repo/actions/runs/1',
        pull_requests: [],
        head_commit: { message: `Fix thing (#${PR_NUMBER})` },
      }],
    })))
    const result = await fetchGitHubCIWorkflows(['org/repo'])
    expect(result.isDemo).toBe(false)
    expect(result.workflows).toHaveLength(1)
    expect(result.workflows[0].repo).toBe('org/repo')
    expect(result.workflows[0].runNumber).toBe(RUN_NUMBER)
    expect(result.workflows[0].prNumber).toBe(PR_NUMBER)
    expect(result.workflows[0].prUrl).toBe(`https://github.com/org/repo/pull/${PR_NUMBER}`)
  })
})
