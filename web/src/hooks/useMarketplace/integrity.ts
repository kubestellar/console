/**
 * Marketplace item integrity verification using SHA-256.
 *
 * Every marketplace entry must provide a `sha256` field. Downloaded content
 * is hashed and compared before use so untrusted or tampered payloads are
 * rejected before they are persisted.
 */

export class IntegrityError extends Error {
  constructor(expected: string, actual: string) {
    super(
      `Integrity check failed: expected sha256 ${expected}, got ${actual}`
    )
    this.name = 'IntegrityError'
  }
}

export class MissingIntegrityError extends Error {
  constructor() {
    super('Marketplace item is missing required sha256 integrity metadata')
    this.name = 'MissingIntegrityError'
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
 *
 * @throws MissingIntegrityError if the registry entry omits `sha256`.
 * @throws IntegrityError if hash does not match.
 */
export async function verifyIntegrity(
  content: string,
  expectedHash: string | undefined
): Promise<void> {
  const normalizedExpected = expectedHash?.toLowerCase().trim()
  if (!normalizedExpected) {
    throw new MissingIntegrityError()
  }

  const actual = await computeSha256(content)

  if (actual !== normalizedExpected) {
    throw new IntegrityError(normalizedExpected, actual)
  }
}
