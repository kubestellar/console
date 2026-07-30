const EXPECTED_OPFS_FALLBACK_PATTERNS = [
  'opfs not available',
  'opfs initialization failed',
  'falling back to indexeddb',
  'opfs sqlite3_vfs',
  'sharedarraybuffer',
  'atomics',
  'secure context',
  'cross-origin isolated',
] as const

function collectErrorText(error: unknown): string[] {
  if (typeof error === 'string') {
    return [error]
  }

  if (error instanceof Error) {
    const parts = [error.name, error.message]
    const cause = 'cause' in error ? (error as Error & { cause?: unknown }).cause : undefined
    return cause === undefined
      ? parts
      : [...parts, ...collectErrorText(cause)]
  }

  if (error && typeof error === 'object') {
    const maybeMessage = 'message' in error && typeof error.message === 'string' ? error.message : null
    const maybeReason = 'reason' in error && typeof error.reason === 'string' ? error.reason : null
    const parts = [maybeMessage, maybeReason].filter((value): value is string => Boolean(value))
    return parts.length > 0 ? parts : [String(error)]
  }

  return [String(error)]
}

export function isExpectedOpfsFallback(error: unknown): boolean {
  const normalizedText = collectErrorText(error).join(' ').toLowerCase()
  return EXPECTED_OPFS_FALLBACK_PATTERNS.some(pattern => normalizedText.includes(pattern))
}

export function logOpfsFallback(message: string, error: unknown): void {
  if (isExpectedOpfsFallback(error)) {
    console.debug(message, error)
    return
  }

  console.warn(message, error)
}
