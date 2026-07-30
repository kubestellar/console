/**
 * Single source of truth for GitHub token permission requirements.
 *
 * Referenced by: Settings page, feedback modals, .env.example comments,
 * and backend log messages. Keep this in sync if requirements change.
 */

/** Fine-grained PAT permissions required for end-user feedback features.
 *  Note: Contents scope is NOT needed — screenshots are added as issue
 *  comments and processed into images by a GitHub Actions workflow. */
export const GITHUB_TOKEN_FINE_GRAINED_PERMISSIONS = [
  { scope: 'Issues: Read and write', reason: 'create issues, add comments, and attach screenshots' },
] as const

/** URLs for creating tokens on GitHub */
export const GITHUB_TOKEN_CREATE_URL = 'https://github.com/settings/personal-access-tokens/new'
export const GITHUB_TOKEN_CLASSIC_URL = 'https://github.com/settings/tokens/new?description=KubeStellar%20Console&scopes=repo'
