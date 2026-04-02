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

/** Classic PAT scope required (covers all of the above) */
export const GITHUB_TOKEN_CLASSIC_SCOPE = 'repo'

/** URLs for creating tokens on GitHub */
export const GITHUB_TOKEN_CREATE_URL = 'https://github.com/settings/personal-access-tokens/new'
export const GITHUB_TOKEN_MANAGE_URL = 'https://github.com/settings/personal-access-tokens'
export const GITHUB_TOKEN_CLASSIC_URL = 'https://github.com/settings/tokens/new?description=KubeStellar%20Console&scopes=repo'

/** Human-readable summary for UI display */
export const GITHUB_TOKEN_PERMISSION_SUMMARY = {
  fineGrained: GITHUB_TOKEN_FINE_GRAINED_PERMISSIONS.map(p => p.scope).join(' + '),
  classic: `'${GITHUB_TOKEN_CLASSIC_SCOPE}' scope`,
} as const
