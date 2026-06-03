const ACMM_REPOS_ENV = "ACMM_REPOS";
const REPO_SLUG_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

export const ALLOWED_ACMM_REPOS = new Set([
  "kubestellar/kubestellar",
  "kubestellar/console",
  "kubestellar/docs",
  "kubestellar/ocm-transport-plugin",
  "kubestellar/galaxy",
  "kubestellar/ui",
  "kubestellar/kubestellar-mcp",
  "kubestellar/homebrew-tap",
]);

function normalizeRepo(repo: string): string {
  return repo.trim().toLowerCase();
}

function parseAllowedACMMRepos(envValue?: string): string[] {
  return (envValue ?? "")
    .split(",")
    .map((repo) => normalizeRepo(repo))
    .filter((repo) => REPO_SLUG_RE.test(repo));
}

export function getAllowedACMMRepos(
  envValue = process.env[ACMM_REPOS_ENV],
): ReadonlySet<string> {
  const configuredRepos = parseAllowedACMMRepos(envValue);
  return configuredRepos.length > 0
    ? new Set(configuredRepos)
    : ALLOWED_ACMM_REPOS;
}

export function isAllowedACMMRepo(
  repo: string,
  envValue = process.env[ACMM_REPOS_ENV],
): boolean {
  return getAllowedACMMRepos(envValue).has(normalizeRepo(repo));
}
