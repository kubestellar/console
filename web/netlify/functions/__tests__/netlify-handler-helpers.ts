/**
 * Shared helpers for Netlify function handler tests (#15397, #15399, #15403).
 */
import { expect } from "vitest";

/** Synthetic host for handler tests — not a real deployment. */
export const TEST_NETLIFY_BASE_URL = "https://example.test";

/** Local dev origin accepted by buildCorsHeaders allowlist. */
export const TEST_CORS_ORIGIN = "http://localhost:5174";

/** Fake token — must never appear in response bodies.
 * Uses a non-standard prefix so GitHub secret scanning does not flag it. */
export const FAKE_GITHUB_TOKEN = "test_github_token_placeholder_not_a_real_secret";

export const FAKE_MUTATE_AUTH_TOKEN = "mutate-auth-token-15397-secret";

/** Field names that must never appear in identity demo API responses */
export const FORBIDDEN_IDENTITY_RESPONSE_KEYS = [
  "client_secret",
  "refresh_token",
  "access_token",
  "password",
  "GITHUB_TOKEN",
  "GITHUB_MUTATIONS_TOKEN",
] as const;

export async function readJson<T = unknown>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

export function assertResponseHasNoSecrets(
  bodyText: string,
  secrets: string[],
): void {
  for (const secret of secrets) {
    expect(bodyText).not.toContain(secret);
  }
}

export function assertNoForbiddenIdentityFields(bodyText: string): void {
  for (const field of FORBIDDEN_IDENTITY_RESPONSE_KEYS) {
    expect(bodyText).not.toContain(`"${field}"`);
  }
  assertResponseHasNoSecrets(bodyText, [
    FAKE_GITHUB_TOKEN,
    "github_pat_",
    "Bearer gho_",
  ]);
}

export function makeIdentityRequest(
  path: string,
  options?: { method?: string; search?: string },
): Request {
  const search = options?.search ? `?${options.search}` : "";
  return new Request(`https://console.kubestellar.io${path}${search}`, {
    method: options?.method ?? "GET",
    headers: { Origin: "https://console.kubestellar.io" },
  });
}

export function makeNetlifyRequest(
  path: string,
  options?: {
    method?: string;
    search?: string;
    headers?: Record<string, string>;
    baseUrl?: string;
    origin?: string;
  },
): Request {
  const baseUrl = options?.baseUrl ?? TEST_NETLIFY_BASE_URL;
  const origin = options?.origin ?? TEST_CORS_ORIGIN;
  const search = options?.search ? `?${options.search}` : "";
  return new Request(`${baseUrl}${path}${search}`, {
    method: options?.method ?? "GET",
    headers: {
      Origin: origin,
      ...options?.headers,
    },
  });
}

export function freshBlobCacheEntry<T>(payload: T): string {
  return JSON.stringify({ payload, fetchedAt: Date.now() });
}
