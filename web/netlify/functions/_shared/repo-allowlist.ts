/**
 * Shared GitHub repository allowlist helpers for Netlify Functions.
 *
 * Security-sensitive endpoints must reject arbitrary owner/repo input before
 * making authenticated upstream GitHub requests on behalf of the server.
 */

type NetlifyRuntime = {
  Netlify?: {
    env?: {
      get?: (name: string) => string | undefined;
    };
  };
};

const REPO_SLUG_RE = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

function getRuntimeEnv(name: string): string | undefined {
  return (globalThis as NetlifyRuntime).Netlify?.env?.get?.(name) ?? process.env[name];
}

function normalizeRepoSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

function parseRepoAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((repo) => normalizeRepoSlug(repo))
    .filter((repo) => REPO_SLUG_RE.test(repo));
}

export const DEFAULT_ALLOWED_REPOS = [
  "kubestellar/kubestellar",
  "kubestellar/console",
  "kubestellar/docs",
  "kubestellar/console-kb",
  "kubestellar/console-marketplace",
  "kubestellar/kubestellar-mcp",
  "kubestellar/homebrew-tap",
];

export function getAllowedRepoSlugs(envVarNames: readonly string[] = []): string[] {
  for (const envVarName of envVarNames) {
    const configuredRepos = parseRepoAllowlist(getRuntimeEnv(envVarName));
    if (configuredRepos.length > 0) {
      return configuredRepos;
    }
  }

  return DEFAULT_ALLOWED_REPOS;
}

function toAllowedRepoSet(allowedRepos: Iterable<string>): Set<string> {
  return new Set(Array.from(allowedRepos, normalizeRepoSlug));
}

export function isAllowedRepo(owner: string, repo: string, allowedRepos: Iterable<string> = DEFAULT_ALLOWED_REPOS): boolean {
  return isAllowedRepoSlug(`${owner}/${repo}`, allowedRepos);
}

export function isAllowedRepoSlug(slug: string, allowedRepos: Iterable<string> = DEFAULT_ALLOWED_REPOS): boolean {
  return toAllowedRepoSet(allowedRepos).has(normalizeRepoSlug(slug));
}
