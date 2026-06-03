/**
 * Shared allowlist for public GitHub repos exposed through Netlify functions.
 */

export const ALLOWED_GITHUB_REPOS = [
  "kubestellar/console",
  "kubestellar/docs",
  "kubestellar/console-kb",
  "kubestellar/kubestellar-mcp",
  "kubestellar/console-marketplace",
  "kubestellar/homebrew-tap",
  "kubestellar/kubestellar",
] as const;

const ALLOWED_GITHUB_REPO_SET = new Set(
  ALLOWED_GITHUB_REPOS.map((repo) => repo.toLowerCase()),
);

export function isAllowedGitHubRepo(repo: string): boolean {
  return ALLOWED_GITHUB_REPO_SET.has(repo.toLowerCase());
}
