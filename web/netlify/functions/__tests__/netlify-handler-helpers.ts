/**
 * Shared helpers for Netlify function handler tests (#15397).
 */
import { expect } from "vitest";

/** Fake token — must never appear in response bodies */
export const FAKE_GITHUB_TOKEN = "gho_TEST_TOKEN_15397_do_not_leak";

export const FAKE_MUTATE_AUTH_TOKEN = "mutate-auth-token-15397-secret";

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

export function freshBlobCacheEntry<T>(payload: T): string {
  return JSON.stringify({ payload, fetchedAt: Date.now() });
}
