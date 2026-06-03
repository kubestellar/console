/**
 * Constants for GitHub Pipelines Dashboard
 */

import { DEFAULT_ALLOWED_REPOS, getAllowedRepoSlugs } from "../_shared/repo-allowlist";

export const GITHUB_API = "https://api.github.com";

/** Netlify Blobs store for all cached pipeline views */
export const STORE_NAME = "github-pipelines-cache";

/** Blob key for the rolling 90-day history (outlives GitHub's retention) */
export const HISTORY_KEY = "history-v1";

/** Cache TTL for view responses */
export const CACHE_TTL_MS = 120_000; // 2 min

/** Per-IP read throttling for the public dashboard endpoint */
export const READ_RATE_LIMIT_STORE_NAME = "github-pipelines-rate-limit";
export const READ_RATE_LIMIT_MAX_REQUESTS = 120;
export const READ_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** Per-IP mutation throttling for the auth-gated mutation endpoint */
export const MUTATION_RATE_LIMIT_STORE_NAME = "github-pipelines-mutate-rate-limit";
export const MUTATION_RATE_LIMIT_MAX_REQUESTS = 5;
export const MUTATION_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** Default auth cookie accepted by the mutation endpoint when configured */
export const MUTATION_AUTH_COOKIE_NAME = "kc_auth";

/** Matrix defaults */
export const MATRIX_DEFAULT_DAYS = 14;
export const MATRIX_MAX_DAYS = 90;
/** History is capped at this many days on every write */
export const HISTORY_RETENTION_DAYS = 90;

/** Failures view: max runs returned to client */
export const FAILURES_LIMIT = 10;
/** Failures view: overfetch then filter so we get enough after pagination */
export const FAILURES_OVERFETCH = 30;

/** Log view: how many tail lines of the failed step to return */
export const LOG_TAIL_LINES = 500;

/** How many workflow runs to pull per repo for the matrix view */
export const MATRIX_RUNS_PER_REPO = 200;

/** How many in-progress/queued runs to pull per repo for the flow view */
export const FLOW_MAX_RUNS_PER_REPO = 8;

/** Default repos when PIPELINE_REPOS env var is not set */
export const DEFAULT_REPOS = DEFAULT_ALLOWED_REPOS;

/** The nightly release workflow on kubestellar/console — drives the Pulse card */
export const NIGHTLY_RELEASE_REPO = "kubestellar/console";
export const NIGHTLY_RELEASE_WORKFLOW = "release.yml";

/** How many releases to fetch so we can sort by published_at ourselves */
export const RELEASE_OVERFETCH = 10;

/** Matches nightly release tags like "v0.3.21-nightly.20260417" */
export const NIGHTLY_TAG_RE = /nightly/i;

/** Extracts PR number from merge-commit messages like "feat: something (#8673)" */
export const PR_FROM_COMMIT_RE = /\(#(\d+)\)\s*$/;

/** ms per day — used in matrix date math */
export const MS_PER_DAY = 86_400_000;

/** GitHub API fetch with auth + typed error */
export const GH_RETRY_MAX_ATTEMPTS = 3;
export const GH_RETRY_BASE_DELAY_MS = 1_000;

/** Matches `owner/repo` format for allowlisted repos. */
export const VALID_REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

/**
 * Repos scanned by the pipelines dashboard. Centralized: set the
 * PIPELINE_REPOS env var to a comma-separated list of owner/repo strings
 * to override (e.g. "myorg/myrepo" for a single-repo install, or
 * "org/a,org/b,org/c" for multi-repo). If unset, defaults to the
 * shared KubeStellar allowlist above. The repo list is returned in every API
 * response so the frontend never hardcodes it.
 */
export function getRepos(): string[] {
  return getAllowedRepoSlugs(["PIPELINE_REPOS"]);
}
