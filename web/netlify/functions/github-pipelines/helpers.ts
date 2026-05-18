/**
 * Helper utilities for GitHub Pipelines Dashboard
 */
import type { getStore } from "@netlify/blobs";
import type { CachedView } from "./types";
import { ALLOWED_ORIGINS, CACHE_TTL_MS, VALID_REPO_PATTERN } from "./constants";

export function corsOrigin(origin: string | null): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host === "kubestellar.io" || host.endsWith(".kubestellar.io")) {
      return origin;
    }
    if (host === "localhost") return origin;
  } catch {
    // Malformed origin — fall through to default
  }
  return ALLOWED_ORIGINS[0];
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

export function isValidRepo(repo: string | null): boolean {
  return !!repo && VALID_REPO_PATTERN.test(repo);
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
