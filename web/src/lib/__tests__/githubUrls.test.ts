import { describe, it, expect } from 'vitest'
import { buildGitHubIssueUrl, buildGitHubNewFileUrl } from '../githubUrls'

describe('buildGitHubIssueUrl', () => {
  it('returns base URL with no optional params', () => {
    const url = buildGitHubIssueUrl({ owner: 'kubestellar', repo: 'console' })
    expect(url).toBe('https://github.com/kubestellar/console/issues/new')
  })

  it('includes title query param', () => {
    const url = buildGitHubIssueUrl({ owner: 'org', repo: 'repo', title: 'Bug report' })
    expect(url).toContain('title=Bug+report')
    expect(url).toContain('https://github.com/org/repo/issues/new?')
  })

  it('includes body query param', () => {
    const url = buildGitHubIssueUrl({ owner: 'org', repo: 'repo', body: 'Describe the bug' })
    expect(url).toContain('body=Describe+the+bug')
  })

  it('includes labels as string', () => {
    const url = buildGitHubIssueUrl({ owner: 'org', repo: 'repo', labels: 'bug' })
    expect(url).toContain('labels=bug')
  })

  it('includes labels as array joined by comma', () => {
    const url = buildGitHubIssueUrl({ owner: 'org', repo: 'repo', labels: ['bug', 'enhancement'] })
    expect(url).toContain('labels=bug%2Cenhancement')
  })

  it('filters empty strings from labels array', () => {
    const url = buildGitHubIssueUrl({ owner: 'org', repo: 'repo', labels: ['bug', '', 'ui'] })
    expect(url).not.toContain('%2C%2C')
    expect(url).toContain('bug')
    expect(url).toContain('ui')
  })

  it('omits labels param when labels array is empty', () => {
    const url = buildGitHubIssueUrl({ owner: 'org', repo: 'repo', labels: [] })
    expect(url).not.toContain('labels')
  })

  it('includes all optional params together', () => {
    const url = buildGitHubIssueUrl({
      owner: 'kubestellar',
      repo: 'console',
      title: 'Test issue',
      body: 'Body text',
      labels: ['bug', 'triage'],
    })
    expect(url).toContain('title=')
    expect(url).toContain('body=')
    expect(url).toContain('labels=')
  })
})

describe('buildGitHubNewFileUrl', () => {
  const base = {
    owner: 'kubestellar',
    repo: 'console-marketplace',
    branch: 'main',
    path: 'integrations',
    filename: 'my-tool.yaml',
    content: 'name: my-tool',
    message: 'Add my-tool integration',
  }

  it('returns a GitHub new-file URL', () => {
    const url = buildGitHubNewFileUrl(base)
    expect(url).toContain('https://github.com/kubestellar/console-marketplace/new/main/integrations')
  })

  it('includes filename, value, and message params', () => {
    const url = buildGitHubNewFileUrl(base)
    expect(url).toContain('filename=my-tool.yaml')
    expect(url).toContain('value=name%3A+my-tool')
    expect(url).toContain('message=Add+my-tool+integration')
  })

  it('includes description when provided', () => {
    const url = buildGitHubNewFileUrl({ ...base, description: 'My tool description' })
    expect(url).toContain('description=My+tool+description')
  })

  it('omits description when not provided', () => {
    const url = buildGitHubNewFileUrl(base)
    expect(url).not.toContain('description=')
  })
})
