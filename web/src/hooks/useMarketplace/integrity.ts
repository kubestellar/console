/**
 * Marketplace item integrity verification using SHA-256.
 *
 * When a registry entry includes a `sha256` field, the fetched content
 * is hashed and compared before use. This prevents tampered payloads
 * from being installed silently (e.g., via CDN compromise or MITM).
 */

export class IntegrityError extends Error {
  constructor(expected: string, actual: string) {
    super(
      `Integrity check failed: expected sha256 ${expected}, got ${actual}`
    )
    this.name = 'IntegrityError'
  }
}

/**
 * Compute SHA-256 hex digest of a string payload using Web Crypto API.
 */
export async function computeSha256(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Verify that `content` matches the expected SHA-256 digest.
 * If `expectedHash` is undefined/null (registry entry has no sha256 field),
 * verification is skipped — this allows gradual adoption.
 *
 * @throws IntegrityError if hash does not match.
 */
export async function verifyIntegrity(
  content: string,
  expectedHash: string | undefined
): Promise<void> {
  if (!expectedHash) return

  const normalizedExpected = expectedHash.toLowerCase().trim()
  const actual = await computeSha256(content)

  if (actual !== normalizedExpected) {
    throw new IntegrityError(normalizedExpected, actual)
  }
}
