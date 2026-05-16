interface BuildGitHubIssueUrlOptions {
  owner: string
  repo: string
  title?: string
  body?: string
  labels?: string | string[]
}

interface BuildGitHubNewFileUrlOptions {
  owner: string
  repo: string
  branch: string
  path: string
  filename: string
  content: string
  message: string
  description?: string
}

export function buildGitHubIssueUrl({
  owner,
  repo,
  title,
  body,
  labels,
}: BuildGitHubIssueUrlOptions): string {
  const params = new URLSearchParams()

  if (title) params.set('title', title)
  if (body) params.set('body', body)

  const labelValue = Array.isArray(labels) ? labels.filter(Boolean).join(',') : labels
  if (labelValue) params.set('labels', labelValue)

  const query = params.toString()
  return `https://github.com/${owner}/${repo}/issues/new${query ? `?${query}` : ''}`
}

export function buildGitHubNewFileUrl({
  owner,
  repo,
  branch,
  path,
  filename,
  content,
  message,
  description,
}: BuildGitHubNewFileUrlOptions): string {
  const params = new URLSearchParams()
  params.set('filename', filename)
  params.set('value', content)
  params.set('message', message)
  if (description) params.set('description', description)

  return `https://github.com/${owner}/${repo}/new/${branch}/${path}?${params.toString()}`
}
