import { describe, expect, it } from 'vitest'

import { buildGitHubIssueUrl, buildGitHubNewFileUrl } from './githubUrls'

describe('buildGitHubIssueUrl', () => {
  const BASE = 'https://github.com/octo/hello/issues/new'

  it('returns the plain new-issue URL when only owner and repo are provided', () => {
    expect(buildGitHubIssueUrl({ owner: 'octo', repo: 'hello' })).toBe(BASE)
  })

  it('URL-encodes the title', () => {
    const url = buildGitHubIssueUrl({ owner: 'octo', repo: 'hello', title: 'Hello world & friends' })
    expect(url).toBe(`${BASE}?title=Hello+world+%26+friends`)
  })

  it('URL-encodes multi-line bodies', () => {
    const url = buildGitHubIssueUrl({
      owner: 'octo',
      repo: 'hello',
      body: 'line 1\nline 2',
    })
    expect(url).toBe(`${BASE}?body=line+1%0Aline+2`)
  })

  it('joins an array of labels with commas', () => {
    const url = buildGitHubIssueUrl({
      owner: 'octo',
      repo: 'hello',
      labels: ['bug', 'good first issue'],
    })
    // URLSearchParams encodes commas as %2C and spaces as +
    expect(url).toBe(`${BASE}?labels=bug%2Cgood+first+issue`)
  })

  it('drops empty label entries when the array contains falsy values', () => {
    const url = buildGitHubIssueUrl({
      owner: 'octo',
      repo: 'hello',
      labels: ['bug', '', 'triage'],
    })
    expect(url).toBe(`${BASE}?labels=bug%2Ctriage`)
  })

  it('accepts a string label as-is', () => {
    const url = buildGitHubIssueUrl({ owner: 'octo', repo: 'hello', labels: 'bug' })
    expect(url).toBe(`${BASE}?labels=bug`)
  })

  it('omits labels when an empty array is passed', () => {
    const url = buildGitHubIssueUrl({ owner: 'octo', repo: 'hello', labels: [] })
    expect(url).toBe(BASE)
  })

  it('omits labels when an empty string is passed', () => {
    const url = buildGitHubIssueUrl({ owner: 'octo', repo: 'hello', labels: '' })
    expect(url).toBe(BASE)
  })

  it('omits the query string when title and body are empty strings', () => {
    expect(buildGitHubIssueUrl({ owner: 'octo', repo: 'hello', title: '', body: '' })).toBe(BASE)
  })

  it('combines title, body, and labels in a single query string', () => {
    const url = buildGitHubIssueUrl({
      owner: 'octo',
      repo: 'hello',
      title: 'Crash',
      body: 'stack trace',
      labels: ['bug', 'p1'],
    })
    expect(url).toBe(`${BASE}?title=Crash&body=stack+trace&labels=bug%2Cp1`)
  })

  it('preserves owner and repo verbatim in the path', () => {
    const url = buildGitHubIssueUrl({ owner: 'my-org', repo: 'my.repo' })
    expect(url).toBe('https://github.com/my-org/my.repo/issues/new')
  })
})

describe('buildGitHubNewFileUrl', () => {
  it('constructs a new-file URL with the required parameters', () => {
    const url = buildGitHubNewFileUrl({
      owner: 'octo',
      repo: 'hello',
      branch: 'main',
      path: 'src',
      filename: 'foo.ts',
      content: 'export const x = 1',
      message: 'add foo',
    })
    expect(url).toBe(
      'https://github.com/octo/hello/new/main/src?filename=foo.ts&value=export+const+x+%3D+1&message=add+foo',
    )
  })

  it('includes an optional description when provided', () => {
    const url = buildGitHubNewFileUrl({
      owner: 'octo',
      repo: 'hello',
      branch: 'main',
      path: 'src',
      filename: 'foo.ts',
      content: 'x',
      message: 'msg',
      description: 'longer body',
    })
    expect(url).toContain('&description=longer+body')
  })

  it('omits the description parameter when not provided', () => {
    const url = buildGitHubNewFileUrl({
      owner: 'octo',
      repo: 'hello',
      branch: 'main',
      path: 'src',
      filename: 'foo.ts',
      content: 'x',
      message: 'msg',
    })
    expect(url).not.toContain('description=')
  })

  it('URL-encodes multi-line content preserving newlines', () => {
    const url = buildGitHubNewFileUrl({
      owner: 'octo',
      repo: 'hello',
      branch: 'main',
      path: 'src',
      filename: 'foo.ts',
      content: 'line 1\nline 2',
      message: 'msg',
    })
    expect(url).toContain('value=line+1%0Aline+2')
  })

  it('supports nested paths (kept unencoded in the URL path segment)', () => {
    const url = buildGitHubNewFileUrl({
      owner: 'octo',
      repo: 'hello',
      branch: 'feature/x',
      path: 'src/lib/util',
      filename: 'foo.ts',
      content: 'x',
      message: 'msg',
    })
    expect(url.startsWith('https://github.com/octo/hello/new/feature/x/src/lib/util?')).toBe(true)
  })
})
