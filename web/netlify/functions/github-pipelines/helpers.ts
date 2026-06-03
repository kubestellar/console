/**
 * Helper utilities for GitHub Pipelines Dashboard
 */
import type { getStore } from "@netlify/blobs";
import type { CachedView } from "./types";
import { CACHE_TTL_MS, VALID_REPO_PATTERN, getRepos } from "./constants";
import { isAllowedOrigin } from "../_shared/cors";

/** DEPRECATED: Use buildCorsHeaders from _shared/cors.ts instead */
export function corsOrigin(origin: string | null): string {
  // Strict allowlist — no wildcard subdomain matching (CWE-942 mitigation)
  if (!origin) return "https://console.kubestellar.io";
  if (isAllowedOrigin(origin)) return origin;
  return "https://console.kubestellar.io";
}

export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

/**
 * SECURITY: Validate repository input against strict allowlist.
 * Prevents the server token from being used as a confused deputy to access
 * arbitrary private repos (CWE-285, CWE-441).
 * 
 * @param repo - Repository slug to validate (owner/name format)
 * @returns true if repo is in the allowlist AND matches format, false otherwise
 */
export function isValidRepo(repo: string | null): boolean {
  if (!repo || !VALID_REPO_PATTERN.test(repo)) {
    return false;
  }
  
  // Check against allowlist (PIPELINE_REPOS env var or default KubeStellar repos)
  const allowedRepos = getRepos();
  return allowedRepos.includes(repo);
}

export async function readCache<T>(
  store: ReturnType<typeof getStore>,
  key: string
): Promise<CachedView<T> | null> {
  try {
    const raw = await store.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedView<T>;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCache<T>(
  store: ReturnType<typeof getStore>,
  key: string,
  payload: T
): Promise<void> {
  const entry: CachedView<T> = { payload, fetchedAt: Date.now() };
  await store.set(key, JSON.stringify(entry));
}
