import { describe, it, expect } from 'vitest'
import {
  GitHubWorkflowRunSchema,
  GitHubWorkflowRunsResponseSchema,
} from '../github'

describe('GitHubWorkflowRunSchema', () => {
  it('accepts a full workflow run object', () => {
    const run = {
      id: 12345,
      name: 'CI',
      status: 'completed',
      conclusion: 'success',
      html_url: 'https://github.com/org/repo/actions/runs/12345',
      head_branch: 'main',
      event: 'push',
      pull_requests: [{ number: 42, url: 'https://api.github.com/repos/org/repo/pulls/42' }],
      head_commit: { message: 'fix: something' },
    }
    const result = GitHubWorkflowRunSchema.safeParse(run)
    expect(result.success).toBe(true)
  })

  it('accepts a minimal workflow run (all fields optional)', () => {
    const result = GitHubWorkflowRunSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts conclusion as null', () => {
    const result = GitHubWorkflowRunSchema.safeParse({ conclusion: null })
    expect(result.success).toBe(true)
  })

  it('accepts head_commit as null', () => {
    const result = GitHubWorkflowRunSchema.safeParse({ head_commit: null })
    expect(result.success).toBe(true)
  })

  it('passes through unknown fields via passthrough()', () => {
    const run = { id: 1, unknown_field: 'hello', actor: { login: 'user' } }
    const result = GitHubWorkflowRunSchema.safeParse(run)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveProperty('unknown_field', 'hello')
    }
  })
})

describe('GitHubWorkflowRunsResponseSchema', () => {
  it('accepts a response with workflow_runs array', () => {
    const response = {
      workflow_runs: [
        { id: 1, name: 'CI', status: 'completed' },
        { id: 2, name: 'Deploy', status: 'in_progress' },
      ],
    }
    const result = GitHubWorkflowRunsResponseSchema.safeParse(response)
    expect(result.success).toBe(true)
  })

  it('accepts a response with no workflow_runs (optional)', () => {
    const result = GitHubWorkflowRunsResponseSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts empty workflow_runs array', () => {
    const result = GitHubWorkflowRunsResponseSchema.safeParse({ workflow_runs: [] })
    expect(result.success).toBe(true)
  })

  it('rejects workflow_runs as a non-array', () => {
    const result = GitHubWorkflowRunsResponseSchema.safeParse({ workflow_runs: 'not-array' })
    expect(result.success).toBe(false)
  })
})
